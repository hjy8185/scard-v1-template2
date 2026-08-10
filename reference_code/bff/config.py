"""BFF configuration — environment variables with defaults."""

from __future__ import annotations

import os


class Settings:
    def __init__(self) -> None:
        self.AGENTCORE_ENDPOINT: str = os.environ.get("AGENTCORE_ENDPOINT", "http://localhost:9000")
        self.NEPTUNE_ENDPOINT: str = os.environ.get("NEPTUNE_ENDPOINT", "http://localhost:8182")
        self.AWS_REGION: str = os.environ.get("AWS_REGION", "us-east-1")
        _port = os.environ.get("BFF_LISTEN_PORT", "8000")
        self.BFF_PORT: int = int(_port) if _port.isdigit() else 8000
        self.SCENARIOS_PATH: str = os.environ.get("SCENARIOS_PATH", "data/scenarios.json")
        # U6 배포 보안 경계 (#6)
        self.ALLOWED_ORIGINS: list[str] = [
            o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "*").split(",") if o.strip()
        ]
        self.RATE_LIMIT_PER_MIN: int = int(os.environ.get("RATE_LIMIT_PER_MIN", "60"))


settings = Settings()
