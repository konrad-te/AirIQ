from __future__ import annotations

from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session

from database import DATABASE_URL, SessionLocal, get_db
from init_db import init_db
from models import CityPoint, GlobeAqCache
from services.city_seed import seed_city_points
from services.globe_ingest import run_globe_ingest


app = FastAPI(title="AirIQ API")
scheduler = BackgroundScheduler(timezone="UTC")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _to_iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


@app.on_event("startup")
def on_startup() -> None:
    init_db()

    if not scheduler.running:
        scheduler.add_job(
            _run_scheduled_ingest,
            trigger=IntervalTrigger(hours=1),
            id="globe_ingest_hourly",
            replace_existing=True,
            max_instances=1,
            coalesce=True,
        )
        scheduler.start()


@app.on_event("shutdown")
def on_shutdown() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)


@app.get("/health")
def health() -> dict:
    return {"ok": True, "database_url": DATABASE_URL}


def _run_scheduled_ingest() -> None:
    db = SessionLocal()
    try:
        run_globe_ingest(db=db, batch_size=40)
    finally:
        db.close()


@app.get("/api/map/markers")
def get_map_markers(db: Session = Depends(get_db)) -> dict:
    stmt = (
        select(CityPoint, GlobeAqCache)
        .outerjoin(GlobeAqCache, GlobeAqCache.city_point_id == CityPoint.id)
        .where(CityPoint.is_active.is_(True))
        .order_by(CityPoint.country_name.asc(), CityPoint.city_name.asc())
    )

    rows = db.execute(stmt).all()
    markers = []

    for city, cache in rows:
        markers.append(
            {
                "city_point_id": city.id,
                "country_code": city.country_code,
                "country_name": city.country_name,
                "city_name": city.city_name,
                "lat": city.lat,
                "lon": city.lon,
                "population": city.population,
                "is_capital": city.is_capital,
                "aq": {
                    "pm25": cache.pm25 if cache else None,
                    "pm10": cache.pm10 if cache else None,
                    "us_aqi": cache.us_aqi if cache else None,
                    "eu_aqi": cache.eu_aqi if cache else None,
                    "band": cache.band if cache else None,
                    "source": cache.source if cache else None,
                    "observed_at": _to_iso(cache.observed_at) if cache else None,
                    "fetched_at": _to_iso(cache.fetched_at) if cache else None,
                    "stale": cache.stale if cache else None,
                },
            }
        )

    return {"count": len(markers), "markers": markers}


@app.post("/api/map/seed-city-points")
def seed_map_city_points(db: Session = Depends(get_db)) -> dict:
    result = seed_city_points(db, per_country=4)
    return {
        "ok": True,
        "total_input_points": result.total_input_points,
        "inserted": result.inserted,
        "updated": result.updated,
        "deactivated": result.deactivated,
    }


@app.post("/api/map/run-ingest")
def run_map_ingest(db: Session = Depends(get_db)) -> dict:
    summary = run_globe_ingest(db=db, batch_size=40)
    return {
        "ok": True,
        "run_id": summary.run_id,
        "total_points": summary.total_points,
        "success_count": summary.success_count,
        "fail_count": summary.fail_count,
    }
