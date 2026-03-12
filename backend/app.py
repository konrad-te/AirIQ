from __future__ import annotations

import os
from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.database import SessionLocal, get_db
from backend.init_db import init_db
from backend.models import CityPoint, GlobeAqCache
from backend.services.city_seed import seed_city_points
from backend.services.globe_ingest import run_globe_ingest
from backend.main import get_air_quality_data, get_lat_lon_nominatim_cached




app = FastAPI(title="AirIQ API")
scheduler = BackgroundScheduler(timezone="UTC")

cors_origins = os.getenv("CORS_ORIGINS") or "http://localhost:5173,http://127.0.0.1:5173"
allowed_origins = [origin.strip() for origin in cors_origins.split(",") if origin.strip()]



app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
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
    return {"ok": True}


@app.get("/api/air-quality")
def get_air_quality(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
) -> dict:
    try:
        return get_air_quality_data(lat, lon)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Air quality fetch failed: {exc}")


@app.get("/api/geocode")
def geocode_address(address: str = Query(..., min_length=3)) -> dict:
    coords = get_lat_lon_nominatim_cached(address)
    if coords is None:
        raise HTTPException(status_code=404, detail="Address not found.")

    lat, lon = coords
    return {"address": address, "lat": lat, "lon": lon}



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
