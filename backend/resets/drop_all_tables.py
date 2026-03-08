from __future__ import annotations

import argparse
import sys
from pathlib import Path

from sqlalchemy import MetaData, inspect

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from database import engine


def drop_all_tables() -> None:
    inspector = inspect(engine)
    table_names = inspector.get_table_names()

    if not table_names:
        print("No tables found. Database schema is already empty.")
        return

    print("Dropping tables:")
    for table_name in sorted(table_names):
        print(f"  - {table_name}")

    metadata = MetaData()
    metadata.reflect(bind=engine)

    with engine.begin() as connection:
        metadata.drop_all(bind=connection)

    remaining_tables = inspect(engine).get_table_names()

    print("Drop complete.")
    if remaining_tables:
        print("Warning: some tables still remain:")
        for table_name in sorted(remaining_tables):
            print(f"  - {table_name}")
    else:
        print("All tables removed successfully.")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Drop all tables in the current database while keeping the database itself."
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Required confirmation flag to perform the drop.",
    )
    args = parser.parse_args()

    if not args.yes:
        print("Refusing to drop all tables without confirmation.")
        print("Run: python resets/drop_all_tables.py --yes")
        return

    drop_all_tables()


if __name__ == "__main__":
    main()