from __future__ import annotations

from backend.database import SessionLocal
from backend.init_db import init_db
from backend.services.city_seed import seed_city_points



def run_seed(per_country: int = 4) -> None:
    init_db()

    db = SessionLocal()
    try:
        result = seed_city_points(db=db, per_country=per_country)
        print(
            "City seed complete:",
            {
                "total_input_points": result.total_input_points,
                "inserted": result.inserted,
                "updated": result.updated,
                "deactivated": result.deactivated,
            },
        )
    finally:
        db.close()


if __name__ == "__main__":
    run_seed(per_country=4)
