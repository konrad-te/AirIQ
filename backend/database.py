from __future__ import annotations

import os
from typing import Generator

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

load_dotenv()


def get_database_url() -> str:
    """
    Default to local SQLite for development.
    Switch to PostgreSQL on AWS RDS by setting DATABASE_URL in .env.
    Example:
      postgresql+psycopg://user:password@host:5432/airiq
    """
    return os.getenv("DATABASE_URL", "sqlite:///./airiq.db")


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
