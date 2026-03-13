from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from database import SessionLocal, get_db
from dependencies.authorization import (
    get_household_membership,
    require_household_role,
)
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from init_db import init_db
from models import (
    CityPoint,
    DataProvider,
    ExternalStation,
    GeocodeCacheEntry,
    GlobeAqCache,
    HouseholdMember,
    IngestRun,
    LocationStationCache,
    ProviderCacheEntry,
    User,
)
from routers.auth import router as auth_router
from routers.households import router as households_router
from security import get_current_user
from services.city_seed import seed_city_points
from services.globe_ingest import run_globe_ingest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

app = FastAPI(title="AirIQ API")
scheduler = BackgroundScheduler(timezone="UTC")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(households_router)


def _to_iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _to_float(value: Decimal | float | int | None) -> float | None:
    if value is None:
        return None
    return float(value)


def _serialize_ingest_run(run: IngestRun) -> dict:
    return {
        "id": run.id,
        "provider_id": run.provider_id,
        "job_name": run.job_name,
        "triggered_by": run.triggered_by,
        "started_at": _to_iso(run.started_at),
        "finished_at": _to_iso(run.finished_at),
        "status": run.status,
        "total_points": run.total_points,
        "success_count": run.success_count,
        "fail_count": run.fail_count,
        "notes": run.notes,
    }


@app.on_event("startup")
def on_startup() -> None:
    init_db()
    db = SessionLocal()
    try:
        from services.bootstrap import ensure_data_providers

        ensure_data_providers(db)
    finally:
        db.close()

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
    return {
        "ok": True,
        "scheduler_running": scheduler.running,
    }


def _run_scheduled_ingest() -> None:
    db = SessionLocal()
    try:
        run_globe_ingest(
            db=db,
            batch_size=40,
            triggered_by="scheduler",
        )
    finally:
        db.close()


