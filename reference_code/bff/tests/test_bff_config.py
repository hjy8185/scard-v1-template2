"""Tests for bff/config.py — BFF settings."""

import os
from unittest.mock import patch


def test_config_defaults():
    with patch.dict(os.environ, {}, clear=True):
        from bff.config import Settings
        s = Settings()
        assert s.AWS_REGION == "us-east-1"
        assert s.BFF_PORT == 8000
        assert s.AGENTCORE_ENDPOINT == "http://localhost:9000"


def test_config_from_env():
    with patch.dict(os.environ, {"AGENTCORE_ENDPOINT": "http://agent:9000", "AWS_REGION": "ap-northeast-2"}, clear=True):
        from bff.config import Settings
        s = Settings()
        assert s.AGENTCORE_ENDPOINT == "http://agent:9000"
        assert s.AWS_REGION == "ap-northeast-2"
