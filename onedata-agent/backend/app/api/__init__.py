"""API routers."""

from app.api.chat import router as chat_router
from app.api.graph import router as graph_router
from app.api.catalog import router as catalog_router
from app.api.health import router as health_router

__all__ = ["chat_router", "graph_router", "catalog_router", "health_router"]
