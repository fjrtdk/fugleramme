"""Application settings. JWT secret is read from $JWT_SECRET or auto-generated
and persisted to .jwt_secret so restarts stay valid."""

import os
import secrets
from pathlib import Path


def _load_or_create_jwt_secret() -> str:
    env_val = os.getenv("JWT_SECRET")
    if env_val:
        return env_val
    secret_file = Path(".jwt_secret")
    if secret_file.exists():
        val = secret_file.read_text().strip()
        if val:
            return val
    secret = secrets.token_hex(32)
    try:
        secret_file.write_text(secret)
    except OSError:
        pass
    return secret


class Settings:
    jwt_secret: str = _load_or_create_jwt_secret()
    jwt_algorithm: str = "HS256"
    jwt_expire_hours: int = int(os.getenv("JWT_EXPIRE_HOURS", "24"))
    database_path: str = os.getenv("DATABASE_PATH", "fugleramme.db")
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:8080",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:8080",
    ]
    environment: str = os.getenv("ENVIRONMENT", "development")

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


settings = Settings()
