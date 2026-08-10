"""U53 — 데모 시나리오 캐시 워밍 API (UI 버튼용).

사용자 지정: "UI에 데모시나리오에서 사용하는 데이터셋을 캐싱하는 버튼을 만들어줘."

U52가 만든 warm-up(scripts/warm_sql_cache.py)을 발표자가 화면에서 누를 수 있게 한다.
BFF에서 실행하는 이유: Valkey는 VPC 내부에서만 닿고, BFF 역할에 Athena/LF 권한이 있다
(U52에서 부여). 에이전트를 거치지 않으므로 답변 경로에 영향이 없다.

엔드포인트:
  GET  /api/cache/status  — 현재 캐시 상태(키 수·바이트·hit/miss·warm 진행)
  POST /api/cache/warm    — 워밍 시작(백그라운드). 이미 실행 중이면 그 상태를 반환.

원칙:
- **백그라운드 1개만**(동시 실행 금지 — Athena 중복 과금·경합 방지).
- 진행률은 in-memory(부스 데모 스코프 — 재시작 리셋, U36 routing_log 선례).
- 실패한 템플릿은 감추지 않고 목록으로 노출(정직).
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
import time
from pathlib import Path

from fastapi import APIRouter

logger = logging.getLogger(__name__)
router = APIRouter()

# 에이전트 모듈(sql_cache·template_registry·라우터)을 BFF 프로세스에서 재사용.
# 컨테이너 레이아웃: /app/pipeline/... (Dockerfile COPY), 레포: <root>/pipeline
for _cand in (Path("/app/pipeline"), Path(__file__).resolve().parents[2] / "pipeline"):
    if _cand.is_dir() and str(_cand) not in sys.path:
        sys.path.insert(0, str(_cand))

_STATE: dict = {
    "running": False, "started_at": None, "finished_at": None,
    "total": 0, "done": 0, "ok": 0, "failed": [], "last_error": None,
    "elapsed_ms": None,
}


def _cache_stats() -> dict:
    try:
        from agent.sql_cache import stats
        return stats() or {}
    except Exception as e:  # noqa: BLE001
        logger.warning("cache stats unavailable: %s", e)
        return {}


def _athena_exec():
    """캐시 래퍼를 씌운 Athena 실행기 — 런타임과 동일 키 규약."""
    from agent.athena_client import make_athena_exec
    from agent.sql_cache import wrap

    raw = make_athena_exec(
        database=os.environ.get("ATHENA_DATABASE", "glue_db_EXAMPLEENVID"),
        workgroup=os.environ.get("ATHENA_WORKGROUP", "primary"),
        output_s3=os.environ.get("ATHENA_OUTPUT_S3") or None,
        region=os.environ.get("AWS_REGION", "us-west-2"))
    return wrap(raw)


def _targets() -> list[tuple[str, str, dict]]:
    """(라벨, template_id, params) 목록 — 고정 템플릿 + 픽커 시나리오 실 라우팅 결과.

    하드코딩 목록이 아니라 **실제 컴파일러**를 통과시켜 얻는다(런타임과 같은 키 보장).
    """
    out: list[tuple[str, str, dict]] = []
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
        from warm_sql_cache import FIXED_TEMPLATES

        for key, params in FIXED_TEMPLATES.items():
            out.append((key, key.split("::")[0], params))
    except Exception as e:  # noqa: BLE001
        logger.warning("fixed template list unavailable: %s", e)

    try:
        import json

        from agent.chain_sql import set_sql_exec
        from agent.frame_router import FrameRouter
        from agent.queryframe_compiler import compile_frame

        # 라우팅 단계에서 SQL 가용으로 보이게(컴파일러 안전판 통과) — 실행은 아래에서
        set_sql_exec(lambda *a, **k: [])
        router_ = FrameRouter()
        path = Path(__file__).resolve().parents[1] / "data" / "scenarios.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        for cat in data.get("categories", []):
            for q in cat.get("questions", []):
                query = q.get("query") or ""
                if not query:
                    continue
                try:
                    plan = compile_frame(router_.route(query, preset_card_id=q.get("preset_card_id")))
                except Exception:  # noqa: BLE001 — 라우팅 실패 문항은 건너뜀(정직)
                    continue
                for s in plan.steps:
                    if s.tool == "sql_query":
                        out.append((q.get("id") or query[:12], s.action, dict(s.params or {})))
    except Exception as e:  # noqa: BLE001
        logger.warning("scenario targets unavailable: %s", e)

    # 중복 제거(같은 template+params는 한 번만 — 캐시 키가 같다)
    seen, uniq = set(), []
    for label, tid, params in out:
        k = (tid, tuple(sorted((params or {}).items())))
        if k in seen:
            continue
        seen.add(k)
        uniq.append((label, tid, params))
    return uniq


def _warm_blocking() -> None:
    """워밍 본체(스레드에서 실행). 진행 상태를 _STATE에 갱신."""
    from agent.template_registry import get_template, render

    t0 = time.time()
    try:
        exec_fn = _athena_exec()
        targets = _targets()
        _STATE.update(total=len(targets), done=0, ok=0, failed=[], last_error=None)
        for label, tid, params in targets:
            try:
                entry = get_template(tid)
                sql, positional = render(entry, params)
                exec_fn(sql, positional, allowed_tables=entry.allowed_tables,
                        max_rows=entry.max_rows, timeout_ms=entry.timeout_ms)
                _STATE["ok"] += 1
            except Exception as e:  # noqa: BLE001 — 실패는 감추지 않고 목록에
                _STATE["failed"].append({"target": label, "template": tid,
                                         "error": str(e)[:160]})
            finally:
                _STATE["done"] += 1
    except Exception as e:  # noqa: BLE001
        _STATE["last_error"] = str(e)[:200]
        logger.exception("cache warm failed")
    finally:
        _STATE["running"] = False
        _STATE["finished_at"] = time.time()
        _STATE["elapsed_ms"] = int((time.time() - t0) * 1000)


def _snapshot() -> dict:
    s = dict(_STATE)
    s["cache"] = _cache_stats()
    return s


@router.get("/api/cache/status")
async def cache_status():
    return _snapshot()


@router.post("/api/cache/warm")
async def cache_warm():
    if _STATE["running"]:
        return {**_snapshot(), "accepted": False, "reason": "이미 실행 중입니다"}
    _STATE.update(running=True, started_at=time.time(), finished_at=None,
                  elapsed_ms=None, done=0, ok=0, failed=[], last_error=None)
    asyncio.get_running_loop().run_in_executor(None, _warm_blocking)
    return {**_snapshot(), "accepted": True}
