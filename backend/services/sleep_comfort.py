from __future__ import annotations

from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

from backend.schemas.suggestions import SleepSuggestion, VentilationContext

APP_DISPLAY_TIMEZONE = ZoneInfo("Europe/Warsaw")


def evaluate_sleep_temperature(
    *,
    outdoor_data: dict | None,
    context: VentilationContext,
    ideal_min: float,
    ideal_max: float,
    now_utc: datetime | None = None,
) -> SleepSuggestion | None:
    sleep_window_temps = _extract_sleep_window_temperatures(
        outdoor_data=outdoor_data,
        fallback_temperature=context.outdoor_temperature_c,
        now_utc=now_utc,
    )
    if not sleep_window_temps:
        return None

    avg_temp = sum(sleep_window_temps) / len(sleep_window_temps)
    if ideal_min <= avg_temp <= ideal_max:
        return None

    too_warm = avg_temp > ideal_max
    recommendation = (
        "It may be too warm tonight for ideal sleep comfort."
        if too_warm
        else "It may be too cold tonight for ideal sleep comfort."
    )
    note_suffix = (
        f" The overnight temperature trend looks around {round(avg_temp)}°C."
        if abs(avg_temp - (ideal_max if too_warm else ideal_min)) >= 1
        else ""
    )

    return SleepSuggestion(
        id="sleep_temp_too_warm" if too_warm else "sleep_temp_too_cold",
        priority="medium",
        severity="caution",
        title="Nighttime temperature is outside the ideal sleep range tonight",
        short_label="Sleep comfort",
        recommendation=recommendation + note_suffix,
        impact=(
            "Bedroom temperature can affect sleep comfort and make it harder to "
            "rest well."
        ),
        primary_reason=recommendation,
        reasons=[
            "Night may be too warm" if too_warm else "Night may be too cold",
        ],
        based_on=["outdoor_temperature_c"],
    )


def _extract_sleep_window_temperatures(
    *,
    outdoor_data: dict | None,
    fallback_temperature: float | None,
    now_utc: datetime | None,
) -> list[float]:
    rows: list[dict] = []
    if isinstance(outdoor_data, dict):
        current = outdoor_data.get("current")
        if isinstance(current, dict):
            rows.append(current)
        for series_name in ("history", "forecast"):
            series = outdoor_data.get(series_name)
            if isinstance(series, list):
                rows.extend(row for row in series if isinstance(row, dict))

    current_utc = now_utc.astimezone(UTC) if now_utc else datetime.now(UTC)
    window_start, window_end = _next_sleep_window(current_utc.astimezone(APP_DISPLAY_TIMEZONE))

    temps: list[float] = []
    for row in rows:
        temp = row.get("temperature_c")
        row_time = row.get("time")
        if temp is None or not isinstance(row_time, str):
            continue

        row_dt = _parse_iso(row_time)
        if row_dt is None:
            continue
        local_dt = row_dt.astimezone(APP_DISPLAY_TIMEZONE)
        if window_start <= local_dt <= window_end:
            temps.append(float(temp))

    if temps:
        return temps

    if fallback_temperature is not None:
        return [float(fallback_temperature)]

    return []


def _next_sleep_window(local_now: datetime) -> tuple[datetime, datetime]:
    today = local_now.date()
    start_today = datetime.combine(today, time(22, 0), tzinfo=APP_DISPLAY_TIMEZONE)
    end_today = datetime.combine(today, time(6, 0), tzinfo=APP_DISPLAY_TIMEZONE)

    if local_now.hour < 6:
        return start_today - timedelta(days=1), end_today
    if local_now.hour >= 22:
        return start_today, end_today + timedelta(days=1)
    return start_today, end_today + timedelta(days=1)


def _parse_iso(value: str) -> datetime | None:
    try:
        if value.endswith("Z"):
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        return datetime.fromisoformat(value)
    except ValueError:
        return None
