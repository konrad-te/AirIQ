from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config

from database import DATABASE_URL


def init_db() -> None:
    # Alembic uses configparser; percent signs must be escaped to avoid interpolation
    # errors when passwords contain URL-encoded symbols (e.g. %21).
    safe_db_url = DATABASE_URL.replace("%", "%%")

    here = Path(__file__).resolve().parent
    config = Config(str(here / "alembic.ini"))
    config.set_main_option("script_location", str(here / "alembic"))
    config.set_main_option("sqlalchemy.url", safe_db_url)
    command.upgrade(config, "head")


if __name__ == "__main__":
    init_db()
    print("Database tables created.")
