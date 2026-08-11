"""Application configuration - environment variables with defaults."""

from __future__ import annotations

import os


class Settings:
    """Settings loaded from environment variables with sensible defaults."""

    def __init__(self) -> None:
        # AWS
        self.AWS_REGION: str = os.environ.get("AWS_REGION", "ap-northeast-1")
        self.ATHENA_REGION: str = os.environ.get("ATHENA_REGION", "ap-northeast-2")
        self.BEDROCK_REGION: str = os.environ.get("BEDROCK_REGION", "us-west-2")

        # Neptune Graph DB
        self.NEPTUNE_ENDPOINT: str = os.environ.get(
            "NEPTUNE_ENDPOINT", "https://localhost:8182"
        )

        # OpenSearch
        self.OPENSEARCH_ENDPOINT: str = os.environ.get(
            "OPENSEARCH_ENDPOINT", "https://localhost:9200"
        )
        self.OPENSEARCH_INDEX: str = os.environ.get(
            "OPENSEARCH_INDEX", "onedata-ontology"
        )

        # Athena
        self.ATHENA_DATABASE: str = os.environ.get("ATHENA_DATABASE", "ai_ready_v3")
        self.ATHENA_OUTPUT_BUCKET: str = os.environ.get(
            "ATHENA_OUTPUT_BUCKET", "s3://scard-aiready-poc-124962528632/athena-results/"
        )
        self.ATHENA_WORKGROUP: str = os.environ.get("ATHENA_WORKGROUP", "primary")
        self.ATHENA_TIMEOUT_SECONDS: int = int(
            os.environ.get("ATHENA_TIMEOUT_SECONDS", "30")
        )
        self.ATHENA_MAX_ROWS: int = int(os.environ.get("ATHENA_MAX_ROWS", "1000"))

        # Bedrock
        self.BEDROCK_MODEL_ID: str = os.environ.get(
            "BEDROCK_MODEL_ID", "us.anthropic.claude-haiku-4-5-20251001-v1:0"
        )
        self.BEDROCK_MAX_TOKENS: int = int(
            os.environ.get("BEDROCK_MAX_TOKENS", "4096")
        )

        # App
        self.APP_PORT: int = int(os.environ.get("APP_PORT", "8000"))
        self.ALLOWED_ORIGINS: list[str] = [
            o.strip()
            for o in os.environ.get("ALLOWED_ORIGINS", "*").split(",")
            if o.strip()
        ]
        self.RATE_LIMIT_PER_MIN: int = int(
            os.environ.get("RATE_LIMIT_PER_MIN", "60")
        )

        # Data paths
        self.ONTOLOGY_CACHE_PATH: str = os.environ.get(
            "ONTOLOGY_CACHE_PATH", "data/ontology_cache.json"
        )
        self.TABLE_METADATA_PATH: str = os.environ.get(
            "TABLE_METADATA_PATH", "data/table_metadata.json"
        )
        self.SYNONYMS_PATH: str = os.environ.get(
            "SYNONYMS_PATH", "data/synonyms.json"
        )

        # Safety
        self.SQL_READ_ONLY: bool = os.environ.get("SQL_READ_ONLY", "true").lower() == "true"
        self.SQL_ROW_LIMIT: int = int(os.environ.get("SQL_ROW_LIMIT", "1000"))


settings = Settings()
