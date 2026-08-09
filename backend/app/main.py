from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import router as api_v1_router
from app.core.config import settings
from app.core.errors import register_error_handlers

app = FastAPI(title=settings.app_name)

# Browser (web) clients enforce CORS; native/mobile HTTP clients don't, which
# is why this was only ever visible from Expo Web. Explicit origin allowlist
# (never "*") + explicit methods/headers — see Settings.cors_origins.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

register_error_handlers(app)
app.include_router(api_v1_router, prefix=settings.api_v1_prefix)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
