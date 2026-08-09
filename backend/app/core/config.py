from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Backend configuration, read from environment variables.

    No real values are baked in — see backend/.env.example for the
    required placeholder keys.
    """

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Studora API"
    api_v1_prefix: str = "/api/v1"

    database_url: str = "postgresql+psycopg://user:password@localhost:5432/studora"
    supabase_url: str = ""
    supabase_jwt_audience: str = "authenticated"
    # Optional: only needed to keep verifying HS256 tokens issued before this
    # project rotated to its current ES256 signing key. A new project never
    # needs this — ES256/JWKS verification (core/security.py) works without it.
    supabase_legacy_jwt_secret: str = ""

    # Comma-separated browser origins allowed to call this API cross-origin
    # (see app/main.py's CORSMiddleware). Defaults cover local Expo Web dev
    # servers only — a deployed web origin must be added explicitly via the
    # CORS_ORIGINS env var. Never a wildcard: an explicit allowlist is what
    # lets the middleware echo back a single matching Access-Control-Allow-
    # Origin per request instead of admitting every site on the internet.
    cors_origins: str = (
        "http://localhost:8081,http://127.0.0.1:8081,"
        "http://localhost:8082,http://127.0.0.1:8082"
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
