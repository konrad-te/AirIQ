from __future__ import annotations

from database import SessionLocal
from init_db import init_db
from models import CityPoint, GlobeAqCache, IngestRun
from services.bootstrap import ensure_data_providers
from services.city_seed import seed_city_points
from services.globe_ingest import run_globe_ingest


def main() -> None:
    init_db()

    db = SessionLocal()
    try:
        ensure_data_providers(db)

        seed_result = seed_city_points(db, per_country=4)
        print("city_seed:", seed_result)

        summary = run_globe_ingest(db=db, batch_size=40)
        print("run_ingest:", summary)

        city_count = db.query(CityPoint).count()
        cache_count = db.query(GlobeAqCache).count()
        ingest_count = db.query(IngestRun).count()

        print("checks:", {
            "cities": city_count,
            "globe_cache_rows": cache_count,
            "ingest_runs": ingest_count,
        })
    finally:
        db.close()


if __name__ == "__main__":
    main()

