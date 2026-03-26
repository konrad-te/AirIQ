from __future__ import annotations

import os
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from backend.database import SessionLocal, get_db
from backend.dependencies.authorization import (
    get_household_membership,
    require_household_role,
)
from fastapi import Depends, FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from backend.init_db import init_db
from backend.models import (
    CityPoint,
    DataProvider,
    ExternalStation,
    Feedback,
    GeocodeCacheEntry,
    GlobeAqCache,
    Household,
    HouseholdMember,
    IngestRun,
    LocationStationCache,
    ProviderCacheEntry,
    User,
    UserSession,
)
from backend.routers.auth import router as auth_router
from backend.routers.households import router as households_router
from backend.schemas.feedback import FeedbackCreateSchema, FeedbackOutSchema
from backend.schemas.recommendation_config import (
    RecommendationConfigSchema,
    RecommendationConfigUpdateSchema,
)
from backend.schemas.suggestions import VentilationContext
from backend.routers.integrations import router as integrations_router
from backend.security import get_current_user
from backend.services.city_seed import seed_city_points
from backend.services.globe_ingest import run_globe_ingest
from backend.services.indoor_air import (
    evaluate_high_indoor_pm25,
    evaluate_low_indoor_humidity,
)
from backend.services.outdoor_activity import evaluate_outdoor_activity
from backend.services.recommendation_config import (
    get_recommendation_config,
    update_recommendation_config,
)
from backend.services.sleep_comfort import evaluate_sleep_temperature
from backend.services.ventilation import evaluate_ventilation
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.main import (
    get_air_quality_data,
    get_lat_lon_nominatim_cached,
    reverse_geocode_nominatim,
    suggest_addresses_nominatim,
)
from backend.routers.integrations import get_qingping_latest_reading

app = FastAPI(title="AirIQ API")
scheduler = BackgroundScheduler(timezone="UTC")

