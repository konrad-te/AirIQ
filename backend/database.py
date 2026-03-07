from __future__ import annotations

import os
from urllib.parse import quote_plus
from typing import Generator

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

load_dotenv()


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


DATABASE_URL = get_database_url()

engine = create_engine(
    DATABASE_URL,
    echo=False,
    future=True,
    pool_pre_ping=True,
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
