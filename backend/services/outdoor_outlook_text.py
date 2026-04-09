"""
Build the same outdoor outlook paragraph as `OutdoorDayAdvicePanel.jsx` (dashboard).

Used for scheduled Discord digests at 7:00 local time — always "today's" plan (not the post-18:00 next-day shift).
"""

from __future__ import annotations

import math
from datetime import UTC, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

# ---------------------------------------------------------------------------
# Time / locale helpers (mirror JS)
# ---------------------------------------------------------------------------


def _parse_time(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=UTC)
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return None
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        try:
            dt = datetime.fromisoformat(s)
        except ValueError:
            return None
        return dt if dt.tzinfo else dt.replace(tzinfo=UTC)
    return None


def _get_tz(name: str | None) -> ZoneInfo:
    if not name or not str(name).strip():
        return ZoneInfo("UTC")
    try:
        return ZoneInfo(str(name).strip())
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


def _get_date_parts(dt: datetime, tz_name: str) -> dict[str, Any]:
    tz = _get_tz(tz_name)
    local = dt.astimezone(tz)
    return {
        "year": f"{local.year:04d}",
        "month": f"{local.month:02d}",
        "day": f"{local.day:02d}",
        "hour": local.hour,
    }


def _get_date_key(dt: datetime, tz_name: str) -> str:
    p = _get_date_parts(dt, tz_name)
    return f"{p['year']}-{p['month']}-{p['day']}"


def _get_hour_key(dt: datetime, tz_name: str) -> str:
    p = _get_date_parts(dt, tz_name)
    return f"{p['year']}-{p['month']}-{p['day']}-{p['hour']:02d}"


def _add_days_like_js(now: datetime, count: int) -> datetime:
    if now.tzinfo is None:
        now = now.replace(tzinfo=UTC)
    utc = now.astimezone(UTC)
    return utc + timedelta(days=count)


def _format_time_label(dt: datetime, tz_name: str) -> str:
    tz = _get_tz(tz_name)
    local = dt.astimezone(tz)
    return f"{local.hour:02d}:{local.minute:02d}"


def _is_finite_number(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, bool):
        return False
    if isinstance(value, (int, float)):
        return math.isfinite(float(value))
    return False


def _to_float(value: Any) -> float | None:
    if not _is_finite_number(value):
        return None
    return float(value)


# ---------------------------------------------------------------------------
# Row builders
# ---------------------------------------------------------------------------


def _get_current_row(air_data: dict[str, Any], tz_name: str) -> dict[str, Any] | None:
    current = air_data.get("current")
    if not isinstance(current, dict):
        return None

    ts = _parse_time(
        current.get("time")
        or (air_data.get("measurement_window") or {}).get("from")
        or (air_data.get("measurement_window") or {}).get("to")
        or (air_data.get("cache") or {}).get("created_at")
    )
    if ts is None:
        return None

    row = {**current, "__date": ts, "__hour_key": _get_hour_key(ts, tz_name)}
    return row


def _normalize_forecast_rows(air_data: dict[str, Any], tz_name: str) -> list[dict[str, Any]]:
    raw = air_data.get("forecast")
    if not isinstance(raw, list):
        return []

    rows: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        ts = _parse_time(item.get("time"))
        if ts is None:
            continue
        rows.append({**item, "__date": ts, "__hour_key": _get_hour_key(ts, tz_name)})
    rows.sort(key=lambda r: r["__date"])
    return rows


def _get_rows_for_offset(
    air_data: dict[str, Any],
    tz_name: str,
    day_offset: int,
    now: datetime,
) -> list[dict[str, Any]]:
    target_key = _get_date_key(_add_days_like_js(now, day_offset), tz_name)
    forecast_rows = _normalize_forecast_rows(air_data, tz_name)
    rows = [r for r in forecast_rows if _get_date_key(r["__date"], tz_name) == target_key]

    if day_offset != 0:
        return rows

    current_row = _get_current_row(air_data, tz_name)
    if current_row and _get_date_key(current_row["__date"], tz_name) == target_key:
        same_hour = any(r.get("__hour_key") == current_row.get("__hour_key") for r in rows)
        if not same_hour:
            rows = [current_row, *rows]
            rows.sort(key=lambda r: r["__date"])
    return rows


def _collect_numeric_values(rows: list[dict[str, Any]], key: str) -> list[float]:
    out: list[float] = []
    for row in rows:
        v = _to_float(row.get(key))
        if v is not None:
            out.append(v)
    return out


