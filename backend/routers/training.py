from __future__ import annotations

import json
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Any

from backend.database import get_db
from backend.models import GarminTrainingActivity, User
from backend.schemas.training import (
    TrainingActivitySummarySchema,
    TrainingHistoryResponseSchema,
    TrainingHistoryPointSchema,
    TrainingImportFileResultSchema,
    TrainingImportResponseSchema,
    TrainingSportSummarySchema,
)
from backend.security import get_current_user
from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/training", tags=["training"])
KILOJOULES_PER_KILOCALORIE = 4.184

TRAINING_HISTORY_RANGE_TO_WINDOW = {
    "30d": timedelta(days=30),
    "90d": timedelta(days=90),
    "180d": timedelta(days=180),
    "all": None,
}


def _to_float(value: Decimal | float | int | None) -> float | None:
    if value is None:
        return None
    return float(value)


def _parse_json_file(upload: UploadFile, raw_bytes: bytes) -> list[dict[str, Any]]:
    try:
        payload = json.loads(raw_bytes.decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=400,
            detail=f"File '{upload.filename or 'upload'}' is not valid Garmin JSON.",
        ) from exc

    rows = None
    if isinstance(payload, dict):
        rows = payload.get("summarizedActivitiesExport")
    elif (
        isinstance(payload, list)
        and len(payload) == 1
        and isinstance(payload[0], dict)
        and isinstance(payload[0].get("summarizedActivitiesExport"), list)
    ):
        rows = payload[0].get("summarizedActivitiesExport")
    elif isinstance(payload, list):
        rows = payload

    if not isinstance(rows, list):
        raise HTTPException(
            status_code=400,
            detail=(
                f"File '{upload.filename or 'upload'}' does not look like a Garmin "
                "summarized activities export."
            ),
        )

    usable_rows = [row for row in rows if isinstance(row, dict)]
    if not usable_rows:
        raise HTTPException(
            status_code=400,
            detail=f"File '{upload.filename or 'upload'}' does not contain usable Garmin activities.",
        )
    return usable_rows


def _to_datetime(timestamp_ms: Any) -> datetime | None:
    if timestamp_ms in (None, ""):
        return None
    try:
        return datetime.fromtimestamp(float(timestamp_ms) / 1000, tz=UTC)
    except (TypeError, ValueError, OSError):
        return None


