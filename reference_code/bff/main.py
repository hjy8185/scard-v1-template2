"""BFF FastAPI application."""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# P3-10: 애플리케이션 로거를 INFO로 (chat timing 로그 등이 stdout에 보이도록)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

from bff.api.chat import router as chat_router
from bff.api.graph import router as graph_router
from bff.api.scenarios import router as scenarios_router
from bff.api.metrics import router as metrics_router
from bff.api.rule import router as rule_router
from bff.api.catalog import router as catalog_router
from bff.api.anatomy import router as anatomy_router
from bff.api.routing import router as routing_router
from bff.api.cache import router as cache_router   # U53: 데모 캐시 워밍(UI 버튼)
from bff.config import settings

app = FastAPI(title="Card GraphRAG BFF", version="0.2.0-u6")

# U6 #6: CORS 제한(기본 *지만 ALLOWED_ORIGINS로 프론트 origin 한정 가능)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# U6 #6: 간단 rate limit (in-memory, per-IP per-minute)
_RATE: dict[str, list[float]] = {}


@app.middleware("http")
async def _rate_limit(request, call_next):
    import time
    ip = request.client.host if request.client else "unknown"
    now = time.time()
    window = _RATE.setdefault(ip, [])
    cutoff = now - 60
    window[:] = [t for t in window if t > cutoff]
    if len(window) >= settings.RATE_LIMIT_PER_MIN:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=429, content={"detail": "rate limit exceeded"})
    window.append(now)
    return await call_next(request)


app.include_router(chat_router)
app.include_router(graph_router)
app.include_router(scenarios_router)
app.include_router(metrics_router)
app.include_router(rule_router)
app.include_router(catalog_router)
app.include_router(anatomy_router)
app.include_router(routing_router)   # U36 플라이휠 관찰
app.include_router(cache_router)     # U53 데모 캐시 워밍


@app.get("/health")
async def health():
    return {"status": "ok"}
