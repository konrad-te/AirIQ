from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Generator

from dotenv import dotenv_values, load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL
from sqlalchemy.orm import Session, sessionmaker

BACKEND_DIR = Path(__file__).resolve().parent
ENV_PATH = BACKEND_DIR / ".env"

if ENV_PATH.exists():
    load_dotenv(dotenv_path=ENV_PATH, override=False)
    # If the process environment has FIELD_ENCRYPTION_KEY missing or empty (e.g. systemd sets
    # `Environment=FIELD_ENCRYPTION_KEY=` or Docker passes an empty value), override=False leaves it
    # blank and Qingping connect fails. Pull this one variable from the file when needed.
    if not (os.getenv("FIELD_ENCRYPTION_KEY") or "").strip():
        file_vals = dotenv_values(ENV_PATH)
        fk = (file_vals.get("FIELD_ENCRYPTION_KEY") or "").strip()
        if fk:
            os.environ["FIELD_ENCRYPTION_KEY"] = fk


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