"""BFF test configuration."""

import pytest


def pytest_collection_modifyitems(items):
    """Auto-mark async tests."""
    for item in items:
        if item.get_closest_marker("asyncio") is None:
            if hasattr(item, "function") and hasattr(item.function, "__wrapped__"):
                pass
