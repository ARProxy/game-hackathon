from fastapi.testclient import TestClient

from app.main import create_app


def test_built_client_is_served_from_same_origin(tmp_path) -> None:
    (tmp_path / "index.html").write_text(
        "<!doctype html><title>얼음, 땡!</title>",
        encoding="utf-8",
    )
    assets = tmp_path / "assets"
    assets.mkdir()
    (assets / "app.js").write_text("console.log('ready')", encoding="utf-8")

    client = TestClient(create_app(tmp_path))

    root_response = client.get("/")
    asset_response = client.get("/assets/app.js")
    health_response = client.get("/health")

    assert root_response.status_code == 200
    assert "얼음, 땡!" in root_response.text
    assert asset_response.status_code == 200
    assert asset_response.text == "console.log('ready')"
    assert health_response.json() == {"status": "ok"}
