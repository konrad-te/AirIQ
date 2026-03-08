from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Iterable

from sqlalchemy import text

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from database import engine
from init_db import init_db

# We intentionally KEEP:
# - alembic_version
# - data_providers
#
# We clear runtime/application data only.
TABLES_TO_TRUNCATE: list[str] = [
    "household_members",
    "user_preferences",
    "households",
    "users",
    "provider_cache_entries",
    "location_station_cache",
    "geocode_cache_entries",
    "external_stations",
    "globe_aq_cache",
    "ingest_runs",
    "city_points",
]


def _format_table_list(table_names: Iterable[str]) -> str:
    return ", ".join(table_names)


def reset_database_data() -> None:
    init_db()

    truncate_sql = (
        f"TRUNCATE TABLE {_format_table_list(TABLES_TO_TRUNCATE)} "
        "RESTART IDENTITY CASCADE"
    )

    with engine.begin() as connection:
        connection.execute(text(truncate_sql))

        counts = {}
        for table_name in TABLES_TO_TRUNCATE:
            counts[table_name] = connection.execute(
                text(f"SELECT COUNT(*) FROM {table_name}")
            ).scalar_one()

        provider_count = connection.execute(
            text("SELECT COUNT(*) FROM data_providers")
        ).scalar_one()

    print("Database data reset complete.")
    print("Cleared tables:")
    for table_name in TABLES_TO_TRUNCATE:
        print(f"  - {table_name}: {counts[table_name]} rows remaining")

    print(f"Preserved table: data_providers ({provider_count} rows remaining)")
    print("Preserved table: alembic_version")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Reset backend application data while keeping schema and seeded providers."
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Required confirmation flag to perform the reset.",
    )
    args = parser.parse_args()

    if not args.yes:
        print("Refusing to reset database data without confirmation.")
        print("Run: python resets/reset_db_data.py --yes")
        return

    reset_database_data()


if __name__ == "__main__":
    main()