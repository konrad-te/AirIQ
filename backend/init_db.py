from __future__ import annotations

from backend.database import engine
from sqlalchemy import inspect, text

REQUIRED_TABLES = {
    "users",
    "user_sessions",
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
            "Database is not initialized with Alembic. Missing table: alembic_version."
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
        raise RuntimeError("alembic_version exists but no current revision was found.")


if __name__ == "__main__":
    init_db()
    print("Database schema check passed.")
