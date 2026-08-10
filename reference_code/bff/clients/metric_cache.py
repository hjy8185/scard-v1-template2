"""U22 B1 — BFF Valkey metric reader (read-only, degrade-first).

compare 인사이트(시장 vs 자사)의 프로덕션 도달 수리: build_insights의 compare 조건
(market+metric 공존)이 성립하는 plan이 없으므로, market by_age 답변 시 BFF가
세그먼트 metric 값을 Valkey에서 직접 곁들인다(에이전트 무변경).

warm_cache가 적재한 그룹바이 key(metric:{name}:segment_type={type})를 그대로 읽음.
연결 실패/미설정/키 없음 → None (compare 카드만 생략, 답변 무영향).
"""

from __future__ import annotations

import json
import logging
import os
import time

logger = logging.getLogger(__name__)

_client = None
_client_failed_at: float = 0.0
_CACHE: dict[str, tuple[float, list | None]] = {}
_TTL_SEC = 600           # warm_cache 12h 주기 재적재 — 10분 인프로세스 캐시면 충분
_RETRY_SEC = 300         # 연결 실패 시 5분간 재시도 안 함(답변 경로 지연 방지)


def _connect():
    global _client, _client_failed_at
    if _client is not None:
        return _client
    if time.time() - _client_failed_at < _RETRY_SEC:
        return None
    endpoint = os.environ.get("CACHE_ENDPOINT", "")
    if not endpoint:
        return None
    try:
        import redis
        _client = redis.Redis(
            host=endpoint, port=int(os.environ.get("CACHE_PORT", "6379")),
            decode_responses=True, socket_timeout=1, socket_connect_timeout=1,
            ssl=True, ssl_cert_reqs=None)
        return _client
    except Exception as e:  # noqa: BLE001
        logger.warning("metric cache connect fail: %s", e)
        _client_failed_at = time.time()
        return None


def fetch_segment_metric(metric: str = "effective_reward_rate",
                         segment_type: str = "age_band") -> list[dict] | None:
    """세그먼트 그룹바이 값 조회 → [{dimensions:{age_band:v}, value}] (warm_cache 키 규약).

    dimensions는 {segment_type: segment_value} 1축으로 재래핑(build_insights compare의
    axis 추출과 정합). 미가용 시 None.
    """
    ck = f"metric:{metric}:segment_type={segment_type}"
    now = time.time()
    hit = _CACHE.get(ck)
    if hit and now - hit[0] < _TTL_SEC:
        return hit[1]
    client = _connect()
    if client is None:
        return None
    rows = None
    try:
        raw = client.get(ck)
        if raw:
            data = json.loads(raw)
            rows = []
            for d in data:
                dims = d.get("dimensions") or {}
                sv = dims.get("segment_value")
                if sv is not None:
                    rows.append({"dimensions": {segment_type: str(sv)}, "value": d.get("value")})
            rows = rows or None
    except Exception as e:  # noqa: BLE001
        logger.warning("metric cache read fail (%s): %s", ck, e)
        global _client, _client_failed_at
        _client = None
        _client_failed_at = time.time()
        rows = None
    _CACHE[ck] = (now, rows)
    return rows
