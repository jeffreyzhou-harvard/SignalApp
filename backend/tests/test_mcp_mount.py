from app.main import app


def test_mcp_mounted():
    paths = {getattr(r, "path", None) for r in app.routes}
    assert "/mcp" in paths


def test_health_route_still_present():
    paths = {getattr(r, "path", None) for r in app.routes}
    assert "/health" in paths
