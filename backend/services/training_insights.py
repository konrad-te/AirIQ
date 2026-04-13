from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.models import GarminSleepSummary, GarminTrainingActivity, User

InsightWindowMode = Literal["day", "7d"]
RecoverySleepStatus = Literal["good", "mixed", "poor", "unknown"]
RecoveryRecommendationLevel = Literal["go", "easy", "rest"]

KILOJOULES_PER_KILOCALORIE = 4.184
TRAINING_WINDOW_DAYS = 7
LIGHT_DAY_DURATION_MINUTES = 45
HEAVY_DAY_DURATION_MINUTES = 90
VERY_HEAVY_DAY_DURATION_MINUTES = 150
LIGHT_DAY_CALORIES = 350
HEAVY_DAY_CALORIES = 900
VERY_HEAVY_DAY_CALORIES = 1400
HIGH_AVERAGE_HR_BPM = 150
SIGNIFICANT_DURATION_DELTA_MINUTES = 45
SIGNIFICANT_CALORIE_DELTA = 300
SIGNIFICANT_HR_DELTA = 8
GOOD_SLEEP_MINUTES_MIN = 420
GOOD_SLEEP_MINUTES_MAX = 540
SHORT_SLEEP_MINUTES = 390
LONG_SLEEP_MINUTES = 600
GOOD_BODY_BATTERY_GAIN = 50
LOW_BODY_BATTERY_GAIN = 35
LOW_DEEP_SLEEP_PCT = 12.0
HIGH_AWAKE_MINUTES = 60


def _to_float(value: Decimal | float | int | None) -> float | None:
    if value is None:
        return None
    return float(value)


