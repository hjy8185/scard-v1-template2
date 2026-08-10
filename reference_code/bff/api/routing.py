"""GET /api/routing/insights — U36 플라이휠 관찰 패널 데이터.

세션 tier 분포 + tier3 반복 패턴(exemplar 승격 후보) + 실제 승격 이력.
read-only: 관찰 요약만 반환, 상태 변경 없음(승격 자체는 코드 리뷰 경로 유지).
"""

from __future__ import annotations

from fastapi import APIRouter

from bff import routing_log

router = APIRouter()


@router.get("/api/routing/insights")
async def routing_insights():
    return routing_log.insights()
