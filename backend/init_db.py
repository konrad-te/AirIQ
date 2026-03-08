from __future__ import annotations

<<<<<<< HEAD
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
=======
from sqlalchemy import inspect, text

from database import engine

REQUIRED_TABLES = {
    "users",
    "households",
    "household_members",
    "user_preferences",
    "data_providers",
    "city_points",
    "globe_aq_cache",
    "external_stations",
    "geocode_cache_entries",
    "location_station_cache",
    "provider_cache_entries",
    "ingest_runs",
}


def init_db() -> None:
    """
    Read-only startup check.

    Alembic is the source of truth for schema creation.
    This function only verifies that migrations appear to have been applied.
    """
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    if "alembic_version" not in existing_tables:
        raise RuntimeError(
            "Database is not initialized with Alembic. "
            "Missing table: alembic_version."
        )

    missing_tables = sorted(REQUIRED_TABLES - existing_tables)
    if missing_tables:
        raise RuntimeError(
            "Database schema is incomplete. "
            f"Missing tables: {', '.join(missing_tables)}"
        )

    with engine.connect() as connection:
        current_revision = connection.execute(
            text("SELECT version_num FROM alembic_version")
        ).scalar_one_or_none()

    if not current_revision:
        raise RuntimeError(
            "alembic_version exists but no current revision was found."
        )
>>>>>>> database-implementation-2


if __name__ == "__main__":
    init_db()
    print("Database schema check passed.")