def _get_range(rows: list[dict[str, Any]], key: str) -> dict[str, float] | None:
    values = _collect_numeric_values(rows, key)
    if not values:
        return None
    return {"min": min(values), "max": max(values)}


def _get_peak_row(rows: list[dict[str, Any]], key: str) -> dict[str, Any] | None:
    best: dict[str, Any] | None = None
    best_val: float | None = None
    for row in rows:
        v = _to_float(row.get(key))
        if v is None:
            continue
        if best_val is None or v > best_val:
            best_val = v
            best = row
    return best


def _get_sum(rows: list[dict[str, Any]], key: str) -> float | None:
    values = _collect_numeric_values(rows, key)
    if not values:
        return None
    return sum(values)


def _is_dayish(row: dict[str, Any]) -> bool:
    v = row.get("is_day")
    if v is None:
        return True
    return v != 0


def _get_plan_daytime_outdoor_rows(rows: list[dict[str, Any]], tz_name: str) -> list[dict[str, Any]]:
    if not rows:
        return rows
    work = [r for r in rows if _is_dayish(r)]
    if not work:
        work = rows

    def in_clock(r: dict[str, Any]) -> bool:
        d = r.get("__date")
        if not isinstance(d, datetime):
            return True
        h = _get_date_parts(d, tz_name)["hour"]
        return 6 <= int(h) <= 21

    clock_filtered = [r for r in work if in_clock(r)]
    return clock_filtered if clock_filtered else work


def _get_sky_condition(row: dict[str, Any]) -> dict[str, str]:
    code = row.get("weather_code")
    is_day = row.get("is_day")
    try:
        code_int = int(code) if code is not None else None
    except (TypeError, ValueError):
        code_int = None

    is_day_flag = is_day not in (0, False)

    storm = {95, 96, 99}
    snow = {71, 73, 75, 77, 85, 86}
    rain = {51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82}
    fog = {45, 48}

    if code_int in storm:
        return {"label": "Storm risk", "sunlight": "low"}
    if code_int in snow:
        return {"label": "Snowy", "sunlight": "low"}
    if code_int in rain:
        return {"label": "Rainy", "sunlight": "low"}
    if code_int in fog:
        return {"label": "Foggy", "sunlight": "low"}
    if code_int == 0:
        return {"label": "Sunny" if is_day_flag else "Clear", "sunlight": "high"}
    if code_int == 1:
        return {"label": "Mostly sunny", "sunlight": "medium-high"}
    if code_int == 2:
        return {"label": "Partly cloudy", "sunlight": "medium"}
    if code_int == 3:
        return {"label": "Very cloudy", "sunlight": "low"}
    return {"label": "Mixed sky", "sunlight": "unknown"}


def _probe_field(row: dict[str, Any] | None, key: str) -> Any:
    if not row or key not in row:
        return None
    return row[key]


def _get_air_quality_band(pm25: Any, pm10: Any) -> dict[str, str]:
    severity = 0

    p25 = _to_float(pm25)
    if p25 is not None:
        if p25 <= 10:
            s = 0
        elif p25 <= 20:
            s = 1
        elif p25 <= 25:
            s = 2
        elif p25 <= 50:
            s = 3
        else:
            s = 4
        severity = max(severity, s)

    p10 = _to_float(pm10)
    if p10 is not None:
        if p10 <= 20:
            s = 0
        elif p10 <= 35:
            s = 1
        elif p10 <= 50:
            s = 2
        elif p10 <= 100:
            s = 3
        else:
            s = 4
        severity = max(severity, s)

    if p25 is None and p10 is None:
        return {"label": "Unknown", "tone": "muted"}
    if severity == 0:
        return {"label": "Good air", "tone": "good"}
    if severity == 1:
        return {"label": "Mostly fine", "tone": "ok"}
    if severity == 2:
        return {"label": "Watch air quality", "tone": "caution"}
    if severity == 3:
        return {"label": "Poor air", "tone": "warning"}
    return {"label": "Very polluted", "tone": "danger"}


def _get_plan_day_air_band(
    selected_rows: list[dict[str, Any]],
    baseline_current: dict[str, Any] | None,
    tz_name: str,
) -> dict[str, str]:
    plan_rows = _get_plan_daytime_outdoor_rows(selected_rows, tz_name)
    peak_pm25 = _get_peak_row(plan_rows, "pm25")
    peak_pm10 = _get_peak_row(plan_rows, "pm10")
    pm25 = peak_pm25.get("pm25") if peak_pm25 else None
    pm10 = peak_pm10.get("pm10") if peak_pm10 else None
    if not _is_finite_number(pm25):
        pm25 = baseline_current.get("pm25") if baseline_current else None
    if not _is_finite_number(pm10):
        pm10 = baseline_current.get("pm10") if baseline_current else None
    return _get_air_quality_band(pm25, pm10)


