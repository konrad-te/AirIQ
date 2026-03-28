from __future__ import annotations

import json
from datetime import UTC, date, datetime, time, timedelta
from typing import Any

from backend.database import get_db
from backend.models import GarminSleepSummary, User
from backend.schemas.sleep import (
    SleepHistoryResponseSchema,
    SleepImportFileResultSchema,
    SleepImportResponseSchema,
)
from backend.security import get_current_user
from backend.services.garmin_sleep import (
    normalize_garmin_sleep_entry,
    serialize_sleep_history_point,
)
from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/sleep", tags=["sleep"])

SLEEP_HISTORY_RANGE_TO_WINDOW = {
    "7d": timedelta(days=7),
    "30d": timedelta(days=30),
    "90d": timedelta(days=90),
    "180d": timedelta(days=180),
}

MERGEABLE_SLEEP_FIELDS = (
    "external_uuid",
    "source_file_name",
    "wellness_start_at",
    "wellness_end_at",
    "sleep_start_at",
    "sleep_end_at",
    "sleep_start_local_minutes",
    "sleep_end_local_minutes",
    "sleep_duration_minutes",
    "sleep_deep_minutes",
    "sleep_light_minutes",
    "sleep_rem_minutes",
    "sleep_awake_minutes",
    "sleep_unmeasurable_minutes",
    "sleep_window_confirmation_type",
    "sleep_stress_avg",
    "sleep_stress_max",
    "body_battery_start",
    "body_battery_end",
    "body_battery_gain",
    "resting_heart_rate",
    "min_heart_rate",
    "max_heart_rate",
    "avg_waking_respiration",
    "avg_sleep_respiration",
    "lowest_sleep_respiration",
    "highest_sleep_respiration",
)


def _parse_json_file(upload: UploadFile, raw_bytes: bytes) -> list[dict[str, Any]]:
    try:
        payload = json.loads(raw_bytes.decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=400,
            detail=f"File '{upload.filename or 'upload'}' is not valid Garmin JSON.",
        ) from exc

    if not isinstance(payload, list):
        raise HTTPException(
            status_code=400,
            detail=f"File '{upload.filename or 'upload'}' must contain a JSON array.",
        )

    rows = [row for row in payload if isinstance(row, dict)]
    if not rows:
        raise HTTPException(
            status_code=400,
            detail=f"File '{upload.filename or 'upload'}' does not contain usable Garmin rows.",
        )
    return rows


def _apply_summary_fields(record: GarminSleepSummary, normalized: dict[str, Any]) -> None:
    record.provider = "garmin"
    record.calendar_date = normalized["calendar_date"]

    for field_name in MERGEABLE_SLEEP_FIELDS:
        value = normalized.get(field_name)
        if value is not None:
            setattr(record, field_name, value)

    incoming_payload = normalized.get("raw_payload_json")
    payload_key = normalized.get("source_payload_key") or "import"
    if incoming_payload is not None:
        existing_payload = record.raw_payload_json if isinstance(record.raw_payload_json, dict) else None
        if existing_payload and any(key in existing_payload for key in ("aggregator", "sleep_data", "legacy")):
            merged_payload = dict(existing_payload)
        elif existing_payload:
            if "bodyBattery" in existing_payload or "allDayStress" in existing_payload:
                legacy_key = "aggregator"
            elif "sleepStartTimestampGMT" in existing_payload or "deepSleepSeconds" in existing_payload:
                legacy_key = "sleep_data"
            else:
                legacy_key = "legacy"
            merged_payload = {legacy_key: existing_payload}
        else:
            merged_payload = {}
        merged_payload[payload_key] = incoming_payload
        record.raw_payload_json = merged_payload


