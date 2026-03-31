from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from statistics import median
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.main import get_air_quality_data
from backend.models import GarminSleepSummary, GarminTrainingActivity, IndoorSensorReading, SavedLocation, User, UserQingpingIntegration

IDEAL_SLEEP_TEMP_MIN_C = 17.0
IDEAL_SLEEP_TEMP_MAX_C = 19.0
CO2_ALERT_PPM = 1000
CO2_HIGH_ALERT_PPM = 1400
PM25_ELEVATED_UG_M3 = 12
IDEAL_SLEEP_DURATION_MINUTES = 420
IDEAL_SLEEP_DURATION_MAX_MINUTES = 540
IDEAL_DEEP_SLEEP_PCT_MIN = 13.0
IDEAL_DEEP_SLEEP_PCT_MAX = 23.0
IDEAL_LIGHT_SLEEP_PCT_MIN = 45.0
IDEAL_LIGHT_SLEEP_PCT_MAX = 55.0
IDEAL_REM_SLEEP_PCT_MIN = 20.0
IDEAL_REM_SLEEP_PCT_MAX = 25.0
SIGNIFICANT_DURATION_DELTA_MINUTES = 60
SIGNIFICANT_STAGE_DELTA_PCT = 5.0


def _to_float(value: Decimal | float | int | None) -> float | None:
    if value is None:
        return None
    return float(value)


def _round(value: float | None, digits: int = 1) -> float | None:
    if value is None:
        return None
    return round(value, digits)


def _avg(values: list[float]) -> float | None:
    if not values:
        return None
    return sum(values) / len(values)


def _format_duration(minutes: int | float | None) -> str | None:
    if minutes is None:
        return None
    total_minutes = max(0, int(round(minutes)))
    hours = total_minutes // 60
    mins = total_minutes % 60
    return f"{hours}h {mins:02d}m"


def _sleep_stage_percentages(
    *,
    duration_minutes: int | None,
    deep_minutes: int | None,
    light_minutes: int | None,
    rem_minutes: int | None,
    awake_minutes: int | None,
) -> dict[str, float | None]:
    measured_total = sum(
        float(value)
        for value in (deep_minutes, light_minutes, rem_minutes, awake_minutes)
        if value is not None and value >= 0
    )
    denominator = measured_total or float(duration_minutes or 0)
    if denominator <= 0:
        return {
            "measured_total_minutes": None,
            "deep_pct": None,
            "light_pct": None,
            "rem_pct": None,
            "awake_pct": None,
        }

    def pct(value: int | None) -> float | None:
        if value is None:
            return None
        return _round((float(value) / denominator) * 100, 1)

    return {
        "measured_total_minutes": _round(denominator, 0),
        "deep_pct": pct(deep_minutes),
        "light_pct": pct(light_minutes),
        "rem_pct": pct(rem_minutes),
        "awake_pct": pct(awake_minutes),
    }


def _window_for_sleep(summary: GarminSleepSummary) -> tuple[datetime | None, datetime | None]:
    if summary.sleep_start_at is not None and summary.sleep_end_at is not None:
        return summary.sleep_start_at, summary.sleep_end_at
    if summary.wellness_start_at is not None and summary.wellness_end_at is not None:
        return summary.wellness_start_at, summary.wellness_end_at
    return None, None


def _sleep_payload(summary: GarminSleepSummary) -> dict[str, Any]:
    return {
        "calendar_date": summary.calendar_date.isoformat(),
        "sleep_start_at": summary.sleep_start_at,
        "sleep_end_at": summary.sleep_end_at,
        "sleep_duration_minutes": summary.sleep_duration_minutes,
        "sleep_deep_minutes": summary.sleep_deep_minutes,
        "sleep_light_minutes": summary.sleep_light_minutes,
        "sleep_rem_minutes": summary.sleep_rem_minutes,
        "sleep_awake_minutes": summary.sleep_awake_minutes,
        "body_battery_gain": summary.body_battery_gain,
        "resting_heart_rate": summary.resting_heart_rate,
        "avg_sleep_respiration": _to_float(summary.avg_sleep_respiration),
    }


def _resolve_sensor_device(db: Session, *, user_id: int) -> tuple[str | None, str | None]:
    integration = (
        db.execute(select(UserQingpingIntegration).where(UserQingpingIntegration.user_id == user_id))
        .scalars()
        .first()
    )
    if integration is not None and integration.selected_device_id:
        return integration.selected_device_id, integration.selected_device_name

    latest = (
        db.execute(
            select(IndoorSensorReading)
            .where(IndoorSensorReading.user_id == user_id, IndoorSensorReading.provider == "qingping")
            .order_by(IndoorSensorReading.recorded_at.desc())
            .limit(1)
        )
        .scalars()
        .first()
    )
    if latest is None:
        return None, None
    return latest.provider_device_key, latest.device_name


def _load_sleep_window_readings(
    db: Session,
    *,
    user_id: int,
    start_at: datetime | None,
    end_at: datetime | None,
) -> tuple[list[IndoorSensorReading], str | None]:
    if start_at is None or end_at is None:
        return [], None

    device_id, device_name = _resolve_sensor_device(db, user_id=user_id)
    if not device_id:
        return [], None

    readings = (
        db.execute(
            select(IndoorSensorReading)
            .where(
                IndoorSensorReading.user_id == user_id,
                IndoorSensorReading.provider == "qingping",
                IndoorSensorReading.provider_device_key == device_id,
                IndoorSensorReading.recorded_at >= start_at,
                IndoorSensorReading.recorded_at <= end_at,
            )
            .order_by(IndoorSensorReading.recorded_at.asc())
        )
        .scalars()
        .all()
    )
    return readings, device_name


