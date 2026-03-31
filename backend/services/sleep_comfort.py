from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

from backend.schemas.suggestions import SleepSuggestion, VentilationContext

APP_DISPLAY_TIMEZONE = ZoneInfo("Europe/Warsaw")
SLEEP_RECOMMENDATION_START_HOUR = 20


@dataclass(frozen=True)
class _SleepWindowSummary:
    average_temp_c: float
    min_temp_c: float
    max_temp_c: float


def evaluate_sleep_temperature(
    *,
    outdoor_data: dict | None,
    context: VentilationContext,
    ideal_min: float,
    ideal_max: float,
    now_utc: datetime | None = None,
    respect_time_window: bool = True,
) -> SleepSuggestion | None:
    local_now = _current_local_time(now_utc)
    if respect_time_window and not _is_sleep_recommendation_time(local_now):
        return None

    indoor_temp = context.indoor_temperature_c
    overnight = _extract_sleep_window_summary(
        outdoor_data=outdoor_data,
        fallback_temperature=context.outdoor_temperature_c,
        now_utc=local_now.astimezone(UTC),
    )

    if indoor_temp is None and overnight is None:
        return None

    if _sleep_looks_comfortable(
        indoor_temp_c=indoor_temp,
        overnight=overnight,
        ideal_min=ideal_min,
        ideal_max=ideal_max,
    ):
        return None

    too_warm = _is_sleep_too_warm(
        indoor_temp_c=indoor_temp,
        overnight=overnight,
        ideal_max=ideal_max,
    )

    recommendation = _build_recommendation(
        too_warm=too_warm,
        indoor_temp_c=indoor_temp,
        overnight=overnight,
        ideal_min=ideal_min,
        ideal_max=ideal_max,
    )
    reasons = _build_reason_tags(
        too_warm=too_warm,
        indoor_temp_c=indoor_temp,
        overnight=overnight,
    )
    based_on = _build_based_on_fields(indoor_temp, overnight)

    return SleepSuggestion(
        id="sleep_temp_too_warm" if too_warm else "sleep_temp_too_cold",
        priority="medium",
        severity="caution",
        title="Bedroom temperature may move outside the ideal sleep range tonight",
        short_label="Sleep comfort",
        recommendation=recommendation,
        impact=(
            "Bedroom temperature can affect sleep comfort and make it harder to "
            "rest well."
        ),
        primary_reason=recommendation,
        reasons=reasons,
        based_on=based_on,
    )


def _current_local_time(now_utc: datetime | None) -> datetime:
    current_utc = now_utc.astimezone(UTC) if now_utc else datetime.now(UTC)
    return current_utc.astimezone(APP_DISPLAY_TIMEZONE)


def _is_sleep_recommendation_time(local_now: datetime) -> bool:
    return local_now.hour >= SLEEP_RECOMMENDATION_START_HOUR


def _sleep_looks_comfortable(
    *,
    indoor_temp_c: float | None,
    overnight: _SleepWindowSummary | None,
    ideal_min: float,
    ideal_max: float,
) -> bool:
    indoor_ok = indoor_temp_c is None or ideal_min <= indoor_temp_c <= ideal_max
    overnight_ok = (
        overnight is None
        or (ideal_min <= overnight.average_temp_c <= ideal_max)
    )
    return indoor_ok and overnight_ok


def _is_sleep_too_warm(
    *,
    indoor_temp_c: float | None,
    overnight: _SleepWindowSummary | None,
    ideal_max: float,
) -> bool:
    indoor_too_warm = indoor_temp_c is not None and indoor_temp_c > ideal_max
    overnight_too_warm = (
        overnight is not None
        and overnight.average_temp_c > ideal_max
    )
    return indoor_too_warm or overnight_too_warm


def _build_recommendation(
    *,
    too_warm: bool,
    indoor_temp_c: float | None,
    overnight: _SleepWindowSummary | None,
    ideal_min: float,
    ideal_max: float,
) -> str:
    sentence_parts: list[str] = []
    ideal_range = f"{round(ideal_min)}\u00B0C-{round(ideal_max)}\u00B0C"

    if indoor_temp_c is not None and overnight is not None:
        sentence_parts.append(
            f"The bedroom is around {round(indoor_temp_c)}\u00B0C now, but it may become too {'warm' if too_warm else 'cold'} tonight for ideal sleep comfort. The ideal sleep range is about {ideal_range}."
        )
    elif indoor_temp_c is not None:
        sentence_parts.append(
            f"The bedroom is around {round(indoor_temp_c)}\u00B0C now, which is outside the ideal sleep range of about {ideal_range}."
        )
    else:
        sentence_parts.append(
            f"The bedroom may become too {'warm' if too_warm else 'cold'} tonight for ideal sleep comfort. The ideal sleep range is about {ideal_range}."
        )

    if overnight is not None:
        transition = "stay" if too_warm else "drop"
        sentence_parts.append(
            f"Outdoor temperatures are expected to {transition} around {round(overnight.average_temp_c)}\u00B0C overnight."
        )

    return " ".join(sentence_parts)


def _build_reason_tags(
    *,
    too_warm: bool,
    indoor_temp_c: float | None,
    overnight: _SleepWindowSummary | None,
) -> list[str]:
    tags = [
        "Night may be too warm" if too_warm else "Night may be too cold",
    ]
    if indoor_temp_c is not None:
        tags.append("Indoor temp now")
    if overnight is not None:
        tags.append("Outdoor temp trend")
    return tags


def _build_based_on_fields(
    indoor_temp_c: float | None,
    overnight: _SleepWindowSummary | None,
) -> list[str]:
    fields: list[str] = []
    if indoor_temp_c is not None:
        fields.append("indoor_temperature_c")
    if overnight is not None:
        fields.append("outdoor_temperature_c")
    return fields


def _extract_sleep_window_summary(
    *,
    outdoor_data: dict | None,
    fallback_temperature: float | None,
    now_utc: datetime | None,
) -> _SleepWindowSummary | None:
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
    window_start, window_end = _next_sleep_window(
        current_utc.astimezone(APP_DISPLAY_TIMEZONE)
    )

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
        return _SleepWindowSummary(
            average_temp_c=sum(temps) / len(temps),
            min_temp_c=min(temps),
            max_temp_c=max(temps),
        )

    if fallback_temperature is not None:
        temp_value = float(fallback_temperature)
        return _SleepWindowSummary(
            average_temp_c=temp_value,
            min_temp_c=temp_value,
            max_temp_c=temp_value,
        )

    return None


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