@router.post("/import", response_model=SleepImportResponseSchema)
async def import_sleep_files(
    response: Response,
    files: list[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SleepImportResponseSchema:
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"

    if not files:
        raise HTTPException(status_code=400, detail="Choose at least one Garmin JSON file.")

    file_results: list[SleepImportFileResultSchema] = []
    imported_total = 0
    updated_total = 0
    skipped_total = 0

    for upload in files:
        raw_bytes = await upload.read()
        rows = _parse_json_file(upload, raw_bytes)
        normalized_rows = [
            normalized
            for row in rows
            if (normalized := normalize_garmin_sleep_entry(row, source_file_name=upload.filename))
        ]

        if not normalized_rows:
            file_results.append(
                SleepImportFileResultSchema(
                    file_name=upload.filename or "upload",
                    imported=0,
                    updated=0,
                    skipped=len(rows),
                )
            )
            skipped_total += len(rows)
            continue

        calendar_dates = [item["calendar_date"] for item in normalized_rows]
        existing_rows = (
            db.execute(
                select(GarminSleepSummary).where(
                    GarminSleepSummary.user_id == current_user.id,
                    GarminSleepSummary.calendar_date.in_(calendar_dates),
                )
            )
            .scalars()
            .all()
        )
        existing_by_date = {item.calendar_date: item for item in existing_rows}

        file_imported = 0
        file_updated = 0
        for normalized in normalized_rows:
            existing = existing_by_date.get(normalized["calendar_date"])
            if existing is None:
                existing = GarminSleepSummary(user_id=current_user.id)
                _apply_summary_fields(existing, normalized)
                db.add(existing)
                existing_by_date[normalized["calendar_date"]] = existing
                file_imported += 1
            else:
                _apply_summary_fields(existing, normalized)
                file_updated += 1

        file_skipped = len(rows) - len(normalized_rows)
        file_results.append(
            SleepImportFileResultSchema(
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

    return SleepImportResponseSchema(
        ok=True,
        provider="garmin",
        message="Garmin sleep data imported successfully.",
        imported=imported_total,
        updated=updated_total,
        skipped=skipped_total,
        files=file_results,
    )


@router.get("/history", response_model=SleepHistoryResponseSchema)
def get_sleep_history(
    response: Response,
    range_key: str = Query("30d", alias="range"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SleepHistoryResponseSchema:
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"

    if range_key not in SLEEP_HISTORY_RANGE_TO_WINDOW:
        raise HTTPException(status_code=400, detail="Unsupported sleep history range.")

    today_utc = datetime.now(UTC).date()
    start_date = today_utc - SLEEP_HISTORY_RANGE_TO_WINDOW[range_key] + timedelta(days=1)

    rows = (
        db.execute(
            select(GarminSleepSummary)
            .where(
                GarminSleepSummary.user_id == current_user.id,
                GarminSleepSummary.calendar_date >= start_date,
                GarminSleepSummary.calendar_date <= today_utc,
            )
            .order_by(GarminSleepSummary.calendar_date.asc())
        )
        .scalars()
        .all()
    )
    by_date = {row.calendar_date: row for row in rows}

    points = []
    current_day = start_date
    while current_day <= today_utc:
        row = by_date.get(current_day)
        if row is None:
            points.append(
                {
                    "time": datetime.combine(current_day, time(hour=12, tzinfo=UTC)),
                    "calendar_date": current_day.isoformat(),
                    "sample_count": 0,
                    "sleep_start_at": None,
                    "sleep_end_at": None,
                    "sleep_duration_minutes": None,
                    "sleep_deep_minutes": None,
                    "sleep_light_minutes": None,
                    "sleep_rem_minutes": None,
                    "sleep_awake_minutes": None,
                    "sleep_unmeasurable_minutes": None,
                    "sleep_window_confirmation_type": None,
                    "sleep_stress_avg": None,
                    "body_battery_gain": None,
                    "resting_heart_rate": None,
                    "avg_waking_respiration": None,
                    "avg_sleep_respiration": None,
                    "lowest_sleep_respiration": None,
                    "highest_sleep_respiration": None,
                    "sleep_start_local_minutes": None,
                    "sleep_end_local_minutes": None,
                }
            )
        else:
            points.append(serialize_sleep_history_point(row))
        current_day += timedelta(days=1)

    latest_row = rows[-1] if rows else None
    return SleepHistoryResponseSchema(
        range=range_key,
        bucket_days=1,
        source_label="Garmin import",
        last_calendar_date=latest_row.calendar_date.isoformat() if latest_row else None,
        latest_imported_at=latest_row.updated_at if latest_row else None,
        points=points,
    )
