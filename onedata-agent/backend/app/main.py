"""Onedata AI Agent - FastAPI application.

Text-to-SQL agent for Shinhan Financial Group's cross-subsidiary data platform.
"""

import logging
import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)

from app.api.chat import router as chat_router
from app.api.graph import router as graph_router
from app.api.catalog import router as catalog_router
from app.api.health import router as health_router
from app.config import settings

app = FastAPI(
    title="Onedata AI Agent",
    description="Text-to-SQL Agent for Shinhan Financial Group Onedata Platform",
    version="1.0.0",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# In-memory rate limiter (per-IP per-minute)
_RATE: dict[str, list[float]] = {}


@app.middleware("http")
async def rate_limit_middleware(request, call_next):
    """Simple in-memory rate limiter per IP per minute."""
    ip = request.client.host if request.client else "unknown"
    now = time.time()
    window = _RATE.setdefault(ip, [])
    cutoff = now - 60
    window[:] = [t for t in window if t > cutoff]
    if len(window) >= settings.RATE_LIMIT_PER_MIN:
        return JSONResponse(
            status_code=429,
            content={"detail": "Rate limit exceeded. Please try again later."},
        )
    window.append(now)
    return await call_next(request)


# Include routers
app.include_router(health_router)
app.include_router(chat_router)
app.include_router(graph_router)
app.include_router(catalog_router)


@app.on_event("startup")
async def startup_event():
    """Initialize services on application startup."""
    logger = logging.getLogger(__name__)
    logger.info("Starting Onedata AI Agent (region=%s, db=%s)",
                settings.AWS_REGION, settings.ATHENA_DATABASE)

    # Pre-load ontology from cache for fast first-request response
    from app.ontology.loader import OntologyLoader
    from app.ontology.mapper import OntologyMapper

    try:
        loader = OntologyLoader()
        loader.load_from_cache()
        mapper = OntologyMapper()
        mapper.load_synonyms()
        logger.info("Ontology pre-loaded successfully")
    except Exception as e:
        logger.warning("Ontology pre-load failed (will retry on first request): %s", e)