cors_origins = (
    os.getenv("CORS_ORIGINS") or "http://localhost:5173,http://127.0.0.1:5173"
)
allowed_origins = [
    origin.strip() for origin in cors_origins.split(",") if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(households_router)
app.include_router(integrations_router)


def _to_iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _to_float(value: Decimal | float | int | None) -> float | None:
    if value is None:
        return None
    return float(value)


def _wind_ms_to_kmh(value: float | int | Decimal | None) -> float | None:
    speed_ms = _to_float(value)
    if speed_ms is None:
        return None
    return speed_ms * 3.6


def _build_dashboard_suggestions_payload(
    *,
    settings: dict[str, float],
    outdoor_data: dict,
    indoor_data: dict | None,
) -> dict:
    outdoor_current = outdoor_data.get("current") if isinstance(outdoor_data, dict) else {}
    outdoor_current = outdoor_current if isinstance(outdoor_current, dict) else {}
    indoor_payload = indoor_data if isinstance(indoor_data, dict) else {}

    ventilation_context = VentilationContext(
        outdoor_pm25=_to_float(outdoor_current.get("pm25")),
        outdoor_pm10=_to_float(outdoor_current.get("pm10")),
        outdoor_uv_index=_to_float(outdoor_current.get("uv_index")),
        outdoor_temperature_c=_to_float(outdoor_current.get("temperature_c")),
        outdoor_humidity_pct=_to_float(outdoor_current.get("humidity_pct")),
        indoor_co2_ppm=_to_float(indoor_payload.get("co2_ppm")),
        indoor_temperature_c=_to_float(indoor_payload.get("temperature_c")),
        indoor_pm25=_to_float(indoor_payload.get("pm2_5_ug_m3")),
        indoor_pm10=_to_float(indoor_payload.get("pm10_ug_m3")),
        indoor_humidity_pct=_to_float(indoor_payload.get("humidity_pct")),
        wind_kmh=_wind_ms_to_kmh(outdoor_current.get("wind_speed_ms")),
    )
    return _build_suggestions_payload_from_context(
        ventilation_context,
        settings=settings,
        outdoor_data=outdoor_data,
    )


def _build_suggestions_payload_from_context(
    ventilation_context: VentilationContext,
    *,
    settings: dict[str, float],
    outdoor_data: dict | None = None,
) -> dict:
    ventilation_suggestion = evaluate_ventilation(ventilation_context)
    outdoor_activity_suggestion = evaluate_outdoor_activity(ventilation_context)
    indoor_pm25_suggestion = evaluate_high_indoor_pm25(
        ventilation_context,
        threshold=settings["indoor_pm25_high_threshold"],
        has_ventilation_recommendation=ventilation_suggestion is not None,
    )
    low_humidity_suggestion = evaluate_low_indoor_humidity(
        ventilation_context,
        low_threshold=settings["indoor_humidity_low_threshold"],
    )
    sleep_temperature_suggestion = evaluate_sleep_temperature(
        outdoor_data=outdoor_data,
        context=ventilation_context,
        ideal_min=settings["sleep_temp_ideal_min"],
        ideal_max=settings["sleep_temp_ideal_max"],
    )

    suggestions = []
    if ventilation_suggestion is not None:
        suggestions.append(ventilation_suggestion.model_dump())
    if indoor_pm25_suggestion is not None:
        suggestions.append(indoor_pm25_suggestion.model_dump())
    if low_humidity_suggestion is not None:
        suggestions.append(low_humidity_suggestion.model_dump())
    if sleep_temperature_suggestion is not None:
        suggestions.append(sleep_temperature_suggestion.model_dump())
    if outdoor_activity_suggestion is not None:
        suggestions.append(outdoor_activity_suggestion.model_dump())

    priority_rank = {"high": 0, "medium": 1, "low": 2}
    suggestions.sort(key=lambda item: priority_rank.get(item.get("priority"), 99))

    return {
        "suggestions": suggestions,
        "context": ventilation_context.model_dump(),
        "settings": settings,
    }


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


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


def _bootstrap_globe_data() -> None:
    db = SessionLocal()
    try:
        city_point_count = db.execute(select(func.count(CityPoint.id))).scalar_one()
        if city_point_count == 0:
            seed_city_points(db, per_country=4)
            city_point_count = db.execute(select(func.count(CityPoint.id))).scalar_one()

        globe_cache_count = db.execute(
            select(func.count(GlobeAqCache.city_point_id))
        ).scalar_one()
        if city_point_count > 0 and globe_cache_count == 0:
            run_globe_ingest(
                db=db,
                batch_size=40,
                triggered_by="startup",
            )
    finally:
        db.close()


@app.on_event("startup")
def on_startup() -> None:
    init_db()
    db = SessionLocal()
    try:
        from backend.services.bootstrap import ensure_data_providers

        ensure_data_providers(db)
    finally:
        db.close()

    _bootstrap_globe_data()

    if not scheduler.running:
        scheduler.add_job(
            _run_scheduled_ingest,
            trigger=IntervalTrigger(hours=1),
            id="globe_ingest_hourly",
            replace_existing=True,
            max_instances=1,
            coalesce=True,
        )
        scheduler.add_job(
            _run_account_cleanup,
            trigger=IntervalTrigger(hours=24),
            id="account_cleanup_daily",
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


@app.get("/api/geocode/suggest")
def geocode_suggest(
    q: str = Query(..., min_length=2),
    limit: int = Query(5, ge=1, le=10),
) -> dict:
    return {"results": suggest_addresses_nominatim(q, limit=limit)}


@app.get("/api/geocode/reverse")
def reverse_geocode(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
) -> dict:
    result = reverse_geocode_nominatim(lat, lon)
    if result is None:
        raise HTTPException(status_code=404, detail="Location could not be resolved.")

    return result


@app.get("/api/sensor/home/latest")
def get_home_sensor_latest(
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    return get_qingping_latest_reading(current_user=current_user, db=db).model_dump()


@app.get("/api/suggestions/home")
def get_home_suggestions(
    response: Response,
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"

    outdoor_data = get_air_quality_data(lat, lon)
    settings = get_recommendation_config(db)

    indoor_data: dict | None = None
    try:
        indoor_data = get_qingping_latest_reading(
            current_user=current_user,
            db=db,
        ).model_dump()
    except HTTPException as exc:
        if exc.status_code not in {404}:
            raise

    return _build_dashboard_suggestions_payload(
        settings=settings,
        outdoor_data=outdoor_data,
        indoor_data=indoor_data,
    )


@app.post("/api/admin/suggestions/preview")
def preview_admin_suggestions(
    context: VentilationContext,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    _ = admin
    return _build_suggestions_payload_from_context(
        context,
        settings=get_recommendation_config(db),
    )


@app.get("/api/admin/recommendation-config")
def get_admin_recommendation_config(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> RecommendationConfigSchema:
    _ = admin
    return RecommendationConfigSchema(**get_recommendation_config(db))


@app.patch("/api/admin/recommendation-config")
def patch_admin_recommendation_config(
    updates: RecommendationConfigUpdateSchema,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> RecommendationConfigSchema:
    _ = admin
    config = update_recommendation_config(
        db,
        {
            key: value
            for key, value in updates.model_dump().items()
            if value is not None
        },
    )
    return RecommendationConfigSchema(**config)


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


def _run_account_cleanup() -> None:
    from backend.services.account_cleanup import cleanup_deactivated_accounts

    db = SessionLocal()
    try:
        removed = cleanup_deactivated_accounts(db)
        if removed:
            import logging

            logging.getLogger(__name__).info(
                "Account cleanup: removed %d deactivated user(s)", removed
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



@app.get("/api/admin/stats")
def get_admin_stats(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    now = datetime.now(UTC)
    online_threshold = now - timedelta(minutes=15)
    seven_days_ago = now - timedelta(days=7)
    thirty_days_ago = now - timedelta(days=30)

    # ── User stats ────────────────────────────────────────────────────────
    total_users = db.execute(select(func.count(User.id))).scalar_one()

    online_users = db.execute(
        select(func.count(func.distinct(UserSession.user_id))).where(
            UserSession.revoked_at.is_(None),
            UserSession.expires_at >= now,
            UserSession.last_used_at >= online_threshold,
        )
    ).scalar_one()

    subscribers = 0  # Placeholder until subscription model is implemented

    # ── Registration trend ────────────────────────────────────────────────
    signups_7d = db.execute(
        select(func.count(User.id)).where(User.created_at >= seven_days_ago)
    ).scalar_one()

    signups_30d = db.execute(
        select(func.count(User.id)).where(User.created_at >= thirty_days_ago)
    ).scalar_one()

    # ── Household stats ──────────────────────────────────────────────────
    total_households = db.execute(select(func.count(Household.id))).scalar_one()

    total_members = db.execute(
        select(func.count(HouseholdMember.id)).where(HouseholdMember.is_active.is_(True))
    ).scalar_one()

    avg_members = round(total_members / total_households, 1) if total_households else 0

    # ── Session stats ─────────────────────────────────────────────────────
    active_sessions = db.execute(
        select(func.count(UserSession.id)).where(
            UserSession.revoked_at.is_(None),
            UserSession.expires_at >= now,
        )
    ).scalar_one()

    avg_sessions_per_user = (
        round(active_sessions / total_users, 1) if total_users else 0
    )

    # ── Cache health ──────────────────────────────────────────────────────
    provider_cache_active = db.execute(
        select(func.count(ProviderCacheEntry.id)).where(
            ProviderCacheEntry.expires_at >= now
        )
    ).scalar_one()
    provider_cache_expired = db.execute(
        select(func.count(ProviderCacheEntry.id)).where(
            ProviderCacheEntry.expires_at < now
        )
    ).scalar_one()

    geocode_cache_active = db.execute(
        select(func.count(GeocodeCacheEntry.id)).where(
            GeocodeCacheEntry.expires_at >= now
        )
    ).scalar_one()
    geocode_cache_expired = db.execute(
        select(func.count(GeocodeCacheEntry.id)).where(
            GeocodeCacheEntry.expires_at < now
        )
    ).scalar_one()

    location_cache_active = db.execute(
        select(func.count(LocationStationCache.id)).where(
            LocationStationCache.expires_at >= now
        )
    ).scalar_one()
    location_cache_expired = db.execute(
        select(func.count(LocationStationCache.id)).where(
            LocationStationCache.expires_at < now
        )
    ).scalar_one()

    # ── AQ coverage ───────────────────────────────────────────────────────
    total_city_points = db.execute(
        select(func.count(CityPoint.id)).where(CityPoint.is_active.is_(True))
    ).scalar_one()

    globe_fresh = db.execute(
        select(func.count(GlobeAqCache.city_point_id)).where(
            GlobeAqCache.stale.is_(False)
        )
    ).scalar_one()

    globe_stale = db.execute(
        select(func.count(GlobeAqCache.city_point_id)).where(
            GlobeAqCache.stale.is_(True)
        )
    ).scalar_one()

    # ── Data providers ────────────────────────────────────────────────────
    providers = (
        db.execute(select(DataProvider).order_by(DataProvider.provider_code.asc()))
        .scalars()
        .all()
    )

    # ── Latest ingest runs ────────────────────────────────────────────────
    ingest_rows = db.execute(
        select(IngestRun, DataProvider)
        .join(DataProvider, DataProvider.id == IngestRun.provider_id)
        .order_by(IngestRun.id.desc())
        .limit(10)
    ).all()

    # ── System overview ───────────────────────────────────────────────────
    external_station_count = db.execute(
        select(func.count(ExternalStation.id))
    ).scalar_one()

    return {
        "total_users": total_users,
        "online_users": online_users,
        "subscribers": subscribers,
        "registration_trend": {
            "signups_7d": signups_7d,
            "signups_30d": signups_30d,
        },
        "households": {
            "total": total_households,
            "avg_members": avg_members,
        },
        "sessions": {
            "active": active_sessions,
            "avg_per_user": avg_sessions_per_user,
        },
        "cache_health": {
            "provider": {"active": provider_cache_active, "expired": provider_cache_expired},
            "geocode": {"active": geocode_cache_active, "expired": geocode_cache_expired},
            "location": {"active": location_cache_active, "expired": location_cache_expired},
        },
        "aq_coverage": {
            "total_cities": total_city_points,
            "fresh": globe_fresh,
            "stale": globe_stale,
        },
        "providers": [
            {
                "provider_code": p.provider_code,
                "display_name": p.display_name,
                "is_active": p.is_active,
                "auth_type": p.auth_type,
            }
            for p in providers
        ],
        "latest_ingest_runs": [
            {
                **_serialize_ingest_run(run),
                "provider_code": provider.provider_code,
                "provider_name": provider.display_name,
            }
            for run, provider in ingest_rows
        ],
        "system": {
            "scheduler_running": scheduler.running,
            "external_stations": external_station_count,
        },
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


# ── Feedback ──────────────────────────────────────────────────────────────────


@app.post("/api/feedback", status_code=201)
def submit_feedback(
    body: FeedbackCreateSchema,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    fb = Feedback(
        user_id=current_user.id,
        category=body.category,
        message=body.message,
    )
    db.add(fb)
    db.commit()
    db.refresh(fb)
    return {"id": fb.id}


@app.get("/api/admin/feedback")
def get_admin_feedback(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    rows = (
        db.execute(
            select(Feedback, User)
            .outerjoin(User, User.id == Feedback.user_id)
            .order_by(Feedback.created_at.desc())
        )
        .all()
    )
    items = [
        FeedbackOutSchema(
            id=fb.id,
            user_id=fb.user_id,
            user_email=user.email if user else "Deleted user",
            user_display_name=user.display_name if user else "Deleted user",
            category=fb.category,
            message=fb.message,
            is_read=fb.is_read,
            created_at=fb.created_at,
        ).model_dump(mode="json")
        for fb, user in rows
    ]
    unread = sum(1 for i in items if not i["is_read"])
    return {"count": len(items), "unread": unread, "items": items}


@app.patch("/api/admin/feedback/{feedback_id}")
def mark_feedback_read(
    feedback_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    fb = db.get(Feedback, feedback_id)
    if not fb:
        raise HTTPException(status_code=404, detail="Feedback not found.")
    fb.is_read = True
    db.commit()
    return {"ok": True}


@app.delete("/api/admin/feedback/{feedback_id}", status_code=204)
def delete_feedback(
    feedback_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> None:
    fb = db.get(Feedback, feedback_id)
    if not fb:
        raise HTTPException(status_code=404, detail="Feedback not found.")
    db.delete(fb)
    db.commit()


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
