import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.ws.handler import router as ws_router


def create_app(client_dist: str | Path | None = None) -> FastAPI:
    """게임 API와 production 클라이언트를 한 origin에서 제공한다."""
    application = FastAPI(title="얼음땡 Game Server")

    application.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    application.include_router(ws_router)

    @application.get("/health")
    async def health():
        return {"status": "ok"}

    configured_dist = client_dist or os.getenv("GAME_CLIENT_DIST")
    dist_path = (
        Path(configured_dist).expanduser()
        if configured_dist
        else Path(__file__).parents[2] / "client" / "dist"
    ).resolve()
    if (dist_path / "index.html").is_file():
        # WebSocket과 /health를 먼저 등록한 뒤 루트에 정적 앱을 마운트한다.
        # 이 순서로 production 브라우저와 게임 서버가 항상 같은 origin을 쓴다.
        application.mount(
            "/",
            StaticFiles(directory=dist_path, html=True),
            name="client",
        )

    return application


app = create_app()
