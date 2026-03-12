from __future__ import annotations

from backend.database import engine
from backend.models import Base


def init_db() -> None:
    Base.metadata.create_all(bind=engine)


if __name__ == "__main__":
    init_db()
    print("Database tables created.")
