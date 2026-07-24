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


settings = Settings()
