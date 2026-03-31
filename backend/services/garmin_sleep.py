from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from typing import Any

STAGE_SOURCE_KEY = "sleep_data"
SUMMARY_SOURCE_KEY = "aggregator"


def _parse_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _parse_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _parse_local_datetime(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        return datetime.fromisoformat(value.strip())
    except ValueError:
        return None


def _parse_named_gmt_datetime(value: Any) -> datetime | None:
    naive = _parse_local_datetime(value)
    if naive is None:
        return None
    return naive.replace(tzinfo=UTC)


def _extract_local_utc_offset(row: dict[str, Any]) -> timedelta:
    local_start = _parse_local_datetime(row.get("wellnessStartTimeLocal"))
    gmt_start = _parse_local_datetime(row.get("wellnessStartTimeGmt"))
    if local_start is not None and gmt_start is not None:
        return local_start - gmt_start

    local_end = _parse_local_datetime(row.get("wellnessEndTimeLocal"))
    gmt_end = _parse_local_datetime(row.get("wellnessEndTimeGmt"))
    if local_end is not None and gmt_end is not None:
        return local_end - gmt_end

    return timedelta(0)


def _local_to_utc(value: datetime | None, offset: timedelta) -> datetime | None:
    if value is None:
        return None
    return (value - offset).replace(tzinfo=UTC)


def _minutes_since_midnight(value: datetime | None) -> int | None:
    if value is None:
        return None
    return value.hour * 60 + value.minute


def _parse_seconds_to_minutes(value: Any) -> int | None:
    seconds = _parse_int(value)
    if seconds is None or seconds < 0:
        return None
    return round(seconds / 60)


def _extract_body_battery_stats(row: dict[str, Any]) -> dict[str, dict[str, Any]]:
    body_battery = row.get("bodyBattery")
    if not isinstance(body_battery, dict):
        return {}

    stats = body_battery.get("bodyBatteryStatList")
    if not isinstance(stats, list):
        return {}

    normalized: dict[str, dict[str, Any]] = {}
    for entry in stats:
        if not isinstance(entry, dict):
            continue
        stat_type = entry.get("bodyBatteryStatType")
        if isinstance(stat_type, str) and stat_type not in normalized:
            normalized[stat_type] = entry
    return normalized


def _extract_stress_aggregate(row: dict[str, Any], aggregate_type: str) -> dict[str, Any] | None:
    all_day_stress = row.get("allDayStress")
    if not isinstance(all_day_stress, dict):
        return None

    aggregates = all_day_stress.get("aggregatorList")
    if not isinstance(aggregates, list):
        return None

    for aggregate in aggregates:
        if isinstance(aggregate, dict) and aggregate.get("type") == aggregate_type:
            return aggregate
    return None


def _parse_calendar_date(value: Any) -> date | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        return date.fromisoformat(value.strip())
    except ValueError:
        return None


def _midday_utc_for_date(value: date) -> datetime:
    return datetime.combine(value, time(hour=12, tzinfo=UTC))


def _to_float(value: Decimal | float | int | None) -> float | None:
    if value is None:
        return None
    return float(value)


def _normalize_garmin_summary_entry(
    row: dict[str, Any],
    *,
    source_file_name: str | None = None,
) -> dict[str, Any] | None:
    calendar_date = _parse_calendar_date(row.get("calendarDate"))
    if calendar_date is None:
        return None

    offset = _extract_local_utc_offset(row)
    body_battery_stats = _extract_body_battery_stats(row)
    asleep = _extract_stress_aggregate(row, "ASLEEP") or {}

    sleep_start_local = _parse_local_datetime(
        (body_battery_stats.get("SLEEPSTART") or {}).get("statTimestamp")
    )
    sleep_end_local = _parse_local_datetime(
        (body_battery_stats.get("SLEEPEND") or {}).get("statTimestamp")
    )

    sleep_start_at = _local_to_utc(sleep_start_local, offset)
    sleep_end_at = _local_to_utc(sleep_end_local, offset)

    sleep_duration_minutes = None
    if sleep_start_local is not None and sleep_end_local is not None:
        delta_minutes = round((sleep_end_local - sleep_start_local).total_seconds() / 60)
        if delta_minutes > 0:
            sleep_duration_minutes = delta_minutes

    if sleep_duration_minutes is None:
        total_duration_seconds = _parse_int(asleep.get("totalDuration"))
        if total_duration_seconds and total_duration_seconds > 0:
            sleep_duration_minutes = round(total_duration_seconds / 60)

    body_battery_start = _parse_int((body_battery_stats.get("SLEEPSTART") or {}).get("statsValue"))
    body_battery_end = _parse_int((body_battery_stats.get("SLEEPEND") or {}).get("statsValue"))
    body_battery_gain = None
    if body_battery_start is not None and body_battery_end is not None:
        body_battery_gain = body_battery_end - body_battery_start

    if body_battery_gain is None:
        body_battery_gain = _parse_int((row.get("bodyBattery") or {}).get("chargedValue"))

    sleep_stress_avg = _parse_float(asleep.get("averageStressLevel"))
    sleep_stress_max = _parse_int(asleep.get("maxStressLevel"))
    resting_heart_rate = _parse_int(row.get("restingHeartRate"))
    min_heart_rate = _parse_int(row.get("minHeartRate"))
    max_heart_rate = _parse_int(row.get("maxHeartRate"))
    avg_waking_respiration = _parse_float((row.get("respiration") or {}).get("avgWakingRespirationValue"))

    metrics_present = any(
        value is not None
        for value in (
            sleep_duration_minutes,
            sleep_stress_avg,
            body_battery_gain,
            resting_heart_rate,
            avg_waking_respiration,
        )
    )
    if not metrics_present:
        return None

    return {
        "calendar_date": calendar_date,
        "time": _midday_utc_for_date(calendar_date),
        "source_payload_key": SUMMARY_SOURCE_KEY,
        "external_uuid": str(row.get("uuid")).strip() if row.get("uuid") else None,
        "source_file_name": source_file_name,
        "wellness_start_at": _parse_named_gmt_datetime(row.get("wellnessStartTimeGmt")),
        "wellness_end_at": _parse_named_gmt_datetime(row.get("wellnessEndTimeGmt")),
        "sleep_start_at": sleep_start_at,
        "sleep_end_at": sleep_end_at,
        "sleep_start_local_minutes": _minutes_since_midnight(sleep_start_local),
        "sleep_end_local_minutes": _minutes_since_midnight(sleep_end_local),
        "sleep_duration_minutes": sleep_duration_minutes,
        "sleep_deep_minutes": None,
        "sleep_light_minutes": None,
        "sleep_rem_minutes": None,
        "sleep_awake_minutes": None,
        "sleep_unmeasurable_minutes": None,
        "sleep_window_confirmation_type": None,
        "sleep_stress_avg": sleep_stress_avg,
        "sleep_stress_max": sleep_stress_max,
        "body_battery_start": body_battery_start,
        "body_battery_end": body_battery_end,
        "body_battery_gain": body_battery_gain,
        "resting_heart_rate": resting_heart_rate,
        "min_heart_rate": min_heart_rate,
        "max_heart_rate": max_heart_rate,
        "avg_waking_respiration": avg_waking_respiration,
        "avg_sleep_respiration": None,
        "lowest_sleep_respiration": None,
        "highest_sleep_respiration": None,
        "raw_payload_json": row,
    }


def _normalize_garmin_stage_entry(
    row: dict[str, Any],
    *,
    source_file_name: str | None = None,
) -> dict[str, Any] | None:
    calendar_date = _parse_calendar_date(row.get("calendarDate"))
    if calendar_date is None:
        return None

    sleep_start_at = _parse_named_gmt_datetime(row.get("sleepStartTimestampGMT"))
    sleep_end_at = _parse_named_gmt_datetime(row.get("sleepEndTimestampGMT"))

    sleep_deep_minutes = _parse_seconds_to_minutes(row.get("deepSleepSeconds"))
    sleep_light_minutes = _parse_seconds_to_minutes(row.get("lightSleepSeconds"))
    sleep_rem_minutes = _parse_seconds_to_minutes(row.get("remSleepSeconds"))
    sleep_awake_minutes = _parse_seconds_to_minutes(row.get("awakeSleepSeconds"))
    sleep_unmeasurable_minutes = _parse_seconds_to_minutes(row.get("unmeasurableSeconds"))

    sleep_duration_minutes = None
    stage_sleep_minutes = [
        minutes
        for minutes in (sleep_deep_minutes, sleep_light_minutes, sleep_rem_minutes)
        if minutes is not None
    ]
    if stage_sleep_minutes:
        sleep_duration_minutes = sum(stage_sleep_minutes)
    elif sleep_start_at is not None and sleep_end_at is not None:
        delta_minutes = round((sleep_end_at - sleep_start_at).total_seconds() / 60)
        if delta_minutes > 0:
            sleep_duration_minutes = delta_minutes

    avg_sleep_respiration = _parse_float(row.get("averageRespiration"))
    lowest_sleep_respiration = _parse_float(row.get("lowestRespiration"))
    highest_sleep_respiration = _parse_float(row.get("highestRespiration"))

    metrics_present = any(
        value is not None
        for value in (
            sleep_duration_minutes,
            sleep_deep_minutes,
            sleep_light_minutes,
            sleep_rem_minutes,
            sleep_awake_minutes,
            sleep_unmeasurable_minutes,
            avg_sleep_respiration,
        )
    )
    if not metrics_present and sleep_start_at is None and sleep_end_at is None:
        return None

    return {
        "calendar_date": calendar_date,
        "time": _midday_utc_for_date(calendar_date),
        "source_payload_key": STAGE_SOURCE_KEY,
        "external_uuid": None,
        "source_file_name": source_file_name,
        "wellness_start_at": None,
        "wellness_end_at": None,
        "sleep_start_at": sleep_start_at,
        "sleep_end_at": sleep_end_at,
        "sleep_start_local_minutes": None,
        "sleep_end_local_minutes": None,
        "sleep_duration_minutes": sleep_duration_minutes,
        "sleep_deep_minutes": sleep_deep_minutes,
        "sleep_light_minutes": sleep_light_minutes,
        "sleep_rem_minutes": sleep_rem_minutes,
        "sleep_awake_minutes": sleep_awake_minutes,
        "sleep_unmeasurable_minutes": sleep_unmeasurable_minutes,
        "sleep_window_confirmation_type": (
            str(row.get("sleepWindowConfirmationType")).strip()
            if row.get("sleepWindowConfirmationType")
            else None
        ),
        "sleep_stress_avg": None,
        "sleep_stress_max": None,
        "body_battery_start": None,
        "body_battery_end": None,
        "body_battery_gain": None,
        "resting_heart_rate": None,
        "min_heart_rate": None,
        "max_heart_rate": None,
        "avg_waking_respiration": None,
        "avg_sleep_respiration": avg_sleep_respiration,
        "lowest_sleep_respiration": lowest_sleep_respiration,
        "highest_sleep_respiration": highest_sleep_respiration,
        "raw_payload_json": row,
    }


def normalize_garmin_sleep_entry(
    row: dict[str, Any],
    *,
    source_file_name: str | None = None,
) -> dict[str, Any] | None:
    if any(
        key in row
        for key in (
            "sleepStartTimestampGMT",
            "sleepEndTimestampGMT",
            "deepSleepSeconds",
            "lightSleepSeconds",
            "remSleepSeconds",
            "awakeSleepSeconds",
        )
    ):
        return _normalize_garmin_stage_entry(row, source_file_name=source_file_name)

    return _normalize_garmin_summary_entry(row, source_file_name=source_file_name)


def serialize_sleep_history_point(record: Any) -> dict[str, Any]:
    if record is None:
        return {}

    return {
        "time": _midday_utc_for_date(record.calendar_date),
        "calendar_date": record.calendar_date.isoformat(),
        "sample_count": 1,
        "sleep_start_at": record.sleep_start_at,
        "sleep_end_at": record.sleep_end_at,
        "sleep_duration_minutes": record.sleep_duration_minutes,
        "sleep_deep_minutes": record.sleep_deep_minutes,
        "sleep_light_minutes": record.sleep_light_minutes,
        "sleep_rem_minutes": record.sleep_rem_minutes,
        "sleep_awake_minutes": record.sleep_awake_minutes,
        "sleep_unmeasurable_minutes": record.sleep_unmeasurable_minutes,
        "sleep_window_confirmation_type": record.sleep_window_confirmation_type,
        "sleep_stress_avg": _to_float(record.sleep_stress_avg),
        "body_battery_gain": record.body_battery_gain,
        "resting_heart_rate": record.resting_heart_rate,
        "avg_waking_respiration": _to_float(record.avg_waking_respiration),
        "avg_sleep_respiration": _to_float(record.avg_sleep_respiration),
        "lowest_sleep_respiration": _to_float(record.lowest_sleep_respiration),
        "highest_sleep_respiration": _to_float(record.highest_sleep_respiration),
        "sleep_start_local_minutes": record.sleep_start_local_minutes,
        "sleep_end_local_minutes": record.sleep_end_local_minutes,
    }