def _to_optional_float(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _milliseconds_to_minutes(value: Any) -> float | None:
    numeric_value = _to_optional_float(value)
    if numeric_value is None:
        return None
    return round(numeric_value / 1000 / 60, 2)


def _centimeters_to_km(value: Any) -> float | None:
    numeric_value = _to_optional_float(value)
    if numeric_value is None:
        return None
    return round(numeric_value / 100000, 2)


def _kilojoules_to_kcal(value: float | None) -> float | None:
    if value is None:
        return None
    return round(value / KILOJOULES_PER_KILOCALORIE, 1)


def _normalize_activity_calories(calories_value: Any, bmr_value: Any) -> float | None:
    total_energy_kj = _to_optional_float(calories_value)
    if total_energy_kj is None:
        return None

    bmr_energy_kj = _to_optional_float(bmr_value)
    active_energy_kj = total_energy_kj
    if bmr_energy_kj is not None and total_energy_kj >= bmr_energy_kj:
        active_energy_kj = total_energy_kj - bmr_energy_kj

    return _kilojoules_to_kcal(active_energy_kj)


def _normalize_training_activity(
    row: dict[str, Any],
    *,
    source_file_name: str | None = None,
) -> dict[str, Any] | None:
    activity_id = row.get("activityId")
    if activity_id in (None, ""):
        return None

    try:
        normalized_activity_id = int(activity_id)
    except (TypeError, ValueError):
        return None

    return {
        "activity_id": normalized_activity_id,
        "external_uuid": (
            f"{row.get('uuidMsb')}:{row.get('uuidLsb')}"
            if row.get("uuidMsb") is not None and row.get("uuidLsb") is not None
            else None
        ),
        "source_file_name": source_file_name,
        "name": str(row.get("name") or "Untitled activity"),
        "activity_type": str(row.get("activityType") or "").strip() or None,
        "sport_type": str(row.get("sportType") or "").strip() or None,
        "location_name": str(row.get("locationName") or "").strip() or None,
        "start_time_gmt": _to_datetime(row.get("startTimeGmt")),
        "start_time_local": _to_datetime(row.get("startTimeLocal")),
        "duration_minutes": _milliseconds_to_minutes(row.get("duration")),
        "elapsed_duration_minutes": _milliseconds_to_minutes(row.get("elapsedDuration")),
        "moving_duration_minutes": _milliseconds_to_minutes(row.get("movingDuration")),
        "calories": _normalize_activity_calories(row.get("calories"), row.get("bmrCalories")),
        "average_heart_rate": _to_optional_float(row.get("avgHr")),
        "max_heart_rate": _to_optional_float(row.get("maxHr")),
        "min_heart_rate": _to_optional_float(row.get("minHr")),
        "distance_km": _centimeters_to_km(row.get("distance")),
        "raw_payload_json": row,
    }


def _apply_activity_fields(record: GarminTrainingActivity, normalized: dict[str, Any]) -> None:
    record.provider = "garmin"
    record.activity_id = normalized["activity_id"]
    record.external_uuid = normalized.get("external_uuid")
    record.source_file_name = normalized.get("source_file_name")
    record.name = normalized["name"]
    record.activity_type = normalized.get("activity_type")
    record.sport_type = normalized.get("sport_type")
    record.location_name = normalized.get("location_name")
    record.start_time_gmt = normalized.get("start_time_gmt")
    record.start_time_local = normalized.get("start_time_local")
    record.duration_minutes = normalized.get("duration_minutes")
    record.elapsed_duration_minutes = normalized.get("elapsed_duration_minutes")
    record.moving_duration_minutes = normalized.get("moving_duration_minutes")
    record.calories = normalized.get("calories")
    record.average_heart_rate = normalized.get("average_heart_rate")
    record.max_heart_rate = normalized.get("max_heart_rate")
    record.min_heart_rate = normalized.get("min_heart_rate")
    record.distance_km = normalized.get("distance_km")
    record.raw_payload_json = normalized.get("raw_payload_json")


def _label_for_sport(activity: GarminTrainingActivity) -> tuple[str, str]:
    source = activity.sport_type or activity.activity_type or "other"
    key = source.lower()
    label = source.replace("_", " ").title()
    return key, label


def _activity_display_calories(activity: GarminTrainingActivity) -> float | None:
    raw_payload = activity.raw_payload_json if isinstance(activity.raw_payload_json, dict) else None
    if raw_payload:
        normalized_calories = _normalize_activity_calories(
            raw_payload.get("calories"),
            raw_payload.get("bmrCalories"),
        )
        if normalized_calories is not None:
            return normalized_calories

    stored_value = _to_float(activity.calories)
    return stored_value


def _serialize_activity(record: GarminTrainingActivity) -> TrainingActivitySummarySchema:
    return TrainingActivitySummarySchema(
        activity_id=record.activity_id,
        name=record.name,
        activity_type=record.activity_type,
        sport_type=record.sport_type,
        location_name=record.location_name,
        start_time_gmt=record.start_time_gmt,
        start_time_local=record.start_time_local,
        duration_minutes=_to_float(record.duration_minutes),
        elapsed_duration_minutes=_to_float(record.elapsed_duration_minutes),
        moving_duration_minutes=_to_float(record.moving_duration_minutes),
        calories=_activity_display_calories(record),
        average_heart_rate=_to_float(record.average_heart_rate),
        max_heart_rate=_to_float(record.max_heart_rate),
        min_heart_rate=_to_float(record.min_heart_rate),
        distance_km=_to_float(record.distance_km),
    )


def _activity_calendar_date(record: GarminTrainingActivity) -> date | None:
    reference_time = record.start_time_local or record.start_time_gmt
    return reference_time.date() if reference_time is not None else None


def _build_daily_points(rows: list[GarminTrainingActivity]) -> list[TrainingHistoryPointSchema]:
    buckets: dict[date, dict[str, Any]] = {}

    for row in rows:
        calendar_date = _activity_calendar_date(row)
        if calendar_date is None:
            continue

        duration_minutes = _to_float(row.duration_minutes) or 0.0
        calories = _activity_display_calories(row) or 0.0
        avg_hr = _to_float(row.average_heart_rate)
        distance_km = _to_float(row.distance_km) or 0.0
        sport_key, sport_label = _label_for_sport(row)
        bucket = buckets.setdefault(
            calendar_date,
            {
                "activity_count": 0,
                "total_duration_minutes": 0.0,
                "total_calories": 0.0,
                "weighted_heart_rate_sum": 0.0,
                "weighted_heart_rate_duration": 0.0,
                "total_distance_km": 0.0,
                "sport_minutes": {},
            },
        )
        bucket["activity_count"] += 1
        bucket["total_duration_minutes"] += duration_minutes
        bucket["total_calories"] += calories
        bucket["total_distance_km"] += distance_km
        if avg_hr is not None and duration_minutes > 0:
            bucket["weighted_heart_rate_sum"] += avg_hr * duration_minutes
            bucket["weighted_heart_rate_duration"] += duration_minutes
        sport_minutes: dict[str, float] = bucket["sport_minutes"]
        sport_minutes[sport_label] = sport_minutes.get(sport_label, 0.0) + duration_minutes

    points: list[TrainingHistoryPointSchema] = []
    for calendar_date in sorted(buckets):
        bucket = buckets[calendar_date]
        sport_minutes: dict[str, float] = bucket["sport_minutes"]
        primary_sport_label = max(sport_minutes.items(), key=lambda item: item[1])[0] if sport_minutes else None
        weighted_average_heart_rate = (
            round(bucket["weighted_heart_rate_sum"] / bucket["weighted_heart_rate_duration"], 1)
            if bucket["weighted_heart_rate_duration"] > 0
            else None
        )
        total_distance_km = round(bucket["total_distance_km"], 1) if bucket["total_distance_km"] > 0 else None
        points.append(
            TrainingHistoryPointSchema(
                calendar_date=calendar_date.isoformat(),
                activity_count=bucket["activity_count"],
                total_duration_minutes=round(bucket["total_duration_minutes"], 1),
                total_calories=round(bucket["total_calories"], 0),
                weighted_average_heart_rate=weighted_average_heart_rate,
                total_distance_km=total_distance_km,
                primary_sport_label=primary_sport_label,
            )
        )
    return points


def _build_history_response(
    rows: list[GarminTrainingActivity],
    *,
    range_key: str,
) -> TrainingHistoryResponseSchema:
    total_duration_minutes = 0.0
    total_moving_minutes = 0.0
    total_calories = 0.0
    weighted_heart_rate_sum = 0.0
    weighted_heart_rate_duration = 0.0
    sport_buckets: dict[str, dict[str, Any]] = {}

    for row in rows:
        duration_minutes = _to_float(row.duration_minutes)
        moving_duration_minutes = _to_float(row.moving_duration_minutes)
        calories = _activity_display_calories(row)
        avg_hr = _to_float(row.average_heart_rate)

        if duration_minutes is not None:
            total_duration_minutes += duration_minutes
        if moving_duration_minutes is not None:
            total_moving_minutes += moving_duration_minutes
        if calories is not None:
            total_calories += calories
        if avg_hr is not None and duration_minutes is not None and duration_minutes > 0:
            weighted_heart_rate_sum += avg_hr * duration_minutes
            weighted_heart_rate_duration += duration_minutes

        sport_key, label = _label_for_sport(row)
        bucket = sport_buckets.setdefault(
            sport_key,
            {
                "sport_key": sport_key,
                "label": label,
                "activity_count": 0,
                "total_duration_minutes": 0.0,
                "total_calories": 0.0,
            },
        )
        bucket["activity_count"] += 1
        if duration_minutes is not None:
            bucket["total_duration_minutes"] += duration_minutes
        if calories is not None:
            bucket["total_calories"] += calories

    sport_breakdown = sorted(
        (
            TrainingSportSummarySchema(
                sport_key=bucket["sport_key"],
                label=bucket["label"],
                activity_count=bucket["activity_count"],
                total_duration_hours=round(bucket["total_duration_minutes"] / 60, 1),
                total_calories=round(bucket["total_calories"], 0),
            )
            for bucket in sport_buckets.values()
        ),
        key=lambda item: (item.total_duration_hours, item.activity_count),
        reverse=True,
    )

    latest_row = rows[0] if rows else None
    return TrainingHistoryResponseSchema(
        range=range_key,
        source_label="Garmin activity import",
        latest_activity_at=latest_row.start_time_gmt if latest_row else None,
        latest_imported_at=latest_row.updated_at if latest_row else None,
        total_activities=len(rows),
        total_duration_hours=round(total_duration_minutes / 60, 1),
        total_moving_hours=round(total_moving_minutes / 60, 1),
        total_calories=round(total_calories, 0),
        weighted_average_heart_rate=(
            round(weighted_heart_rate_sum / weighted_heart_rate_duration, 1)
            if weighted_heart_rate_duration > 0
            else None
        ),
        sport_breakdown=sport_breakdown,
        points=_build_daily_points(rows),
        activities=[_serialize_activity(row) for row in rows],
    )


@router.post("/import", response_model=TrainingImportResponseSchema)
async def import_training_files(
    response: Response,
    files: list[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TrainingImportResponseSchema:
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"

    if not files:
        raise HTTPException(status_code=400, detail="Choose at least one Garmin activity JSON file.")

    file_results: list[TrainingImportFileResultSchema] = []
    imported_total = 0
    updated_total = 0
    skipped_total = 0

    for upload in files:
        raw_bytes = await upload.read()
        rows = _parse_json_file(upload, raw_bytes)
        normalized_rows = [
            normalized
            for row in rows
            if (normalized := _normalize_training_activity(row, source_file_name=upload.filename))
        ]

        if not normalized_rows:
            file_results.append(
                TrainingImportFileResultSchema(
                    file_name=upload.filename or "upload",
                    imported=0,
                    updated=0,
                    skipped=len(rows),
                )
            )
            skipped_total += len(rows)
            continue

        activity_ids = [item["activity_id"] for item in normalized_rows]
        existing_rows = (
            db.execute(
                select(GarminTrainingActivity).where(
                    GarminTrainingActivity.user_id == current_user.id,
                    GarminTrainingActivity.activity_id.in_(activity_ids),
                )
            )
            .scalars()
            .all()
        )
        existing_by_activity_id = {item.activity_id: item for item in existing_rows}

        file_imported = 0
        file_updated = 0
        for normalized in normalized_rows:
            existing = existing_by_activity_id.get(normalized["activity_id"])
            if existing is None:
                existing = GarminTrainingActivity(user_id=current_user.id)
                _apply_activity_fields(existing, normalized)
                db.add(existing)
                existing_by_activity_id[normalized["activity_id"]] = existing
                file_imported += 1
            else:
                _apply_activity_fields(existing, normalized)
                file_updated += 1

        file_skipped = len(rows) - len(normalized_rows)
        file_results.append(
            TrainingImportFileResultSchema(
                file_name=upload.filename or "upload",
                imported=file_imported,
                updated=file_updated,
                skipped=file_skipped,
            )
        )
        imported_total += file_imported
        updated_total += file_updated
        skipped_total += file_skipped

    db.commit()

    return TrainingImportResponseSchema(
        ok=True,
        provider="garmin",
        message="Garmin training data imported successfully.",
        imported=imported_total,
        updated=updated_total,
        skipped=skipped_total,
        files=file_results,
    )


@router.get("/history", response_model=TrainingHistoryResponseSchema)
def get_training_history(
    response: Response,
    range_key: str = Query("90d", alias="range"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TrainingHistoryResponseSchema:
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"

    if range_key not in TRAINING_HISTORY_RANGE_TO_WINDOW:
        raise HTTPException(status_code=400, detail="Unsupported training history range.")

    stmt = select(GarminTrainingActivity).where(GarminTrainingActivity.user_id == current_user.id)
    window = TRAINING_HISTORY_RANGE_TO_WINDOW[range_key]
    if window is not None:
        start_at = datetime.now(UTC) - window
        stmt = stmt.where(
            GarminTrainingActivity.start_time_gmt.is_(None)
            | (GarminTrainingActivity.start_time_gmt >= start_at)
        )

    rows = (
        db.execute(
            stmt.order_by(GarminTrainingActivity.start_time_gmt.desc().nullslast())
        )
        .scalars()
        .all()
    )

    return _build_history_response(rows, range_key=range_key)
