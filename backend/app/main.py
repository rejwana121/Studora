from fastapi import FastAPI

from app.api.v1 import router as api_v1_router
from app.core.config import settings
from app.core.errors import register_error_handlers

app = FastAPI(title=settings.app_name)

register_error_handlers(app)
app.include_router(api_v1_router, prefix=settings.api_v1_prefix)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