def _expected_step_minutes(readings: list[IndoorSensorReading]) -> int:
    if len(readings) < 2:
        return 15
    diffs = []
    previous_time = readings[0].recorded_at
    for reading in readings[1:]:
        diff_minutes = max(1, round((reading.recorded_at - previous_time).total_seconds() / 60))
        diffs.append(min(diff_minutes, 60))
        previous_time = reading.recorded_at
    return int(median(diffs)) if diffs else 15


def _minutes_above_threshold(
    readings: list[IndoorSensorReading],
    *,
    attribute: str,
    threshold: float,
) -> int | None:
    if not readings:
        return None

    step_minutes = _expected_step_minutes(readings)
    total_minutes = 0
    for index, reading in enumerate(readings):
        value = _to_float(getattr(reading, attribute))
        if value is None or value < threshold:
            continue
        if index + 1 < len(readings):
            next_time = readings[index + 1].recorded_at
            gap_minutes = max(1, round((next_time - reading.recorded_at).total_seconds() / 60))
            total_minutes += min(gap_minutes, 60)
        else:
            total_minutes += step_minutes
    return total_minutes


def _summarize_indoor_window(
    readings: list[IndoorSensorReading],
    *,
    device_name: str | None,
    window_start_at: datetime | None,
    window_end_at: datetime | None,
) -> dict[str, Any]:
    if not readings:
        return {
            "available": False,
            "source_label": device_name,
            "data_source": None,
            "sample_count": 0,
            "coverage_ratio": None,
            "window_start_at": window_start_at,
            "window_end_at": window_end_at,
            "average_temperature_c": None,
            "min_temperature_c": None,
            "max_temperature_c": None,
            "average_humidity_pct": None,
            "average_pm25_ug_m3": None,
            "max_pm25_ug_m3": None,
            "average_pm10_ug_m3": None,
            "average_co2_ppm": None,
            "max_co2_ppm": None,
            "minutes_over_1000_co2": None,
            "minutes_over_1400_co2": None,
        }

    temperature_values: list[float] = []
    humidity_values: list[float] = []
    pm25_values: list[float] = []
    pm10_values: list[float] = []
    co2_values: list[float] = []
    for reading in readings:
        if (value := _to_float(reading.temperature_c)) is not None:
            temperature_values.append(value)
        if (value := _to_float(reading.humidity_pct)) is not None:
            humidity_values.append(value)
        if (value := _to_float(reading.pm25_ug_m3)) is not None:
            pm25_values.append(value)
        if (value := _to_float(reading.pm10_ug_m3)) is not None:
            pm10_values.append(value)
        if (value := _to_float(reading.co2_ppm)) is not None:
            co2_values.append(value)

    sleep_minutes = None
    if window_start_at is not None and window_end_at is not None:
        sleep_minutes = max(1, round((window_end_at - window_start_at).total_seconds() / 60))
    expected_step = _expected_step_minutes(readings)
    coverage_ratio = None
    if sleep_minutes:
        coverage_ratio = min(1.0, (len(readings) * expected_step) / sleep_minutes)

    source_types = {reading.source_type for reading in readings if reading.source_type}
    if source_types == {"mock_indoor"}:
        data_source = "demo_seed"
    elif "mock_indoor" in source_types:
        data_source = "mixed"
    else:
        data_source = "real_sensor"

    return {
        "available": True,
        "source_label": device_name,
        "data_source": data_source,
        "sample_count": len(readings),
        "coverage_ratio": _round(coverage_ratio, 2),
        "window_start_at": window_start_at,
        "window_end_at": window_end_at,
        "average_temperature_c": _round(_avg(temperature_values)),
        "min_temperature_c": _round(min(temperature_values) if temperature_values else None),
        "max_temperature_c": _round(max(temperature_values) if temperature_values else None),
        "average_humidity_pct": _round(_avg(humidity_values)),
        "average_pm25_ug_m3": _round(_avg(pm25_values)),
        "max_pm25_ug_m3": _round(max(pm25_values) if pm25_values else None),
        "average_pm10_ug_m3": _round(_avg(pm10_values)),
        "average_co2_ppm": _round(_avg(co2_values)),
        "max_co2_ppm": _round(max(co2_values) if co2_values else None),
        "minutes_over_1000_co2": _minutes_above_threshold(
            readings,
            attribute="co2_ppm",
            threshold=CO2_ALERT_PPM,
        ),
        "minutes_over_1400_co2": _minutes_above_threshold(
            readings,
            attribute="co2_ppm",
            threshold=CO2_HIGH_ALERT_PPM,
        ),
    }


def _coverage_bucket(indoor: dict[str, Any]) -> str:
    if not indoor.get("available"):
        return "missing"
    coverage_ratio = indoor.get("coverage_ratio") or 0
    sample_count = indoor.get("sample_count") or 0
    if coverage_ratio >= 0.7 and sample_count >= 12:
        return "good"
    if coverage_ratio >= 0.35 and sample_count >= 6:
        return "partial"
    return "low"


def _resolve_outdoor_location(
    db: Session,
    *,
    user_id: int,
    lat: float | None,
    lon: float | None,
) -> tuple[float | None, float | None, str | None]:
    if lat is not None and lon is not None:
        return lat, lon, "Selected location"

    saved_location = (
        db.execute(
            select(SavedLocation)
            .where(SavedLocation.user_id == user_id)
            .order_by(SavedLocation.sort_order.asc(), SavedLocation.created_at.asc())
            .limit(1)
        )
        .scalars()
        .first()
    )
    if saved_location is None:
        return None, None, None
    return float(saved_location.lat), float(saved_location.lon), saved_location.label


