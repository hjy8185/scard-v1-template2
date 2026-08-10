"""GET /api/catalog — U13 SMUS 거버넌스 뱃지 소스.

DataZone(SMUS) search-listings(GlueTable) + search(GLOSSARY_TERM) 조회.
- 진실 소스 아님(지도 내용은 프론트 로컬). "이 자산이 카탈로그에 등록됨" 증거 뱃지 전용.
- degrade: 실패/타임아웃 → 200 빈 결과(프론트 뱃지 생략 G4). 5xx 금지.
- TTL 인메모리 캐시(replica별 독립 수용). timeout 2s/3s/retries1(콜드 로드 매달림 방지).
- snapshotDate = listing updatedAt 우선, 없으면 createdAt fallback(실측: 현재 updatedAt None).
"""

from __future__ import annotations

import logging
import os
import time

import boto3
from botocore.config import Config
from fastapi import APIRouter

logger = logging.getLogger(__name__)
router = APIRouter()

_DOMAIN_ID = os.environ.get("SMUS_DOMAIN_ID", "")
_REGION = os.environ.get("AWS_REGION", "us-west-2")
_TTL_SEC = int(os.environ.get("CATALOG_TTL_SEC", "600"))

_BOTO_CFG = Config(connect_timeout=2, read_timeout=3, retries={"max_attempts": 1})
_cache: dict | None = None
_cache_ts: float = 0.0
_client = None


def _dz():
    global _client
    if _client is None:
        _client = boto3.client("datazone", region_name=_REGION, config=_BOTO_CFG)
    return _client


def _now() -> float:
    return time.monotonic()


def _fetch() -> dict:
    """DataZone 실조회. 실패 시 예외 → 호출부에서 빈 결과."""
    dz = _dz()
    assets: list[str] = []
    latest: str | None = None
    # GlueTable 자산 listing
    resp = dz.search_listings(
        domainIdentifier=_DOMAIN_ID, maxResults=50,
        filters={"filter": {"attribute": "typeName", "value": "GlueTableAssetType"}},
    )
    for item in resp.get("items", []):
        al = item.get("assetListing") or {}
        name = al.get("name")
        if name:
            assets.append(name)
        # snapshotDate: updatedAt 우선, 없으면 createdAt fallback
        ts = al.get("listingUpdatedTimestamp") or al.get("updatedAt") or al.get("createdAt")
        iso = ts.isoformat() if hasattr(ts, "isoformat") else (str(ts) if ts else None)
        if iso and (latest is None or iso > latest):
            latest = iso
    # glossary term — U19 R3: 이름만이 아니라 정의(shortDescription)까지 수집.
    # enrich_catalog가 SMUS 정의를 실시간으로 답변 annotation에 실을 수 있는 원천.
    terms: list[str] = []
    term_defs: dict[str, dict] = {}
    tresp = dz.search(domainIdentifier=_DOMAIN_ID, searchScope="GLOSSARY_TERM", maxResults=50)
    for item in tresp.get("items", []):
        gt = item.get("glossaryTermItem") or {}
        if gt.get("name"):
            terms.append(gt["name"])
            term_defs[gt["name"]] = {
                "name": gt["name"],
                "definition": gt.get("shortDescription") or "",
                "owning_project": "SMUS glossary",
            }
    return {"assets": assets, "terms": terms, "term_defs": term_defs, "snapshotDate": latest}


_EMPTY = {"assets": [], "terms": [], "term_defs": {}, "snapshotDate": None}


@router.get("/api/catalog")
def catalog() -> dict:
    global _cache, _cache_ts
    if not _DOMAIN_ID:
        return _EMPTY  # 미설정 → 뱃지 생략(degrade)
    if _cache is not None and (_now() - _cache_ts) < _TTL_SEC:
        return _cache
    try:
        result = _fetch()
        _cache = result
        _cache_ts = _now()
        return result
    except Exception as e:  # noqa: BLE001
        logger.warning("catalog fetch failed (badge omitted): %s: %s", type(e).__name__, e)
        return _EMPTY


def cached_term_lookup(name: str) -> dict | None:
    """U19 R3: enrich_catalog용 SMUS term 정의 조회 — catalog() TTL 캐시 재사용(추가 API 호출 없음).
    캐시 미형성/미등록 → None(호출부 degrade)."""
    data = catalog()
    return (data.get("term_defs") or {}).get(name)
