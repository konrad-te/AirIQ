from __future__ import annotations

from database import SessionLocal
from init_db import init_db
from services.globe_ingest import run_globe_ingest


def run_ingest() -> None:
    init_db()
    db = SessionLocal()
    try:
        summary = run_globe_ingest(db=db, batch_size=40)
        print(
            "Ingest complete:",
            {
                "run_id": summary.run_id,
                "total_points": summary.total_points,
                "success_count": summary.success_count,
                "fail_count": summary.fail_count,
            },
        )
    finally:
        db.close()


if __name__ == "__main__":
    run_ingest()
