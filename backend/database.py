from __future__ import annotations

import os
<<<<<<< HEAD
from urllib.parse import quote_plus
from typing import Generator
=======
from pathlib import Path
from typing import Any, Generator
>>>>>>> database-implementation-2

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL
from sqlalchemy.orm import Session, sessionmaker

BACKEND_DIR = Path(__file__).resolve().parent
ENV_PATH = BACKEND_DIR / ".env"

if ENV_PATH.exists():
    load_dotenv(dotenv_path=ENV_PATH, override=False)


<<<<<<< HEAD
def get_database_url() -> str:
    explicit = os.getenv("DATABASE_URL")
    if explicit:
        return explicit.strip()

    host = os.getenv("DB_HOST")
    db_name = os.getenv("DB_NAME") or os.getenv("DATABASE_NAME")
    db_user = os.getenv("DB_USER") or os.getenv("DATABASE_USER")
    db_password = os.getenv("DB_PASSWORD") or os.getenv("DATABASE_PASSWORD") or ""
    db_port = os.getenv("DB_PORT", "5432")
    sslmode = os.getenv("DB_SSLMODE", "require")

    if host and db_name and db_user:
        password = quote_plus(db_password)
        return (
            f"postgresql+psycopg://{db_user}:{password}"
            f"@{host}:{db_port}/{db_name}?sslmode={sslmode}"
        )

    raise RuntimeError(
        "DATABASE_URL is not set and DB_* vars are incomplete. Configure "
        "a PostgreSQL URL (DATABASE_URL or DB_HOST/DB_NAME/DB_USER)."
    )
=======
def _get_required_env(name: str) -> str:
    value = os.getenv(name)

    if value is None:
        raise RuntimeError(
            f"Missing required environment variable: {name}. "
            f"Expected .env at: {ENV_PATH}"
        )

    value = value.strip()
    if not value:
        raise RuntimeError(f"Environment variable {name} is empty")

    return value
>>>>>>> database-implementation-2


def _get_int_env(name: str, default: int | None = None) -> int:
    raw = os.getenv(name)

    if raw is None or not raw.strip():
        if default is None:
            raise RuntimeError(f"Missing required integer environment variable: {name}")
        return default

    try:
        return int(raw.strip())
    except ValueError as exc:
        raise RuntimeError(f"Environment variable {name} must be an integer") from exc


def build_database_url() -> URL:
    host = _get_required_env("DB_HOST")
    port = _get_int_env("DB_PORT", default=5432)
    database = _get_required_env("DB_NAME")
    username = _get_required_env("DB_USER")
    password = _get_required_env("DB_PASSWORD")
    sslmode = os.getenv("DB_SSLMODE", "require").strip() or "require"

    return URL.create(
        drivername="postgresql+psycopg",
        username=username,
        password=password,
        host=host,
        port=port,
        database=database,
        query={"sslmode": sslmode},
    )


def debug_environment() -> dict[str, Any]:
    return {
        "backend_dir": str(BACKEND_DIR),
        "env_path": str(ENV_PATH),
        "env_file_exists": ENV_PATH.exists(),
        "db_host": os.getenv("DB_HOST"),
        "db_port": os.getenv("DB_PORT"),
        "db_name": os.getenv("DB_NAME"),
        "db_user": os.getenv("DB_USER"),
        "db_sslmode": os.getenv("DB_SSLMODE"),
        "db_password_set": bool(os.getenv("DB_PASSWORD")),
    }


DATABASE_URL_OBJECT = build_database_url()
DATABASE_URL = DATABASE_URL_OBJECT.render_as_string(hide_password=False)
DATABASE_URL_SAFE = DATABASE_URL_OBJECT.render_as_string(hide_password=True)

engine = create_engine(
    DATABASE_URL_OBJECT,
    echo=os.getenv("SQLALCHEMY_ECHO", "0") == "1",
    future=True,
    pool_pre_ping=True,
    pool_size=_get_int_env("DB_POOL_SIZE", default=5),
    max_overflow=_get_int_env("DB_MAX_OVERFLOW", default=10),
    pool_recycle=_get_int_env("DB_POOL_RECYCLE", default=1800),
)

SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
    class_=Session,
)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def test_database_connection() -> dict[str, Any]:
    with engine.connect() as connection:
        row = connection.execute(
            text(
                """
                SELECT
                    current_database() AS database_name,
                    current_user AS current_user,
                    inet_server_addr()::text AS server_address,
                    inet_server_port() AS server_port
                """
            )
        ).mappings().one()

    return {
        "env_path": str(ENV_PATH),
        "database_url_safe": DATABASE_URL_SAFE,
        "database_name": row["database_name"],
        "current_user": row["current_user"],
        "server_address": row["server_address"],
        "server_port": row["server_port"],
    }