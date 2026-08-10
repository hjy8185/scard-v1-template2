"""Tests for bff/main.py — FastAPI app setup."""

from httpx import AsyncClient, ASGITransport


async def test_health_check():
    from bff.main import app
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"