def _get_cloud_sentence(
    cloud_cover_range: dict[str, float] | None,
    representative_sky_row: dict[str, Any] | None,
) -> str:
    sky = _get_sky_condition(representative_sky_row or {})
    min_c = cloud_cover_range["min"] if cloud_cover_range else None
    max_c = cloud_cover_range["max"] if cloud_cover_range else None
    if _is_finite_number(min_c) and _is_finite_number(max_c):
        assert min_c is not None and max_c is not None
        span = max_c - min_c
        avg = (min_c + max_c) / 2
        if span >= 70:
            return "Cloud cover swings widely through the day."
        if avg >= 65:
            return "Expect mostly cloudy skies."
        if avg <= 40:
            return "Skies look fairly bright overall."
        return "Expect a mix of sun and cloud."
    if sky["label"] in ("Sunny", "Mostly sunny"):
        return "Plenty of sunshine is expected."
    if sky["label"] in ("Very cloudy", "Foggy"):
        return "Skies stay mostly grey or overcast."
    if sky["label"] in ("Rainy", "Storm risk", "Snowy"):
        return "Clouds hang around with unsettled-looking skies."
    return "Sky conditions may shift during the day."


def _get_overall_outdoor_label(
    *,
    temp_range: dict[str, float] | None,
    total_rain: float | None,
    peak_wind_row: dict[str, Any] | None,
    air_band: dict[str, str],
    representative_sky_row: dict[str, Any] | None,
) -> dict[str, str]:
    max_t = temp_range["max"] if temp_range else None
    min_t = temp_range["min"] if temp_range else None
    wms = _to_float(peak_wind_row.get("wind_speed_ms")) if peak_wind_row else None
    wind_kmh = wms * 3.6 if wms is not None else None
    code = representative_sky_row.get("weather_code") if representative_sky_row else None
    try:
        code_int = int(code) if code is not None else None
    except (TypeError, ValueError):
        code_int = None

    snow_codes = {71, 73, 75, 77, 85, 86}
    storm_codes = {95, 96, 99}

    if code_int in snow_codes:
        return {"label": "Snowy", "tone": "caution"}
    if code_int in storm_codes or (_is_finite_number(total_rain) and total_rain is not None and total_rain >= 6):
        return {"label": "Stormy", "tone": "danger"}

    rainy = _is_finite_number(total_rain) and total_rain is not None and total_rain >= 1
    windy = _is_finite_number(wind_kmh) and wind_kmh is not None and wind_kmh >= 28
    very_windy = _is_finite_number(wind_kmh) and wind_kmh is not None and wind_kmh >= 40

    if rainy and very_windy:
        return {"label": "Rainy and windy", "tone": "caution"}
    if rainy and total_rain is not None and total_rain >= 4:
        return {"label": "Rainy day", "tone": "caution"}
    if rainy:
        return {"label": "Showers", "tone": "caution"}

    if _is_finite_number(max_t) and max_t is not None and max_t <= 8:
        return {"label": "Cold day", "tone": "cold"}
    if (
        _is_finite_number(min_t)
        and min_t is not None
        and min_t <= 2
        and _is_finite_number(max_t)
        and max_t is not None
        and max_t <= 14
    ):
        return {"label": "Cold day", "tone": "cold"}
    if _is_finite_number(max_t) and max_t is not None and max_t >= 29:
        return {"label": "Hot day", "tone": "caution" if very_windy else "good"}

    if air_band["tone"] in ("danger", "warning"):
        return {"label": "Poor air", "tone": "danger"}
    if very_windy:
        return {"label": "Very windy", "tone": "caution"}
    if air_band["tone"] == "caution":
        return {"label": "Mixed conditions", "tone": "caution"}
    if windy:
        return {"label": "Breezy", "tone": "good"}
    if air_band["tone"] in ("good", "ok", "muted"):
        if (
            _is_finite_number(max_t)
            and max_t is not None
            and 18 <= max_t <= 27
            and _is_finite_number(min_t)
            and min_t is not None
            and min_t >= 6
        ):
            return {"label": "Perfect", "tone": "good"}
        return {"label": "Great day", "tone": "good"}
    return {"label": "Mixed conditions", "tone": "caution"}