def _parse_series_time(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def _extract_outdoor_match(
    outdoor_data: dict[str, Any],
    *,
    target_time: datetime | None,
    location_label: str | None,
) -> dict[str, Any]:
    if target_time is None:
        return {
            "available": False,
            "location_label": location_label,
            "matched_time": None,
            "hours_from_sleep_start": None,
            "pm25": None,
            "pm10": None,
            "temperature_c": None,
            "humidity_pct": None,
            "confidence": None,
            "source_label": "Sleep window timing is unavailable.",
        }

    candidates: list[tuple[datetime, dict[str, Any]]] = []
    for series_name in ("history", "forecast"):
        series = outdoor_data.get(series_name)
        if not isinstance(series, list):
            continue
        for row in series:
            if not isinstance(row, dict):
                continue
            parsed_time = _parse_series_time(row.get("time"))
            if parsed_time is not None:
                candidates.append((parsed_time, row))

    current = outdoor_data.get("current")
    if isinstance(current, dict):
        measurement_window = outdoor_data.get("measurement_window")
        candidate_time = None
        if isinstance(measurement_window, dict):
            candidate_time = _parse_series_time(measurement_window.get("from"))
        if candidate_time is None:
            candidate_time = datetime.now(UTC)
        candidates.append((candidate_time, current))

    if not candidates:
        return {
            "available": False,
            "location_label": location_label,
            "matched_time": None,
            "hours_from_sleep_start": None,
            "pm25": None,
            "pm10": None,
            "temperature_c": None,
            "humidity_pct": None,
            "confidence": None,
            "source_label": "No outdoor timeline is available for this date.",
        }

    matched_time, matched_row = min(
        candidates,
        key=lambda item: abs((item[0] - target_time).total_seconds()),
    )
    hours_from_sleep_start = abs((matched_time - target_time).total_seconds()) / 3600
    if hours_from_sleep_start > 18:
        return {
            "available": False,
            "location_label": location_label,
            "matched_time": None,
            "hours_from_sleep_start": _round(hours_from_sleep_start),
            "pm25": None,
            "pm10": None,
            "temperature_c": None,
            "humidity_pct": None,
            "confidence": None,
            "source_label": "Outdoor history for that night is outside the currently available time window.",
        }

    provenance = matched_row.get("provenance") if isinstance(matched_row.get("provenance"), dict) else {}
    return {
        "available": True,
        "location_label": location_label,
        "matched_time": matched_time,
        "hours_from_sleep_start": _round(hours_from_sleep_start),
        "pm25": _round(_to_float(matched_row.get("pm25"))),
        "pm10": _round(_to_float(matched_row.get("pm10"))),
        "temperature_c": _round(_to_float(matched_row.get("temperature_c"))),
        "humidity_pct": _round(_to_float(matched_row.get("humidity_pct"))),
        "confidence": provenance.get("confidence"),
        "source_label": provenance.get("detail") or outdoor_data.get("source", {}).get("user_message"),
    }


def _load_outdoor_context(
    db: Session,
    *,
    user_id: int,
    sleep_start_at: datetime | None,
    lat: float | None,
    lon: float | None,
) -> dict[str, Any]:
    resolved_lat, resolved_lon, location_label = _resolve_outdoor_location(
        db,
        user_id=user_id,
        lat=lat,
        lon=lon,
    )
    if resolved_lat is None or resolved_lon is None:
        return {
            "available": False,
            "location_label": None,
            "matched_time": None,
            "hours_from_sleep_start": None,
            "pm25": None,
            "pm10": None,
            "temperature_c": None,
            "humidity_pct": None,
            "confidence": None,
            "source_label": "Add a saved location or pass coordinates to include outdoor context.",
        }

    try:
        outdoor_data = get_air_quality_data(resolved_lat, resolved_lon)
    except Exception:
        return {
            "available": False,
            "location_label": location_label,
            "matched_time": None,
            "hours_from_sleep_start": None,
            "pm25": None,
            "pm10": None,
            "temperature_c": None,
            "humidity_pct": None,
            "confidence": None,
            "source_label": "Outdoor data could not be loaded right now.",
        }

    return _extract_outdoor_match(
        outdoor_data,
        target_time=sleep_start_at,
        location_label=location_label,
    )


def _training_intensity(activity: GarminTrainingActivity) -> str | None:
    avg_hr = _to_float(activity.average_heart_rate)
    duration_minutes = _to_float(activity.duration_minutes)
    calories = _to_float(activity.calories)
    if avg_hr is not None:
        if avg_hr >= 155 or (duration_minutes is not None and duration_minutes >= 90 and avg_hr >= 145):
            return "hard"
        if avg_hr >= 135:
            return "moderate"
        return "light"
    if duration_minutes is not None:
        if duration_minutes >= 90 or (calories is not None and calories >= 800):
            return "hard"
        if duration_minutes >= 45 or (calories is not None and calories >= 350):
            return "moderate"
        return "light"
    return None


def _load_training_context(
    db: Session,
    *,
    user_id: int,
    sleep_start_at: datetime | None,
) -> dict[str, Any]:
    empty = {
        "had_recent_workout": False,
        "name": None,
        "sport_type": None,
        "start_time_gmt": None,
        "duration_minutes": None,
        "calories": None,
        "average_heart_rate": None,
        "intensity": None,
        "hours_before_sleep": None,
    }
    if sleep_start_at is None:
        return empty

    activity = (
        db.execute(
            select(GarminTrainingActivity)
            .where(
                GarminTrainingActivity.user_id == user_id,
                GarminTrainingActivity.start_time_gmt.is_not(None),
                GarminTrainingActivity.start_time_gmt >= sleep_start_at - timedelta(hours=24),
                GarminTrainingActivity.start_time_gmt <= sleep_start_at,
            )
            .order_by(GarminTrainingActivity.start_time_gmt.desc())
            .limit(1)
        )
        .scalars()
        .first()
    )
    if activity is None:
        return empty

    hours_before_sleep = (sleep_start_at - activity.start_time_gmt).total_seconds() / 3600
    return {
        "had_recent_workout": True,
        "name": activity.name,
        "sport_type": activity.sport_type or activity.activity_type,
        "start_time_gmt": activity.start_time_gmt,
        "duration_minutes": _round(_to_float(activity.duration_minutes)),
        "calories": _round(_to_float(activity.calories)),
        "average_heart_rate": _round(_to_float(activity.average_heart_rate)),
        "intensity": _training_intensity(activity),
        "hours_before_sleep": _round(hours_before_sleep),
    }


def _load_recent_sleep_baseline(
    db: Session,
    *,
    user_id: int,
    target_date: date,
    nights: int = 7,
    lookback_days: int = 30,
) -> dict[str, Any]:
    rows = (
        db.execute(
            select(GarminSleepSummary)
            .where(
                GarminSleepSummary.user_id == user_id,
                GarminSleepSummary.calendar_date < target_date,
                GarminSleepSummary.calendar_date >= target_date - timedelta(days=lookback_days),
            )
            .order_by(GarminSleepSummary.calendar_date.desc())
        )
        .scalars()
        .all()
    )

    recent_rows: list[GarminSleepSummary] = []
    for row in rows:
        if row.sleep_duration_minutes is None:
            continue
        recent_rows.append(row)
        if len(recent_rows) >= nights:
            break

    if not recent_rows:
        return {
            "available": False,
            "night_count": 0,
            "average_duration_minutes": None,
            "average_deep_pct": None,
            "average_light_pct": None,
            "average_rem_pct": None,
            "average_awake_pct": None,
        }

    duration_values = [float(row.sleep_duration_minutes) for row in recent_rows if row.sleep_duration_minutes is not None]
    deep_pct_values: list[float] = []
    light_pct_values: list[float] = []
    rem_pct_values: list[float] = []
    awake_pct_values: list[float] = []
    for row in recent_rows:
        stage_percentages = _sleep_stage_percentages(
            duration_minutes=row.sleep_duration_minutes,
            deep_minutes=row.sleep_deep_minutes,
            light_minutes=row.sleep_light_minutes,
            rem_minutes=row.sleep_rem_minutes,
            awake_minutes=row.sleep_awake_minutes,
        )
        if stage_percentages["deep_pct"] is not None:
            deep_pct_values.append(stage_percentages["deep_pct"])
        if stage_percentages["light_pct"] is not None:
            light_pct_values.append(stage_percentages["light_pct"])
        if stage_percentages["rem_pct"] is not None:
            rem_pct_values.append(stage_percentages["rem_pct"])
        if stage_percentages["awake_pct"] is not None:
            awake_pct_values.append(stage_percentages["awake_pct"])

    return {
        "available": True,
        "night_count": len(recent_rows),
        "average_duration_minutes": _round(_avg(duration_values), 0),
        "average_deep_pct": _round(_avg(deep_pct_values)),
        "average_light_pct": _round(_avg(light_pct_values)),
        "average_rem_pct": _round(_avg(rem_pct_values)),
        "average_awake_pct": _round(_avg(awake_pct_values)),
    }


def _analyze_sleep_patterns(
    sleep: dict[str, Any],
    recent_baseline: dict[str, Any],
) -> dict[str, Any]:
    duration_minutes = sleep.get("sleep_duration_minutes")
    deep_minutes = sleep.get("sleep_deep_minutes")
    light_minutes = sleep.get("sleep_light_minutes")
    rem_minutes = sleep.get("sleep_rem_minutes")
    awake_minutes = sleep.get("sleep_awake_minutes")
    stage_percentages = _sleep_stage_percentages(
        duration_minutes=duration_minutes,
        deep_minutes=deep_minutes,
        light_minutes=light_minutes,
        rem_minutes=rem_minutes,
        awake_minutes=awake_minutes,
    )

    duration_status = "unknown"
    if duration_minutes is not None:
        if duration_minutes < 330:
            duration_status = "very_short"
        elif duration_minutes < IDEAL_SLEEP_DURATION_MINUTES:
            duration_status = "short"
        elif duration_minutes <= IDEAL_SLEEP_DURATION_MAX_MINUTES:
            duration_status = "ideal"
        elif duration_minutes >= 600:
            duration_status = "very_long"
        else:
            duration_status = "long"

    return {
        "duration_minutes": duration_minutes,
        "duration_label": _format_duration(duration_minutes),
        "recommended_duration_min_minutes": IDEAL_SLEEP_DURATION_MINUTES,
        "recommended_duration_max_minutes": IDEAL_SLEEP_DURATION_MAX_MINUTES,
        "recommended_duration_label": "7-9 hours",
        "duration_status": duration_status,
        "duration_delta_from_recent_minutes": (
            duration_minutes - recent_baseline["average_duration_minutes"]
            if duration_minutes is not None and recent_baseline.get("average_duration_minutes") is not None
            else None
        ),
        "recent_baseline_nights": recent_baseline.get("night_count", 0),
        "recent_average_duration_minutes": recent_baseline.get("average_duration_minutes"),
        "stage_available": any(
            stage_percentages[key] is not None for key in ("deep_pct", "light_pct", "rem_pct", "awake_pct")
        ),
        "measured_stage_total_minutes": stage_percentages["measured_total_minutes"],
        "deep_pct": stage_percentages["deep_pct"],
        "light_pct": stage_percentages["light_pct"],
        "rem_pct": stage_percentages["rem_pct"],
        "awake_pct": stage_percentages["awake_pct"],
        "recommended_deep_pct_range": f"{IDEAL_DEEP_SLEEP_PCT_MIN:.0f}-{IDEAL_DEEP_SLEEP_PCT_MAX:.0f}%",
        "recommended_light_pct_range": f"{IDEAL_LIGHT_SLEEP_PCT_MIN:.0f}-{IDEAL_LIGHT_SLEEP_PCT_MAX:.0f}%",
        "recommended_rem_pct_range": f"{IDEAL_REM_SLEEP_PCT_MIN:.0f}-{IDEAL_REM_SLEEP_PCT_MAX:.0f}%",
        "recent_average_deep_pct": recent_baseline.get("average_deep_pct"),
        "recent_average_light_pct": recent_baseline.get("average_light_pct"),
        "recent_average_rem_pct": recent_baseline.get("average_rem_pct"),
        "recent_average_awake_pct": recent_baseline.get("average_awake_pct"),
    }


def _build_findings(
    sleep: dict[str, Any],
    sleep_analysis: dict[str, Any],
    indoor: dict[str, Any],
    outdoor: dict[str, Any],
    training_context: dict[str, Any],
) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    if not indoor.get("available"):
        findings.append({
            "code": "indoor_data_missing",
            "severity": "info",
            "title": "Not enough bedroom sensor data for that night",
            "detail": "AirIQ needs overnight indoor readings to judge how bedroom air may have supported or reduced sleep quality.",
        })
    elif _coverage_bucket(indoor) in {"low", "partial"}:
        findings.append({
            "code": "indoor_data_partial",
            "severity": "info",
            "title": "Indoor coverage for that night is limited",
            "detail": f"Only {indoor.get('sample_count', 0)} indoor samples were available for this sleep window, so any bedroom-air conclusion should be treated as directional.",
        })

    avg_temp = indoor.get("average_temperature_c")
    if indoor.get("available") and avg_temp is not None:
        if avg_temp >= 22:
            findings.append({
                "code": "room_warm_high",
                "severity": "high",
                "title": "The bedroom looked quite warm overnight",
                "detail": f"Average bedroom temperature was about {avg_temp}°C, which is well above the usual sleep-comfort range of roughly {IDEAL_SLEEP_TEMP_MIN_C:.0f}-{IDEAL_SLEEP_TEMP_MAX_C:.0f}°C.",
            })
        elif avg_temp > IDEAL_SLEEP_TEMP_MAX_C:
            findings.append({
                "code": "room_warm",
                "severity": "medium",
                "title": "The bedroom was warmer than ideal for sleep comfort",
                "detail": f"Average bedroom temperature was about {avg_temp}°C, a bit above the usual {IDEAL_SLEEP_TEMP_MIN_C:.0f}-{IDEAL_SLEEP_TEMP_MAX_C:.0f}°C comfort range.",
            })
        elif avg_temp < 15:
            findings.append({
                "code": "room_cold_high",
                "severity": "high",
                "title": "The bedroom looked quite cold overnight",
                "detail": f"Average bedroom temperature was about {avg_temp}°C, which is well below the usual {IDEAL_SLEEP_TEMP_MIN_C:.0f}-{IDEAL_SLEEP_TEMP_MAX_C:.0f}°C comfort range.",
            })
        elif avg_temp < IDEAL_SLEEP_TEMP_MIN_C:
            findings.append({
                "code": "room_cold",
                "severity": "medium",
                "title": "The bedroom was a bit cooler than the usual sleep-comfort range",
                "detail": f"Average bedroom temperature was about {avg_temp}°C, slightly below the usual {IDEAL_SLEEP_TEMP_MIN_C:.0f}-{IDEAL_SLEEP_TEMP_MAX_C:.0f}°C comfort range.",
            })

    max_co2 = indoor.get("max_co2_ppm")
    minutes_over_1400 = indoor.get("minutes_over_1400_co2") or 0
    minutes_over_1000 = indoor.get("minutes_over_1000_co2") or 0
    if indoor.get("available") and max_co2 is not None:
        if max_co2 >= 1800 or minutes_over_1400 >= 90:
            findings.append({
                "code": "co2_high",
                "severity": "high",
                "title": "Bedroom air looked quite stale overnight",
                "detail": f"CO2 peaked around {max_co2} ppm and stayed above {CO2_HIGH_ALERT_PPM} ppm for about {minutes_over_1400} minutes, which suggests poor overnight ventilation.",
            })
        elif max_co2 >= CO2_ALERT_PPM or minutes_over_1000 >= 90:
            findings.append({
                "code": "co2_elevated",
                "severity": "medium",
                "title": "Bedroom CO2 was elevated for part of the night",
                "detail": f"CO2 peaked around {max_co2} ppm and stayed above {CO2_ALERT_PPM} ppm for about {minutes_over_1000} minutes.",
            })

    avg_humidity = indoor.get("average_humidity_pct")
    if indoor.get("available") and avg_humidity is not None:
        if avg_humidity < 35:
            findings.append({
                "code": "humidity_low",
                "severity": "medium",
                "title": "Bedroom air looked dry overnight",
                "detail": f"Average humidity was about {avg_humidity}%, below the usual 40-60% comfort range.",
            })
        elif avg_humidity > 60:
            findings.append({
                "code": "humidity_high",
                "severity": "medium",
                "title": "Bedroom air looked fairly humid overnight",
                "detail": f"Average humidity was about {avg_humidity}%, above the usual 40-60% comfort range.",
            })

    avg_pm25 = indoor.get("average_pm25_ug_m3")
    max_pm25 = indoor.get("max_pm25_ug_m3")
    if indoor.get("available") and avg_pm25 is not None and (avg_pm25 >= 20 or (max_pm25 is not None and max_pm25 >= 35)):
        detail = f"Indoor PM2.5 averaged about {avg_pm25} ug/m3"
        if max_pm25 is not None:
            detail += f" and peaked near {max_pm25} ug/m3."
        else:
            detail += "."
        findings.append({
            "code": "indoor_particles_high",
            "severity": "medium",
            "title": "Indoor particle levels were elevated for part of the night",
            "detail": detail,
        })
    elif indoor.get("available") and avg_pm25 is not None and avg_pm25 >= PM25_ELEVATED_UG_M3:
        findings.append({
            "code": "indoor_particles_mild",
            "severity": "low",
            "title": "Indoor particle levels were a bit above the usual healthy target",
            "detail": f"Indoor PM2.5 averaged about {avg_pm25} ug/m3 overnight.",
        })

    duration_status = sleep_analysis.get("duration_status")
    duration_label = sleep_analysis.get("duration_label")
    recent_average_duration = sleep_analysis.get("recent_average_duration_minutes")
    duration_delta_from_recent = sleep_analysis.get("duration_delta_from_recent_minutes")
    baseline_nights = sleep_analysis.get("recent_baseline_nights") or 0
    if duration_status in {"very_short", "short", "long", "very_long"} and duration_label:
        detail = (
            f"Recorded sleep duration was about {duration_label}, outside the usual adult target of "
            f"{sleep_analysis.get('recommended_duration_label')}."
        )
        if (
            recent_average_duration is not None
            and duration_delta_from_recent is not None
            and abs(duration_delta_from_recent) >= SIGNIFICANT_DURATION_DELTA_MINUTES
            and baseline_nights >= 3
        ):
            direction = "longer" if duration_delta_from_recent > 0 else "shorter"
            detail += (
                f" That is about {_format_duration(abs(duration_delta_from_recent))} {direction} than your recent "
                f"{baseline_nights}-night average of {_format_duration(recent_average_duration)}."
            )
        findings.append({
            "code": "sleep_duration_outside_target",
            "severity": "high" if duration_status in {"very_short", "very_long"} else "medium",
            "title": (
                "Sleep duration was much longer than the usual adult target"
                if duration_status == "very_long"
                else "Sleep duration ran longer than the usual adult target"
                if duration_status == "long"
                else "Sleep duration was much shorter than the usual adult target"
                if duration_status == "very_short"
                else "Sleep duration was shorter than the usual adult target"
            ),
            "detail": detail,
        })

    if sleep_analysis.get("stage_available"):
        deep_pct = sleep_analysis.get("deep_pct")
        rem_pct = sleep_analysis.get("rem_pct")
        light_pct = sleep_analysis.get("light_pct")

        if deep_pct is not None and deep_pct < IDEAL_DEEP_SLEEP_PCT_MIN:
            detail = (
                f"Deep sleep was about {_format_duration(sleep.get('sleep_deep_minutes'))} ({deep_pct}% of measured sleep). "
                f"A typical adult range is roughly {sleep_analysis.get('recommended_deep_pct_range')}."
            )
            deep_baseline = sleep_analysis.get("recent_average_deep_pct")
            if deep_baseline is not None and baseline_nights >= 3 and deep_pct <= deep_baseline - SIGNIFICANT_STAGE_DELTA_PCT:
                detail += f" That is also below your recent average of about {deep_baseline}%."
            findings.append({
                "code": "deep_sleep_low",
                "severity": "high" if deep_pct < 10 else "medium",
                "title": "Deep sleep was lower than the usual adult range",
                "detail": detail,
            })

        if rem_pct is not None and rem_pct > IDEAL_REM_SLEEP_PCT_MAX:
            detail = (
                f"REM sleep was about {_format_duration(sleep.get('sleep_rem_minutes'))} ({rem_pct}% of measured sleep), "
                f"above the usual adult range of roughly {sleep_analysis.get('recommended_rem_pct_range')}."
            )
            rem_baseline = sleep_analysis.get("recent_average_rem_pct")
            if rem_baseline is not None and baseline_nights >= 3 and rem_pct >= rem_baseline + SIGNIFICANT_STAGE_DELTA_PCT:
                detail += f" That is also above your recent average of about {rem_baseline}%."
            findings.append({
                "code": "rem_sleep_high",
                "severity": "medium",
                "title": "REM sleep took a larger share than usual",
                "detail": detail,
            })
        elif rem_pct is not None and rem_pct < IDEAL_REM_SLEEP_PCT_MIN:
            detail = (
                f"REM sleep was about {_format_duration(sleep.get('sleep_rem_minutes'))} ({rem_pct}% of measured sleep), "
                f"below the usual adult range of roughly {sleep_analysis.get('recommended_rem_pct_range')}."
            )
            rem_baseline = sleep_analysis.get("recent_average_rem_pct")
            if rem_baseline is not None and baseline_nights >= 3 and rem_pct <= rem_baseline - SIGNIFICANT_STAGE_DELTA_PCT:
                detail += f" That is also below your recent average of about {rem_baseline}%."
            findings.append({
                "code": "rem_sleep_low",
                "severity": "medium",
                "title": "REM sleep was lower than the usual adult range",
                "detail": detail,
            })

        if light_pct is not None and (light_pct > 60 or light_pct < 40):
            detail = (
                f"Light sleep made up about {light_pct}% of measured sleep. It is usually the biggest stage, but "
                f"often lands around {sleep_analysis.get('recommended_light_pct_range')}."
            )
            light_baseline = sleep_analysis.get("recent_average_light_pct")
            if light_baseline is not None and baseline_nights >= 3 and abs(light_pct - light_baseline) >= SIGNIFICANT_STAGE_DELTA_PCT:
                comparison = "above" if light_pct > light_baseline else "below"
                detail += f" That is also {comparison} your recent average of about {light_baseline}%."
            findings.append({
                "code": "light_sleep_shifted",
                "severity": "low",
                "title": "Light sleep share looked shifted from the usual range",
                "detail": detail,
            })

    if outdoor.get("available") and outdoor.get("pm25") is not None and outdoor["pm25"] >= 20:
        findings.append({
            "code": "outdoor_pm25_elevated",
            "severity": "low",
            "title": "Outdoor air was not especially clean around that sleep window",
            "detail": f"Nearby outdoor PM2.5 was around {outdoor['pm25']} ug/m3 near the sleep start, so long ventilation would have needed a bit more care.",
        })

    if training_context.get("had_recent_workout"):
        intensity = training_context.get("intensity") or "unknown"
        duration_minutes = training_context.get("duration_minutes")
        sport = training_context.get("sport_type") or training_context.get("name") or "workout"
        duration_text = f" for about {duration_minutes} minutes" if duration_minutes is not None else ""
        findings.append({
            "code": "recent_training_context",
            "severity": "info",
            "title": "Recent training could also have influenced recovery",
            "detail": f"You also did {sport}{duration_text} with {intensity} intensity before this sleep window.",
        })

    severity_rank = {"high": 0, "medium": 1, "low": 2, "info": 3}
    findings.sort(key=lambda item: (severity_rank.get(item["severity"], 99), item["title"]))
    return findings


def _build_actions(
    sleep_analysis: dict[str, Any],
    indoor: dict[str, Any],
    outdoor: dict[str, Any],
) -> list[dict[str, Any]]:
    actions: list[dict[str, Any]] = []
    duration_status = sleep_analysis.get("duration_status")
    if duration_status in {"long", "very_long"}:
        actions.append({
            "code": "align_sleep_duration",
            "title": "Keep total sleep closer to the usual adult target",
            "detail": "If long nights keep repeating, aim to keep time in bed closer to about 7-9 hours unless you are intentionally catching up after unusually hard training, illness, or sleep debt.",
        })
    elif duration_status in {"short", "very_short"}:
        actions.append({
            "code": "protect_sleep_window",
            "title": "Protect a fuller sleep window",
            "detail": "If short nights are becoming a pattern, try to protect enough time in bed to stay closer to about 7-9 hours.",
        })

    if sleep_analysis.get("stage_available"):
        deep_pct = sleep_analysis.get("deep_pct")
        rem_pct = sleep_analysis.get("rem_pct")
        light_pct = sleep_analysis.get("light_pct")
        if (
            (deep_pct is not None and deep_pct < IDEAL_DEEP_SLEEP_PCT_MIN)
            or (rem_pct is not None and (rem_pct < IDEAL_REM_SLEEP_PCT_MIN or rem_pct > IDEAL_REM_SLEEP_PCT_MAX))
            or (light_pct is not None and (light_pct < 40 or light_pct > 60))
        ):
            actions.append({
                "code": "watch_stage_trends",
                "title": "Treat sleep stages as a trend, not a one-night score",
                "detail": "If deep, light, or REM balance keeps drifting across several nights, focus on regular bedtimes and review late caffeine, alcohol, heavy meals, and room comfort rather than trying to optimize one wearable reading.",
            })

    avg_temp = indoor.get("average_temperature_c")
    if avg_temp is not None and avg_temp > IDEAL_SLEEP_TEMP_MAX_C:
        actions.append({
            "code": "cool_room",
            "title": "Cool the bedroom a bit before bed",
            "detail": f"Try to keep the room closer to about {IDEAL_SLEEP_TEMP_MIN_C:.0f}-{IDEAL_SLEEP_TEMP_MAX_C:.0f}C before sleep.",
        })
    elif avg_temp is not None and avg_temp < IDEAL_SLEEP_TEMP_MIN_C:
        actions.append({
            "code": "warm_room",
            "title": "Keep the bedroom a little warmer before sleep",
            "detail": f"Try to bring the room closer to about {IDEAL_SLEEP_TEMP_MIN_C:.0f}-{IDEAL_SLEEP_TEMP_MAX_C:.0f}C before bed.",
        })

    max_co2 = indoor.get("max_co2_ppm")
    if max_co2 is not None and max_co2 >= CO2_ALERT_PPM:
        detail = "A short airing-out before sleep could help keep overnight CO2 lower."
        if outdoor.get("available") and outdoor.get("pm25") is not None and outdoor["pm25"] >= 20:
            detail = "Outdoor air was not especially clean, so short ventilation windows or filtration may be safer than leaving windows open for long."
        actions.append({
            "code": "freshen_room",
            "title": "Refresh the bedroom air before sleep",
            "detail": detail,
        })

    avg_humidity = indoor.get("average_humidity_pct")
    if avg_humidity is not None and avg_humidity < 35:
        actions.append({
            "code": "raise_humidity",
            "title": "Aim for a little more humidity overnight",
            "detail": "If dry air is a pattern, a humidifier or less aggressive heating may help keep the room closer to 40-60% humidity.",
        })
    elif avg_humidity is not None and avg_humidity > 60:
        actions.append({
            "code": "lower_humidity",
            "title": "Try to reduce bedroom humidity a bit",
            "detail": "Ventilation or dehumidification may help keep the room closer to the usual 40-60% comfort range.",
        })

    avg_pm25 = indoor.get("average_pm25_ug_m3")
    if avg_pm25 is not None and avg_pm25 >= PM25_ELEVATED_UG_M3:
        actions.append({
            "code": "reduce_particles",
            "title": "Reduce indoor particle sources before bed",
            "detail": "If this repeats, check for dust, cooking residue, candles, or other indoor sources and consider filtration.",
        })

    if not actions:
        actions.append({
            "code": "keep_consistent",
            "title": "Keep the bedroom setup consistent",
            "detail": "That night does not show one strong indoor issue, so keep watching patterns across more nights before changing too much.",
        })
    return actions[:4]


def build_rule_based_explanation(
    *,
    sleep: dict[str, Any],
    sleep_analysis: dict[str, Any],
    indoor: dict[str, Any],
    outdoor: dict[str, Any],
    training_context: dict[str, Any],
    findings: list[dict[str, Any]],
    actions: list[dict[str, Any]],
) -> dict[str, Any]:
    top_finding = findings[0] if findings else None
    indoor_source = indoor.get("data_source")

    if top_finding is None:
        headline = "This night does not show one clear indoor-air problem."
    elif top_finding["severity"] == "high":
        headline = top_finding["title"]
    else:
        headline = "A few bedroom conditions may have reduced sleep comfort that night."

    summary_parts = []
    duration_label = sleep_analysis.get("duration_label")
    duration_status = sleep_analysis.get("duration_status")
    if duration_label:
        if duration_status in {"long", "very_long", "short", "very_short"}:
            summary_parts.append(
                f"Recorded sleep duration was about {duration_label}, outside the usual adult target of {sleep_analysis.get('recommended_duration_label')}."
            )
        else:
            summary_parts.append(f"Recorded sleep duration was about {duration_label}.")

    summarized_codes: set[str] = set()
    summary_candidates = sorted(
        findings,
        key=lambda finding: (
            0
            if finding["code"].startswith(("sleep_", "deep_", "light_", "rem_"))
            else 1,
            0 if finding["severity"] == "high" else 1 if finding["severity"] == "medium" else 2,
            finding["title"],
        ),
    )
    for finding in summary_candidates:
        if finding["severity"] == "info" and finding["code"] != "indoor_data_missing":
            continue
        if finding["code"] == "sleep_duration_outside_target":
            summarized_codes.add(finding["code"])
            continue
        summary_parts.append(finding["detail"])
        summarized_codes.add(finding["code"])
        if len(summary_parts) >= 4:
            break

    if top_finding is not None and top_finding["code"] not in summarized_codes and not summary_parts:
        summary_parts.append(top_finding["detail"])
    if indoor_source == "demo_seed":
        summary_parts.append("The bedroom reading history for this account comes from demo seed data, so treat the result as a presentation example.")
    elif top_finding is None:
        summary_parts.append("There is not enough evidence here to point to one dominant bedroom factor.")
    if outdoor.get("available") is False and outdoor.get("source_label"):
        summary_parts.append(outdoor["source_label"])

    training_note = None
    if training_context.get("had_recent_workout"):
        sport = training_context.get("sport_type") or training_context.get("name") or "workout"
        intensity = training_context.get("intensity") or "unknown"
        hours_before_sleep = training_context.get("hours_before_sleep")
        timing_text = f" about {hours_before_sleep} hours before sleep." if hours_before_sleep is not None else " before sleep."
        training_note = f"You also did {sport} with {intensity} intensity{timing_text}"

    caveats = ["This is an association-based explanation, not proof that one factor caused the sleep result."]
    if _coverage_bucket(indoor) in {"missing", "low", "partial"}:
        caveats.append("Indoor coverage for this night is limited, so confidence is lower than it would be with fuller overnight sensor data.")
    if sleep_analysis.get("stage_available"):
        caveats.append("Sleep stages from wearables are best used for trends across several nights, not as exact sleep-lab measurements.")

    return {
        "source": "rule_based",
        "headline": headline,
        "summary": " ".join(summary_parts).strip(),
        "action_items": [action["detail"] for action in actions[:3]],
        "training_note": training_note,
        "caveats": caveats,
    }


def build_sleep_insight(
    db: Session,
    *,
    current_user: User,
    target_date: date,
    lat: float | None = None,
    lon: float | None = None,
) -> dict[str, Any]:
    summary = (
        db.execute(
            select(GarminSleepSummary).where(
                GarminSleepSummary.user_id == current_user.id,
                GarminSleepSummary.calendar_date == target_date,
            )
        )
        .scalars()
        .first()
    )
    if summary is None:
        raise ValueError("No Garmin sleep entry was found for that date.")

    sleep = _sleep_payload(summary)
    window_start_at, window_end_at = _window_for_sleep(summary)
    readings, device_name = _load_sleep_window_readings(
        db,
        user_id=current_user.id,
        start_at=window_start_at,
        end_at=window_end_at,
    )
    indoor = _summarize_indoor_window(
        readings,
        device_name=device_name,
        window_start_at=window_start_at,
        window_end_at=window_end_at,
    )
    outdoor = _load_outdoor_context(
        db,
        user_id=current_user.id,
        sleep_start_at=window_start_at,
        lat=lat,
        lon=lon,
    )
    training_context = _load_training_context(
        db,
        user_id=current_user.id,
        sleep_start_at=window_start_at,
    )
    recent_baseline = _load_recent_sleep_baseline(
        db,
        user_id=current_user.id,
        target_date=target_date,
    )
    sleep_analysis = _analyze_sleep_patterns(sleep, recent_baseline)
    findings = _build_findings(sleep, sleep_analysis, indoor, outdoor, training_context)
    actions = _build_actions(sleep_analysis, indoor, outdoor)
    explanation = build_rule_based_explanation(
        sleep=sleep,
        sleep_analysis=sleep_analysis,
        indoor=indoor,
        outdoor=outdoor,
        training_context=training_context,
        findings=findings,
        actions=actions,
    )

    return {
        "ok": True,
        "date": target_date.isoformat(),
        "sleep": sleep,
        "sleep_quality": sleep_analysis,
        "data_quality": {
            "sleep_window_available": window_start_at is not None and window_end_at is not None,
            "indoor_coverage": _coverage_bucket(indoor),
            "indoor_sample_count": indoor.get("sample_count", 0),
            "outdoor_available": bool(outdoor.get("available")),
            "training_available": bool(training_context.get("had_recent_workout")),
        },
        "indoor": indoor,
        "outdoor": outdoor,
        "training_context": training_context,
        "findings": findings,
        "actions": actions,
        "explanation": explanation,
    }
