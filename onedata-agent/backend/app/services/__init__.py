"""Service clients for external dependencies."""

from app.services.neptune_client import NeptuneClient
from app.services.opensearch_client import OpenSearchClient
from app.services.athena_client import AthenaClient
from app.services.bedrock_client import BedrockClient

__all__ = [
    "NeptuneClient",
    "OpenSearchClient",
    "AthenaClient",
    "BedrockClient",
]