def _build_outdoor_activity_summary(
    *,
    day_name: str,
    temp_range: dict[str, float] | None,
    peak_wind_row: dict[str, Any] | None,
    total_rain: float | None,
    wettest_row: dict[str, Any] | None,
    air_band: dict[str, str],
    full_day_air_band: dict[str, str],
    cloud_cover_range: dict[str, float] | None,
    peak_uv_row: dict[str, Any] | None,
    representative_sky_row: dict[str, Any] | None,
    tz_name: str,
) -> str:
    parts: list[str] = []
    max_t = temp_range["max"] if temp_range else None
    min_t = temp_range["min"] if temp_range else None

    if _is_finite_number(max_t) and _is_finite_number(min_t) and max_t is not None and min_t is not None:
        if max_t <= 8:
            parts.append(f"{day_name} will be cold (high around {round(max_t)}°C).")
        elif max_t >= 29:
            parts.append(f"{day_name} will be hot (high around {round(max_t)}°C).")
        elif min_t <= 3:
            parts.append(f"{day_name} starts cold and climbs to about {round(max_t)}°C.")
        else:
            parts.append(f"{day_name} reaches about {round(max_t)}°C.")
    elif _is_finite_number(max_t) and max_t is not None:
        parts.append(f"{day_name} peaks near {round(max_t)}°C.")
    else:
        parts.append(f"{day_name}'s temperature forecast is limited.")

    wms = _to_float(peak_wind_row.get("wind_speed_ms")) if peak_wind_row else None
    wind_kmh = wms * 3.6 if wms is not None else None
    if not _is_finite_number(wind_kmh):
        parts.append("Wind strength is unclear from the forecast.")
    elif wind_kmh is not None and wind_kmh >= 45:
        parts.append("Strong winds are likely—cycling will feel harder.")
    elif wind_kmh >= 28:
        parts.append("Breezy at times; expect a bit more effort on the bike.")
    elif wind_kmh >= 15:
        parts.append("Winds look mild to moderate.")
    else:
        parts.append("Winds stay light.")

    if not _is_finite_number(total_rain) or total_rain is None or total_rain == 0:
        parts.append("Little or no rain is expected.")
    elif total_rain >= 4:
        wr = wettest_row.get("__date") if wettest_row else None
        t = _format_time_label(wr, tz_name) if isinstance(wr, datetime) else None
        parts.append(
            f"Wet weather is likely, especially around {t}."
            if t
            else "A wet day overall—plan rain gear if you ride."
        )
    elif total_rain >= 1:
        wr = wettest_row.get("__date") if wettest_row else None
        t = _format_time_label(wr, tz_name) if isinstance(wr, datetime) else None
        parts.append(
            f"Some showers are possible, notably around {t}."
            if t
            else "A few showers are possible."
        )
    else:
        parts.append("Only light precipitation may show up.")

    if air_band["tone"] in ("danger", "warning"):
        parts.append(
            "Daytime air may be rough for hard breathing—check the PM tiles below before an intense ride."
        )
    elif air_band["tone"] == "caution":
        parts.append("Daytime air is middling; shorter or easier rides are the safer bet.")
    elif air_band["tone"] in ("good", "ok"):
        parts.append("Daytime air looks fine for riding.")
    else:
        parts.append("Pollution readings are thin—peek at the metrics below before a long effort outside.")

    plan_easy = air_band["tone"] in ("good", "ok", "muted")
    full_rough = full_day_air_band["tone"] in ("warning", "danger")
    if plan_easy and full_rough:
        parts.append("Pollution may rise later in the evening; the PM2.5 tile shows the full-day peak.")

    parts.append(_get_cloud_sentence(cloud_cover_range, representative_sky_row))

    uv = peak_uv_row.get("uv_index") if peak_uv_row else None
    uvf = _to_float(uv)
    if _is_finite_number(uvf) and uvf is not None and uvf >= 4:
        pr = peak_uv_row.get("__date") if peak_uv_row else None
        peak_time = _format_time_label(pr, tz_name) if isinstance(pr, datetime) else None
        if uvf >= 7:
            parts.append(
                f"UV is strong around {peak_time}; sunscreen or cover helps on a long ride."
                if peak_time
                else "UV is strong; sun protection helps on a long ride."
            )
        else:
            parts.append(f"Moderate UV around {peak_time}." if peak_time else "UV is moderate.")

    return " ".join(parts)


