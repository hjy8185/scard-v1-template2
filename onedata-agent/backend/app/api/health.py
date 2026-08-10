"""Health check endpoint.

Reports the health status of the application and its dependencies.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter

from app.config import settings
from app.models.schemas import HealthResponse

logger = logging.getLogger(__name__)
router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Basic health check - returns immediately without testing dependencies."""
    return HealthResponse(
        status="ok",
        version="1.0.0",
        services={},
    )


@router.get("/health/detailed")
async def detailed_health_check() -> dict:
    """Detailed health check - tests all service dependencies."""
    from app.services.neptune_client import NeptuneClient
    from app.services.opensearch_client import OpenSearchClient
    from app.services.athena_client import AthenaClient
    from app.services.bedrock_client import BedrockClient

    services = {}
    overall_healthy = True

    # Neptune
    try:
        neptune = NeptuneClient()
        neptune_ok = await neptune.health_check()
        services["neptune"] = "healthy" if neptune_ok else "degraded"
        if not neptune_ok:
            overall_healthy = False
    except Exception as e:
        services["neptune"] = f"unhealthy: {e}"
        overall_healthy = False

    # OpenSearch
    try:
        opensearch = OpenSearchClient()
        os_ok = await opensearch.health_check()
        services["opensearch"] = "healthy" if os_ok else "degraded"
        if not os_ok:
            overall_healthy = False
    except Exception as e:
        services["opensearch"] = f"unhealthy: {e}"
        overall_healthy = False

    # Athena
    try:
        athena = AthenaClient()
        athena_ok = await athena.health_check()
        services["athena"] = "healthy" if athena_ok else "degraded"
        if not athena_ok:
            overall_healthy = False
    except Exception as e:
        services["athena"] = f"unhealthy: {e}"
        overall_healthy = False

    # Bedrock
    try:
        bedrock = BedrockClient()
        bedrock_ok = await bedrock.health_check()
        services["bedrock"] = "healthy" if bedrock_ok else "degraded"
        if not bedrock_ok:
            overall_healthy = False
    except Exception as e:
        services["bedrock"] = f"unhealthy: {e}"
        overall_healthy = False

    return {
        "status": "ok" if overall_healthy else "degraded",
        "version": "1.0.0",
        "region": settings.AWS_REGION,
        "database": settings.ATHENA_DATABASE,
        "services": services,
    }