@app.get("/api/map/markers")
def get_map_markers(db: Session = Depends(get_db)) -> dict:
    stmt = (
        select(CityPoint, GlobeAqCache, DataProvider)
        .outerjoin(GlobeAqCache, GlobeAqCache.city_point_id == CityPoint.id)
        .outerjoin(DataProvider, DataProvider.id == GlobeAqCache.provider_id)
        .where(CityPoint.is_active.is_(True))
        .order_by(CityPoint.country_name.asc(), CityPoint.city_name.asc())
    )

    rows = db.execute(stmt).all()
    markers = []

    for city, cache, provider in rows:
        markers.append(
            {
                "city_point_id": city.id,
                "country_code": city.country_code,
                "country_name": city.country_name,
                "city_name": city.city_name,
                "lat": _to_float(city.lat),
                "lon": _to_float(city.lon),
                "population": city.population,
                "is_capital": city.is_capital,
                "aq": {
                    "provider_id": cache.provider_id if cache else None,
                    "source": provider.provider_code if provider else None,
                    "provider_name": provider.display_name if provider else None,
                    "pm25": _to_float(cache.pm25) if cache else None,
                    "pm10": _to_float(cache.pm10) if cache else None,
                    "us_aqi": cache.us_aqi if cache else None,
                    "eu_aqi": cache.eu_aqi if cache else None,
                    "band": cache.band if cache else None,
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
    summary = run_globe_ingest(
        db=db,
        batch_size=40,
        triggered_by="manual",
    )
    return {
        "ok": True,
        "run_id": summary.run_id,
        "total_points": summary.total_points,
        "success_count": summary.success_count,
        "fail_count": summary.fail_count,
    }


@app.get("/api/admin/providers")
def get_admin_providers(db: Session = Depends(get_db)) -> dict:
    providers = (
        db.execute(select(DataProvider).order_by(DataProvider.provider_code.asc()))
        .scalars()
        .all()
    )

    return {
        "count": len(providers),
        "providers": [
            {
                "id": provider.id,
                "provider_code": provider.provider_code,
                "display_name": provider.display_name,
                "base_url": provider.base_url,
                "auth_type": provider.auth_type,
                "is_active": provider.is_active,
                "default_timeout_ms": provider.default_timeout_ms,
                "created_at": _to_iso(provider.created_at),
                "updated_at": _to_iso(provider.updated_at),
            }
            for provider in providers
        ],
    }


@app.get("/api/admin/ingest-runs/latest")
def get_latest_ingest_runs(limit: int = 10, db: Session = Depends(get_db)) -> dict:
    safe_limit = max(1, min(limit, 50))

    rows = db.execute(
        select(IngestRun, DataProvider)
        .join(DataProvider, DataProvider.id == IngestRun.provider_id)
        .order_by(IngestRun.id.desc())
        .limit(safe_limit)
    ).all()

    runs = []
    for run, provider in rows:
        runs.append(
            {
                **_serialize_ingest_run(run),
                "provider_code": provider.provider_code,
                "provider_name": provider.display_name,
            }
        )

    return {
        "count": len(runs),
        "runs": runs,
    }


@app.get("/api/admin/debug-overview")
def get_admin_debug_overview(db: Session = Depends(get_db)) -> dict:
    provider_count = db.execute(select(func.count(DataProvider.id))).scalar_one()
    city_point_count = db.execute(select(func.count(CityPoint.id))).scalar_one()
    globe_cache_count = db.execute(
        select(func.count(GlobeAqCache.city_point_id))
    ).scalar_one()
    provider_cache_count = db.execute(
        select(func.count(ProviderCacheEntry.id))
    ).scalar_one()
    geocode_cache_count = db.execute(
        select(func.count(GeocodeCacheEntry.id))
    ).scalar_one()
    external_station_count = db.execute(
        select(func.count(ExternalStation.id))
    ).scalar_one()
    location_station_cache_count = db.execute(
        select(func.count(LocationStationCache.id))
    ).scalar_one()

    latest_runs = db.execute(
        select(IngestRun, DataProvider)
        .join(DataProvider, DataProvider.id == IngestRun.provider_id)
        .order_by(IngestRun.id.desc())
        .limit(5)
    ).all()

    latest_runs_payload = []
    for run, provider in latest_runs:
        latest_runs_payload.append(
            {
                **_serialize_ingest_run(run),
                "provider_code": provider.provider_code,
                "provider_name": provider.display_name,
            }
        )

    return {
        "ok": True,
        "scheduler_running": scheduler.running,
        "counts": {
            "providers": provider_count,
            "city_points": city_point_count,
            "globe_aq_cache": globe_cache_count,
            "provider_cache_entries": provider_cache_count,
            "geocode_cache_entries": geocode_cache_count,
            "external_stations": external_station_count,
            "location_station_cache": location_station_cache_count,
        },
        "latest_ingest_runs": latest_runs_payload,
    }


@app.get("/api/auth/protected-test")
def protected_test(current_user: User = Depends(get_current_user)) -> dict:
    return {
        "ok": True,
        "user_id": current_user.id,
        "email": current_user.email,
        "display_name": current_user.display_name,
    }


@app.get("/api/auth/households/{household_id}/membership-test")
def membership_test(
    membership: HouseholdMember = Depends(get_household_membership),
    current_user: User = Depends(get_current_user),
) -> dict:
    return {
        "ok": True,
        "user_id": current_user.id,
        "household_id": membership.household_id,
        "role": membership.role,
        "is_active": membership.is_active,
    }


@app.get("/api/auth/households/{household_id}/admin-test")
def household_admin_test(
    membership: HouseholdMember = Depends(require_household_role("owner", "admin")),
    current_user: User = Depends(get_current_user),
) -> dict:
    return {
        "ok": True,
        "message": "You have owner/admin access.",
        "user_id": current_user.id,
        "household_id": membership.household_id,
        "role": membership.role,
    }


@app.get("/api/auth/households/{household_id}/owner-test")
def household_owner_test(
    membership: HouseholdMember = Depends(require_household_role("owner")),
    current_user: User = Depends(get_current_user),
) -> dict:
    return {
        "ok": True,
        "message": "You have owner access.",
        "user_id": current_user.id,
        "household_id": membership.household_id,
        "role": membership.role,
    }


@app.get("/api/households/{household_id}/dashboard-test")
def get_household_dashboard_test(
    membership: HouseholdMember = Depends(get_household_membership),
    current_user: User = Depends(get_current_user),
) -> dict:
    return {
        "ok": True,
        "message": "Read access granted for household dashboard.",
        "user_id": current_user.id,
        "household_id": membership.household_id,
        "role": membership.role,
    }


@app.patch("/api/households/{household_id}/settings-test")
def update_household_settings_test(
    membership: HouseholdMember = Depends(require_household_role("owner", "admin")),
    current_user: User = Depends(get_current_user),
) -> dict:
    return {
        "ok": True,
        "message": "Settings update access granted.",
        "user_id": current_user.id,
        "household_id": membership.household_id,
        "role": membership.role,
    }


@app.delete("/api/households/{household_id}/delete-test")
def delete_household_test(
    membership: HouseholdMember = Depends(require_household_role("owner")),
    current_user: User = Depends(get_current_user),
) -> dict:
    return {
        "ok": True,
        "message": "Delete access granted.",
        "user_id": current_user.id,
        "household_id": membership.household_id,
        "role": membership.role,
    }