def _build_bike_ride_closing_line(
    air_band: dict[str, str],
    total_rain: float | None,
    wind_kmh: float | None,
    max_temp: float | None,
) -> str:
    if _is_finite_number(max_temp) and max_temp is not None and max_temp <= 8:
        return "Dress warmly in layers; cold air hits harder on a bike than a short walk."
    if air_band["tone"] in ("danger", "warning"):
        return "Hard efforts may feel harsh on the lungs until air improves—use the readings below to decide."
    if _is_finite_number(total_rain) and total_rain is not None and total_rain >= 4:
        return "Riding is still possible with waterproof kit; watch for slick roads."
    if _is_finite_number(wind_kmh) and wind_kmh is not None and wind_kmh >= 40:
        return "Gusty wind can drain energy quickly—consider a shorter route."
    if air_band["tone"] == "caution":
        return "An easy spin is reasonable; save all-out intervals for a clearer-air day if you feel it."
    return "Overall reasonable for a bike ride if you dress for the temperature."


def build_outdoor_outlook_paragraph_and_label(
    air_data: dict[str, Any],
    *,
    timezone_name: str | None,
    now: datetime | None = None,
) -> tuple[str, str] | None:
    """
    Returns (summary_paragraph, overall_badge_label) matching the dashboard card, or None.
    """
    tz_name = (timezone_name or "").strip() or "UTC"
    now = now or datetime.now(UTC)
    if now.tzinfo is None:
        now = now.replace(tzinfo=UTC)

    current_row = _get_current_row(air_data, tz_name)
    today_rows = _get_rows_for_offset(air_data, tz_name, 0, now)

    if not today_rows and not current_row:
        return None

    selected_rows = today_rows if today_rows else ([current_row] if current_row else [])
    baseline = current_row

    temp_range = _get_range(selected_rows, "temperature_c")
    cloud_cover_range = _get_range(selected_rows, "cloud_cover_pct")
    total_rain = _get_sum(selected_rows, "rain_mm")
    wettest_row = _get_peak_row(selected_rows, "rain_mm")
    peak_wind_row = _get_peak_row(selected_rows, "wind_speed_ms")
    peak_uv_row = _get_peak_row(selected_rows, "uv_index")
    peak_pm25_row = _get_peak_row(selected_rows, "pm25")
    peak_pm10_row = _get_peak_row(selected_rows, "pm10")

    rep = next((r for r in selected_rows if r.get("weather_code") is not None), None)
    representative = rep or (selected_rows[0] if selected_rows else None)

    pm25_full = _probe_field(peak_pm25_row, "pm25")
    if pm25_full is None and baseline:
        pm25_full = baseline.get("pm25")
    pm10_full = _probe_field(peak_pm10_row, "pm10")
    if pm10_full is None and baseline:
        pm10_full = baseline.get("pm10")
    air_full = _get_air_quality_band(pm25_full, pm10_full)
    air_plan = _get_plan_day_air_band(selected_rows, baseline, tz_name)

    wms = _to_float(peak_wind_row.get("wind_speed_ms")) if peak_wind_row else None
    wind_kmh = wms * 3.6 if wms is not None else None

    overall = _get_overall_outdoor_label(
        temp_range=temp_range,
        total_rain=total_rain,
        peak_wind_row=peak_wind_row,
        air_band=air_plan,
        representative_sky_row=representative,
    )

    activity = _build_outdoor_activity_summary(
        day_name="Today",
        temp_range=temp_range,
        peak_wind_row=peak_wind_row,
        total_rain=total_rain,
        wettest_row=wettest_row,
        air_band=air_plan,
        full_day_air_band=air_full,
        cloud_cover_range=cloud_cover_range,
        peak_uv_row=peak_uv_row,
        representative_sky_row=representative,
        tz_name=tz_name,
    )
    max_t = temp_range["max"] if temp_range else None
    closing = _build_bike_ride_closing_line(air_plan, total_rain, wind_kmh, max_t)
    return f"{activity} {closing}", overall["label"]


def build_outdoor_outlook_paragraph(
    air_data: dict[str, Any],
    *,
    timezone_name: str | None,
    now: datetime | None = None,
) -> str | None:
    """
    Returns the dashboard-style outlook paragraph for *today* in the user's timezone,
    or None if there is not enough data.
    """
    bundle = build_outdoor_outlook_paragraph_and_label(
        air_data, timezone_name=timezone_name, now=now
    )
    return bundle[0] if bundle else None


def build_discord_outlook_message(
    *,
    location_label: str,
    outlook_paragraph: str,
    overall_label: str | None = None,
) -> str:
    header = "Outdoor outlook"
    if location_label.strip():
        header = f"{header} — {location_label.strip()}"
    lines = [f"**{header}**"]
    if overall_label:
        lines.append(f"_{overall_label}_")
    lines.append(outlook_paragraph)
    return "\n\n".join(lines)