def _to_optional_float(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _round(value: float | None, digits: int = 1) -> float | None:
    if value is None:
        return None
    return round(value, digits)


def _avg(values: list[float]) -> float | None:
    if not values:
        return None
    return sum(values) / len(values)


def _format_duration(minutes: float | None) -> str | None:
    if minutes is None:
        return None
    rounded = max(0, int(round(minutes)))
    hours = rounded // 60
    mins = rounded % 60
    return f"{hours}h {mins:02d}m"


def _format_short_date(value: date) -> str:
    return value.strftime("%d %b %Y")


def _window_days(window_mode: InsightWindowMode) -> int:
    return TRAINING_WINDOW_DAYS if window_mode == "7d" else 1


def _period_display_label(start_date: date, end_date: date, *, window_mode: InsightWindowMode) -> str:
    if window_mode == "day":
        return _format_short_date(end_date)
    return f"{_format_short_date(start_date)} - {_format_short_date(end_date)}"


def _comparison_label(window_mode: InsightWindowMode, period_count: int) -> str:
    if window_mode == "7d":
        return f"recent {period_count} comparable 7-day periods"
    return f"recent {period_count} comparable days"


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


def _normalize_strava_calories(raw_payload: dict[str, Any]) -> float | None:
    calories = _to_optional_float(raw_payload.get("calories"))
    if calories is not None:
        return calories

    kilojoules = _to_optional_float(raw_payload.get("kilojoules"))
    if kilojoules is not None:
        return round(kilojoules, 1)
    return None


def _activity_display_calories(activity: GarminTrainingActivity) -> float | None:
    raw_payload = activity.raw_payload_json if isinstance(activity.raw_payload_json, dict) else None
    if raw_payload:
        normalized_calories = _normalize_activity_calories(
            raw_payload.get("calories"),
            raw_payload.get("bmrCalories"),
        )
        if normalized_calories is not None:
            return normalized_calories

        if activity.provider == "strava":
            normalized_strava_calories = _normalize_strava_calories(raw_payload)
            if normalized_strava_calories is not None:
                return normalized_strava_calories

    return _to_float(activity.calories)


def _label_for_sport(activity: GarminTrainingActivity) -> tuple[str, str]:
    raw_value = activity.sport_type or activity.activity_type or "other"
    normalized = str(raw_value).strip().lower().replace(" ", "_")
    label = normalized.replace("_", " ").title()
    return normalized, label


def _activity_calendar_date(activity: GarminTrainingActivity) -> date | None:
    reference_time = activity.start_time_local or activity.start_time_gmt
    return reference_time.date() if reference_time is not None else None


def _load_status_from_totals(duration_minutes: float, total_calories: float, *, days: int) -> str:
    light_duration_limit = LIGHT_DAY_DURATION_MINUTES * days
    heavy_duration_limit = HEAVY_DAY_DURATION_MINUTES * days
    very_heavy_duration_limit = VERY_HEAVY_DAY_DURATION_MINUTES * days
    light_calorie_limit = LIGHT_DAY_CALORIES * days
    heavy_calorie_limit = HEAVY_DAY_CALORIES * days
    very_heavy_calorie_limit = VERY_HEAVY_DAY_CALORIES * days

    if duration_minutes >= very_heavy_duration_limit or total_calories >= very_heavy_calorie_limit:
        return "very_heavy"
    if duration_minutes >= heavy_duration_limit or total_calories >= heavy_calorie_limit:
        return "heavy"
    if duration_minutes <= light_duration_limit and total_calories <= light_calorie_limit:
        return "light"
    return "moderate"


def _query_user_training_rows(
    db: Session,
    *,
    user_id: int,
    provider: str = "garmin",
) -> list[GarminTrainingActivity]:
    return (
        db.execute(
            select(GarminTrainingActivity)
            .where(
                GarminTrainingActivity.user_id == user_id,
                GarminTrainingActivity.provider == provider,
            )
            .order_by(GarminTrainingActivity.start_time_gmt.desc().nullslast())
        )
        .scalars()
        .all()
    )


def _bucket_rows_by_date(rows: list[GarminTrainingActivity]) -> dict[date, list[GarminTrainingActivity]]:
    buckets: dict[date, list[GarminTrainingActivity]] = {}
    for row in rows:
        calendar_date = _activity_calendar_date(row)
        if calendar_date is None:
            continue
        buckets.setdefault(calendar_date, []).append(row)
    return buckets


def _iter_period_dates(start_date: date, end_date: date) -> list[date]:
    total_days = (end_date - start_date).days
    return [start_date + timedelta(days=offset) for offset in range(total_days + 1)]

def _aggregate_period(
    activities: list[GarminTrainingActivity],
    *,
    start_date: date,
    end_date: date,
    anchor_date: date,
    window_mode: InsightWindowMode,
) -> dict[str, Any]:
    total_duration_minutes = 0.0
    total_calories = 0.0
    weighted_hr_sum = 0.0
    weighted_hr_duration = 0.0
    total_distance_km = 0.0
    sport_minutes: dict[str, float] = {}
    sessions: list[dict[str, Any]] = []
    longest_session: dict[str, Any] | None = None
    active_dates: set[date] = set()

    for activity in sorted(
        activities,
        key=lambda item: item.start_time_local or item.start_time_gmt or datetime.min,
    ):
        duration_minutes = _to_float(activity.duration_minutes)
        calories = _activity_display_calories(activity)
        average_heart_rate = _to_float(activity.average_heart_rate)
        distance_km = _to_float(activity.distance_km)
        activity_date = _activity_calendar_date(activity)
        _, sport_label = _label_for_sport(activity)

        if activity_date is not None:
            active_dates.add(activity_date)
        if duration_minutes is not None:
            total_duration_minutes += duration_minutes
            sport_minutes[sport_label] = sport_minutes.get(sport_label, 0.0) + duration_minutes
        if calories is not None:
            total_calories += calories
        if distance_km is not None:
            total_distance_km += distance_km
        if average_heart_rate is not None and duration_minutes is not None and duration_minutes > 0:
            weighted_hr_sum += average_heart_rate * duration_minutes
            weighted_hr_duration += duration_minutes

        session_payload = {
            "activity_id": activity.activity_id,
            "name": activity.name,
            "sport_label": sport_label,
            "duration_minutes": _round(duration_minutes),
            "calories": _round(calories, 0),
            "average_heart_rate": _round(average_heart_rate, 0),
            "start_time_gmt": activity.start_time_gmt,
            "start_time_local": activity.start_time_local,
        }
        sessions.append(session_payload)

        if longest_session is None or (duration_minutes or 0) > (longest_session.get("duration_minutes") or 0):
            longest_session = session_payload

    sorted_sports = sorted(sport_minutes.items(), key=lambda item: item[1], reverse=True)
    weighted_average_heart_rate = (
        _round(weighted_hr_sum / weighted_hr_duration, 1)
        if weighted_hr_duration > 0
        else None
    )
    total_duration_minutes = _round(total_duration_minutes, 1) or 0.0
    total_calories = _round(total_calories, 0) or 0.0
    total_distance_km = _round(total_distance_km, 1)

    return {
        "calendar_date": anchor_date.isoformat(),
        "anchor_date": anchor_date.isoformat(),
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "window_mode": window_mode,
        "window_label": _period_display_label(start_date, end_date, window_mode=window_mode),
        "activity_count": len(activities),
        "active_day_count": len(active_dates),
        "total_duration_minutes": total_duration_minutes,
        "duration_label": _format_duration(total_duration_minutes),
        "total_calories": total_calories,
        "weighted_average_heart_rate": weighted_average_heart_rate,
        "total_distance_km": total_distance_km if total_distance_km and total_distance_km > 0 else None,
        "primary_sport_label": sorted_sports[0][0] if sorted_sports else None,
        "top_sports": [
            {"label": label, "duration_minutes": _round(minutes, 1)}
            for label, minutes in sorted_sports[:3]
        ],
        "longest_session": longest_session,
        "sessions": sessions,
        "load_status": _load_status_from_totals(
            total_duration_minutes,
            total_calories,
            days=_window_days(window_mode),
        ),
    }


def _aggregate_period_from_buckets(
    day_buckets: dict[date, list[GarminTrainingActivity]],
    *,
    start_date: date,
    end_date: date,
    anchor_date: date,
    window_mode: InsightWindowMode,
) -> dict[str, Any]:
    period_rows: list[GarminTrainingActivity] = []
    for current_date in _iter_period_dates(start_date, end_date):
        period_rows.extend(day_buckets.get(current_date, []))
    return _aggregate_period(
        period_rows,
        start_date=start_date,
        end_date=end_date,
        anchor_date=anchor_date,
        window_mode=window_mode,
    )


def _load_recent_period_baseline(
    day_buckets: dict[date, list[GarminTrainingActivity]],
    *,
    period_start: date,
    window_mode: InsightWindowMode,
    period_count: int = 4,
) -> dict[str, Any]:
    if not day_buckets:
        return {
            "available": False,
            "period_count": 0,
            "window_size_days": _window_days(window_mode),
            "comparison_label": None,
            "average_activity_count": None,
            "average_active_day_count": None,
            "average_duration_minutes": None,
            "average_calories": None,
            "average_heart_rate": None,
        }

    window_days = _window_days(window_mode)
    earliest_available_date = min(day_buckets)
    aggregates: list[dict[str, Any]] = []

    for index in range(1, period_count + 1):
        end_date = period_start - timedelta(days=((index - 1) * window_days) + 1)
        start_date = end_date - timedelta(days=window_days - 1)
        if start_date < earliest_available_date:
            break
        aggregates.append(
            _aggregate_period_from_buckets(
                day_buckets,
                start_date=start_date,
                end_date=end_date,
                anchor_date=end_date,
                window_mode=window_mode,
            )
        )

    if not aggregates:
        return {
            "available": False,
            "period_count": 0,
            "window_size_days": window_days,
            "comparison_label": None,
            "average_activity_count": None,
            "average_active_day_count": None,
            "average_duration_minutes": None,
            "average_calories": None,
            "average_heart_rate": None,
        }

    return {
        "available": True,
        "period_count": len(aggregates),
        "window_size_days": window_days,
        "comparison_label": _comparison_label(window_mode, len(aggregates)),
        "average_activity_count": _round(_avg([float(item["activity_count"]) for item in aggregates]), 1),
        "average_active_day_count": _round(_avg([float(item["active_day_count"]) for item in aggregates]), 1),
        "average_duration_minutes": _round(_avg([float(item["total_duration_minutes"]) for item in aggregates]), 0),
        "average_calories": _round(_avg([float(item["total_calories"]) for item in aggregates]), 0),
        "average_heart_rate": _round(
            _avg([
                float(item["weighted_average_heart_rate"])
                for item in aggregates
                if item.get("weighted_average_heart_rate") is not None
            ]),
            0,
        ),
    }


def _build_day_summaries(
    day_buckets: dict[date, list[GarminTrainingActivity]],
    *,
    start_date: date,
    end_date: date,
) -> dict[str, dict[str, Any]]:
    summaries: dict[str, dict[str, Any]] = {}
    for current_date in _iter_period_dates(start_date, end_date):
        rows = day_buckets.get(current_date, [])
        summaries[current_date.isoformat()] = _aggregate_period(
            rows,
            start_date=current_date,
            end_date=current_date,
            anchor_date=current_date,
            window_mode="day",
        )
    return summaries


def _load_recent_sleep_summary(db: Session, *, user_id: int, target_date: date) -> GarminSleepSummary | None:
    return (
        db.execute(
            select(GarminSleepSummary)
            .where(
                GarminSleepSummary.user_id == user_id,
                GarminSleepSummary.calendar_date <= target_date,
                GarminSleepSummary.calendar_date >= target_date - timedelta(days=2),
            )
            .order_by(GarminSleepSummary.calendar_date.desc())
        )
        .scalars()
        .first()
    )

def _summarize_sleep_recovery(summary: GarminSleepSummary | None) -> dict[str, Any]:
    if summary is None:
        return {
            "available": False,
            "calendar_date": None,
            "sleep_status": "unknown",
            "sleep_label": "Unknown",
            "sleep_duration_minutes": None,
            "sleep_duration_label": None,
            "body_battery_gain": None,
            "deep_sleep_pct": None,
            "rem_sleep_pct": None,
            "awake_minutes": None,
            "detail": "No recent sleep summary was available for recovery context.",
        }

    duration_minutes = summary.sleep_duration_minutes
    body_battery_gain = summary.body_battery_gain
    deep_minutes = summary.sleep_deep_minutes
    light_minutes = summary.sleep_light_minutes
    rem_minutes = summary.sleep_rem_minutes
    awake_minutes = summary.sleep_awake_minutes

    measured_stage_minutes = sum(
        minutes
        for minutes in (deep_minutes, light_minutes, rem_minutes)
        if minutes is not None
    )
    deep_sleep_pct = (
        round((deep_minutes / measured_stage_minutes) * 100, 1)
        if measured_stage_minutes and deep_minutes is not None
        else None
    )
    rem_sleep_pct = (
        round((rem_minutes / measured_stage_minutes) * 100, 1)
        if measured_stage_minutes and rem_minutes is not None
        else None
    )

    score = 0
    details: list[str] = []
    if duration_minutes is not None:
        if GOOD_SLEEP_MINUTES_MIN <= duration_minutes <= GOOD_SLEEP_MINUTES_MAX:
            score += 1
            details.append("sleep length landed in the usual 7-9 hour target")
        elif duration_minutes < SHORT_SLEEP_MINUTES:
            score -= 2
            details.append("sleep was clearly shorter than the usual recovery target")
        elif duration_minutes > LONG_SLEEP_MINUTES:
            score -= 1
            details.append("sleep ran longer than the usual target, which can still feel unrefreshing")
        else:
            details.append("sleep length sat outside the usual 7-9 hour target")

    if body_battery_gain is not None:
        if body_battery_gain >= GOOD_BODY_BATTERY_GAIN:
            score += 1
            details.append("body battery recovered well overnight")
        elif body_battery_gain < LOW_BODY_BATTERY_GAIN:
            score -= 1
            details.append("body battery gain looked limited overnight")

    if deep_sleep_pct is not None:
        if deep_sleep_pct >= 13:
            score += 1
        elif deep_sleep_pct < LOW_DEEP_SLEEP_PCT:
            score -= 1
            details.append("deep sleep looked a bit light for recovery")

    if awake_minutes is not None and awake_minutes > HIGH_AWAKE_MINUTES:
        score -= 1
        details.append("awake time was higher than ideal")

    sleep_status: RecoverySleepStatus
    if duration_minutes is None:
        sleep_status = "unknown"
    elif score >= 2:
        sleep_status = "good"
    elif score <= -1:
        sleep_status = "poor"
    else:
        sleep_status = "mixed"

    label_map = {
        "good": "Strong",
        "mixed": "Mixed",
        "poor": "Off",
        "unknown": "Unknown",
    }
    detail = details[0] if details else "Recent sleep looked neutral for recovery."

    return {
        "available": True,
        "calendar_date": summary.calendar_date.isoformat(),
        "sleep_status": sleep_status,
        "sleep_label": label_map[sleep_status],
        "sleep_duration_minutes": duration_minutes,
        "sleep_duration_label": _format_duration(duration_minutes),
        "body_battery_gain": body_battery_gain,
        "deep_sleep_pct": deep_sleep_pct,
        "rem_sleep_pct": rem_sleep_pct,
        "awake_minutes": awake_minutes,
        "detail": detail,
    }


def _compute_training_streak(day_summaries: dict[str, dict[str, Any]], *, target_date: date) -> int:
    streak = 0
    streak_anchor = target_date
    target_key = target_date.isoformat()
    if (day_summaries.get(target_key) or {}).get("activity_count", 0) == 0:
        streak_anchor = target_date - timedelta(days=1)

    current_date = streak_anchor
    while current_date.isoformat() in day_summaries:
        day_summary = day_summaries.get(current_date.isoformat()) or {}
        if (day_summary.get("activity_count") or 0) <= 0:
            break
        streak += 1
        current_date -= timedelta(days=1)
    return streak


def _build_recovery_context(
    period: dict[str, Any],
    *,
    day_summaries: dict[str, dict[str, Any]],
    sleep_recovery: dict[str, Any],
    target_date: date,
) -> dict[str, Any]:
    heavy_training_days = sum(
        1
        for item in day_summaries.values()
        if item.get("load_status") in {"heavy", "very_heavy"}
    )
    very_heavy_training_days = sum(
        1
        for item in day_summaries.values()
        if item.get("load_status") == "very_heavy"
    )
    yesterday_key = (target_date - timedelta(days=1)).isoformat()
    yesterday_summary = day_summaries.get(yesterday_key) or {}
    yesterday_had_training = (yesterday_summary.get("activity_count") or 0) > 0
    yesterday_load_status = yesterday_summary.get("load_status") if yesterday_had_training else "rest"
    training_streak_days = _compute_training_streak(day_summaries, target_date=target_date)
    sleep_status: RecoverySleepStatus = sleep_recovery.get("sleep_status", "unknown")

    risk_score = 0
    load_status = period.get("load_status")
    if load_status == "very_heavy":
        risk_score += 3
    elif load_status == "heavy":
        risk_score += 2
    elif (period.get("active_day_count") or 0) >= 5:
        risk_score += 1

    if heavy_training_days >= 4:
        risk_score += 2
    elif heavy_training_days >= 3:
        risk_score += 1

    if very_heavy_training_days >= 2:
        risk_score += 1

    if training_streak_days >= 6:
        risk_score += 2
    elif training_streak_days >= 4:
        risk_score += 1

    if yesterday_had_training:
        risk_score += 1
        if yesterday_load_status in {"heavy", "very_heavy"}:
            risk_score += 1

    if sleep_status == "poor":
        risk_score += 2
    elif sleep_status == "mixed":
        risk_score += 1
    elif sleep_status == "good":
        risk_score -= 1

    if not yesterday_had_training and sleep_status == "good" and (period.get("active_day_count") or 0) <= 4:
        risk_score -= 1

    risk_score = max(risk_score, 0)

    recommendation_level: RecoveryRecommendationLevel
    if risk_score >= 5:
        recommendation_level = "rest"
    elif risk_score >= 3:
        recommendation_level = "easy"
    else:
        recommendation_level = "go"

    reason_parts: list[str] = []
    if heavy_training_days >= 3:
        reason_parts.append(f"you trained hard on {heavy_training_days} of the last 7 days")
    elif (period.get("active_day_count") or 0) >= 5:
        reason_parts.append(f"you were active on {period.get('active_day_count')} of the last 7 days")

    if yesterday_had_training:
        if yesterday_load_status in {"heavy", "very_heavy"}:
            reason_parts.append("yesterday was not a light reset day")
        else:
            reason_parts.append("yesterday was not a full rest day")
    else:
        reason_parts.append("yesterday gave you a rest day")

    if sleep_status == "poor":
        reason_parts.append("last night's sleep looked off for recovery")
    elif sleep_status == "mixed":
        reason_parts.append("last night's sleep looked only partly restorative")
    elif sleep_status == "good":
        reason_parts.append("last night's sleep looked solid")

    if recommendation_level == "rest":
        recommendation_title = "Recovery day"
        recommendation_detail = (
            "Take today as a recovery-first day if you can. "
            + ", ".join(reason_parts[:3]).capitalize()
            + "."
        )
    elif recommendation_level == "easy":
        recommendation_title = "Easy day"
        recommendation_detail = (
            "Today looks better as an easier training day than another hard session. "
            + ", ".join(reason_parts[:3]).capitalize()
            + "."
        )
    else:
        recommendation_title = "Ready to train"
        recommendation_detail = (
            "Recovery signals look good enough to keep training today. "
            + ", ".join(reason_parts[:3]).capitalize()
            + "."
        )

    return {
        "recent_sleep_available": sleep_recovery.get("available", False),
        "recent_sleep_date": sleep_recovery.get("calendar_date"),
        "sleep_status": sleep_status,
        "sleep_label": sleep_recovery.get("sleep_label", "Unknown"),
        "sleep_duration_minutes": sleep_recovery.get("sleep_duration_minutes"),
        "sleep_duration_label": sleep_recovery.get("sleep_duration_label"),
        "body_battery_gain": sleep_recovery.get("body_battery_gain"),
        "deep_sleep_pct": sleep_recovery.get("deep_sleep_pct"),
        "rem_sleep_pct": sleep_recovery.get("rem_sleep_pct"),
        "yesterday_had_training": yesterday_had_training,
        "yesterday_was_rest_day": not yesterday_had_training,
        "yesterday_load_status": yesterday_load_status,
        "training_streak_days": training_streak_days,
        "heavy_training_days": heavy_training_days,
        "very_heavy_training_days": very_heavy_training_days,
        "recommendation_level": recommendation_level,
        "recommendation_title": recommendation_title,
        "recommendation_detail": recommendation_detail,
    }

def _build_findings(
    period: dict[str, Any],
    baseline: dict[str, Any],
    recovery: dict[str, Any],
) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    activity_count = period.get("activity_count") or 0
    active_day_count = period.get("active_day_count") or 0
    duration_minutes = period.get("total_duration_minutes")
    total_calories = period.get("total_calories")
    avg_hr = period.get("weighted_average_heart_rate")
    baseline_period_count = baseline.get("period_count") or 0
    baseline_duration = baseline.get("average_duration_minutes")
    baseline_calories = baseline.get("average_calories")
    baseline_hr = baseline.get("average_heart_rate")
    comparison_label = baseline.get("comparison_label") or "recent comparable periods"
    heavy_training_days = recovery.get("heavy_training_days") or 0
    training_streak_days = recovery.get("training_streak_days") or 0
    sleep_status = recovery.get("sleep_status")

    if period.get("load_status") == "very_heavy":
        findings.append({
            "code": "very_heavy_week",
            "severity": "high",
            "title": "The last 7 days carried a very high training load",
            "detail": f"You logged {activity_count} sessions across {active_day_count} active days, totaling about {period.get('duration_label')} and {int(total_calories or 0)} kcal.",
        })
    elif period.get("load_status") == "heavy":
        findings.append({
            "code": "heavy_week",
            "severity": "medium",
            "title": "The last 7 days looked heavier than usual",
            "detail": f"That 7-day block added up to about {period.get('duration_label')} across {activity_count} sessions.",
        })

    if heavy_training_days >= 3:
        findings.append({
            "code": "many_hard_days",
            "severity": "medium" if heavy_training_days >= 4 else "low",
            "title": "Several days were relatively hard",
            "detail": f"{heavy_training_days} of the last 7 days landed in a heavy or very heavy load band.",
        })

    if training_streak_days >= 4:
        findings.append({
            "code": "training_streak",
            "severity": "medium" if training_streak_days >= 6 else "low",
            "title": "Training has been stacking without much reset",
            "detail": f"You have trained on {training_streak_days} straight days leading into this recommendation window.",
        })

    if recovery.get("yesterday_was_rest_day"):
        findings.append({
            "code": "yesterday_rest",
            "severity": "info",
            "title": "Yesterday gave you a reset day",
            "detail": "That recent rest day makes it easier to absorb the previous week's load if sleep also held up well.",
        })
    elif recovery.get("yesterday_had_training"):
        findings.append({
            "code": "yesterday_not_rest",
            "severity": "low",
            "title": "Yesterday was not a full rest day",
            "detail": "That means today's decision matters more if the week already felt stacked.",
        })

    if sleep_status == "poor":
        findings.append({
            "code": "sleep_off",
            "severity": "high",
            "title": "Recent sleep looked off for recovery",
            "detail": recovery.get("recommendation_detail") or "The most recent sleep summary did not look ideal for recovery.",
        })
    elif sleep_status == "good":
        findings.append({
            "code": "sleep_good",
            "severity": "info",
            "title": "Recent sleep supported recovery reasonably well",
            "detail": recovery.get("recommendation_detail") or "The most recent sleep summary looked supportive of training.",
        })

    if baseline_period_count >= 2 and baseline_duration is not None and duration_minutes is not None:
        duration_delta = duration_minutes - baseline_duration
        if abs(duration_delta) >= SIGNIFICANT_DURATION_DELTA_MINUTES * TRAINING_WINDOW_DAYS:
            direction = "higher" if duration_delta > 0 else "lower"
            findings.append({
                "code": "duration_vs_recent",
                "severity": "medium" if duration_delta > 0 else "low",
                "title": "Training time shifted from your recent pattern",
                "detail": (
                    f"Total training time was about {_format_duration(abs(duration_delta))} {direction} than your "
                    f"{comparison_label} average of {_format_duration(baseline_duration)}."
                ),
            })

    if baseline_period_count >= 2 and baseline_calories is not None and total_calories is not None:
        calorie_delta = total_calories - baseline_calories
        if abs(calorie_delta) >= SIGNIFICANT_CALORIE_DELTA * TRAINING_WINDOW_DAYS:
            direction = "more" if calorie_delta > 0 else "fewer"
            findings.append({
                "code": "calories_vs_recent",
                "severity": "low" if calorie_delta < 0 else "medium",
                "title": "Energy cost moved away from your recent baseline",
                "detail": f"Active burn landed about {int(abs(round(calorie_delta)))} kcal {direction} than your {comparison_label} average of {int(baseline_calories)} kcal.",
            })

    if avg_hr is not None:
        if avg_hr >= HIGH_AVERAGE_HR_BPM:
            findings.append({
                "code": "avg_hr_high",
                "severity": "medium",
                "title": "Average heart rate stayed fairly high",
                "detail": f"Weighted average heart rate was about {int(round(avg_hr))} bpm across the 7-day block.",
            })
        elif baseline_period_count >= 2 and baseline_hr is not None and avg_hr - baseline_hr >= SIGNIFICANT_HR_DELTA:
            findings.append({
                "code": "avg_hr_vs_recent",
                "severity": "low",
                "title": "Heart rate ran above your recent training pattern",
                "detail": f"Average heart rate was about {int(round(avg_hr))} bpm, roughly {int(round(avg_hr - baseline_hr))} bpm above your {comparison_label} average.",
            })

    severity_rank = {"high": 0, "medium": 1, "low": 2, "info": 3}
    findings.sort(key=lambda item: (severity_rank.get(item["severity"], 99), item["title"]))
    return findings[:5]


def _build_actions(
    period: dict[str, Any],
    baseline: dict[str, Any],
    recovery: dict[str, Any],
) -> list[dict[str, Any]]:
    actions: list[dict[str, Any]] = []
    recommendation_level: RecoveryRecommendationLevel = recovery.get("recommendation_level", "easy")

    if recommendation_level == "rest":
        actions.append({
            "code": "make_today_recovery",
            "title": "Treat today as a recovery day",
            "detail": "If your schedule allows it, make today your reset day with rest, easy walking, or light mobility instead of another proper workout.",
        })
        actions.append({
            "code": "protect_next_sleep",
            "title": "Use today to rebuild recovery",
            "detail": "The biggest return today is likely better sleep, hydration, and fueling rather than squeezing in more load.",
        })
    elif recommendation_level == "easy":
        actions.append({
            "code": "keep_it_easy",
            "title": "Keep today's session easy if you train",
            "detail": "A steady aerobic or technique-focused session makes more sense than another hard workout when recent load and recovery are only partly aligned.",
        })
        actions.append({
            "code": "avoid_stacking_intensity",
            "title": "Avoid stacking another hard day",
            "detail": "If you want to train today, save intensity for when sleep and freshness look more supportive.",
        })
    else:
        actions.append({
            "code": "green_light_train",
            "title": "It looks reasonable to keep training today",
            "detail": "Recent load and recovery signals do not point to an obvious need for a full stop, so a planned session still looks reasonable.",
        })
        actions.append({
            "code": "keep_warmup_honest",
            "title": "Let the warm-up confirm the plan",
            "detail": "Even on a good-looking day, keep the first part of the session honest and downshift if the legs still feel flat.",
        })

    if recovery.get("sleep_status") == "poor":
        actions.append({
            "code": "sleep_first",
            "title": "Let tonight's sleep be part of the plan",
            "detail": "When the latest sleep is off, protecting tonight's recovery is often more useful than forcing extra training quality today.",
        })
    elif recovery.get("heavy_training_days", 0) >= 4:
        actions.append({
            "code": "create_space_after_heavy_week",
            "title": "Create some space after the heavier stretch",
            "detail": "A heavy week works better when the next 24-48 hours are not just more of the same.",
        })

    if not actions:
        actions.append({
            "code": "stay_consistent",
            "title": "Keep the pattern consistent",
            "detail": "Nothing looks extreme enough to force a big change today, so the goal is staying consistent rather than over-correcting from one week.",
        })
    return actions[:4]

def _build_rule_based_explanation(
    period: dict[str, Any],
    baseline: dict[str, Any],
    recovery: dict[str, Any],
    actions: list[dict[str, Any]],
) -> dict[str, Any]:
    active_day_count = period.get("active_day_count") or 0
    activity_count = period.get("activity_count") or 0
    duration_label = period.get("duration_label") or "an unknown duration"
    calories = int(period.get("total_calories") or 0)
    primary_sport = (period.get("primary_sport_label") or "training").lower()
    baseline_period_count = baseline.get("period_count") or 0
    baseline_duration = baseline.get("average_duration_minutes")
    comparison_label = baseline.get("comparison_label") or "recent comparable periods"
    recommendation_level: RecoveryRecommendationLevel = recovery.get("recommendation_level", "easy")

    if recommendation_level == "rest":
        headline = "Today looks better as a recovery day."
    elif recommendation_level == "easy":
        headline = "Today looks better as an easier training day."
    else:
        headline = "Recovery looks good enough to keep training today."

    summary_parts = [
        (
            f"Across {period.get('window_label')}, you logged {activity_count} sessions "
            f"over {active_day_count} active days, totaling about {duration_label} and {calories} kcal."
        ),
        f"Most of the load came from {primary_sport}.",
    ]

    if baseline_period_count >= 2 and baseline_duration is not None and period.get("total_duration_minutes") is not None:
        duration_delta = period["total_duration_minutes"] - baseline_duration
        if abs(duration_delta) >= SIGNIFICANT_DURATION_DELTA_MINUTES * TRAINING_WINDOW_DAYS:
            direction = "above" if duration_delta > 0 else "below"
            summary_parts.append(
                f"That sits about {_format_duration(abs(duration_delta))} {direction} your {comparison_label} average."
            )

    sleep_label = recovery.get("sleep_label")
    if recovery.get("recent_sleep_available"):
        summary_parts.append(
            f"Recent sleep looked {str(sleep_label).lower()}, and {recovery.get('recommendation_title', 'today')} is the better fit for today."
        )
    else:
        summary_parts.append(recovery.get("recommendation_detail", "Today should be paced with recovery in mind."))

    return {
        "source": "rule_based",
        "headline": headline,
        "summary": " ".join(summary_parts[:4]),
        "action_items": [action["detail"] for action in actions[:3]],
        "training_note": None,
        "caveats": [
            "This is a training-pattern summary, not a diagnosis of fitness or recovery.",
            "Activity and sleep data can point to load and recovery signals, but they do not replace coaching context, soreness, or readiness measures.",
        ],
    }


def build_training_insight(
    db: Session,
    *,
    current_user: User,
    target_date: date,
    provider: str = "garmin",
    window_mode: InsightWindowMode = "7d",
) -> dict[str, Any]:
    rows = _query_user_training_rows(db, user_id=current_user.id, provider=provider)
    day_buckets = _bucket_rows_by_date(rows)
    start_date = target_date - timedelta(days=TRAINING_WINDOW_DAYS - 1)

    if not any(day_buckets.get(current_date) for current_date in _iter_period_dates(start_date, target_date)):
        raise ValueError("No training sessions were stored for that period.")

    period = _aggregate_period_from_buckets(
        day_buckets,
        start_date=start_date,
        end_date=target_date,
        anchor_date=target_date,
        window_mode="7d",
    )
    baseline = _load_recent_period_baseline(
        day_buckets,
        period_start=start_date,
        window_mode="7d",
    )
    day_summaries = _build_day_summaries(
        day_buckets,
        start_date=start_date,
        end_date=target_date,
    )
    sleep_recovery = _summarize_sleep_recovery(
        _load_recent_sleep_summary(db, user_id=current_user.id, target_date=target_date)
    )
    recovery = _build_recovery_context(
        period,
        day_summaries=day_summaries,
        sleep_recovery=sleep_recovery,
        target_date=target_date,
    )
    findings = _build_findings(period, baseline, recovery)
    actions = _build_actions(period, baseline, recovery)
    explanation = _build_rule_based_explanation(period, baseline, recovery, actions)

    return {
        "ok": True,
        "date": target_date.isoformat(),
        "day": period,
        "recent_baseline": baseline,
        "recovery": recovery,
        "data_quality": {
            "session_count": period.get("activity_count", 0),
            "has_heart_rate": period.get("weighted_average_heart_rate") is not None,
            "recent_baseline_days": baseline.get("period_count", 0),
            "window_mode": "7d",
            "provider": provider,
        },
        "findings": findings,
        "actions": actions,
        "explanation": explanation,
    }
