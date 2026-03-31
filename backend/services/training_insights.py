from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.models import GarminTrainingActivity, User

InsightWindowMode = Literal["day", "7d"]
KILOJOULES_PER_KILOCALORIE = 4.184

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


def _activity_display_calories(activity: GarminTrainingActivity) -> float | None:
    raw_payload = activity.raw_payload_json if isinstance(activity.raw_payload_json, dict) else None
    if raw_payload:
        normalized_calories = _normalize_activity_calories(
            raw_payload.get("calories"),
            raw_payload.get("bmrCalories"),
        )
        if normalized_calories is not None:
            return normalized_calories

    return _to_float(activity.calories)


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
    return 7 if window_mode == "7d" else 1


def _window_label(window_mode: InsightWindowMode) -> str:
    return "7-day period" if window_mode == "7d" else "day"


def _period_display_label(start_date: date, end_date: date, *, window_mode: InsightWindowMode) -> str:
    if window_mode == "day":
        return _format_short_date(end_date)
    return f"{_format_short_date(start_date)} - {_format_short_date(end_date)}"


def _period_subject(window_mode: InsightWindowMode) -> str:
    return "that 7-day period" if window_mode == "7d" else "that day"


def _comparison_label(window_mode: InsightWindowMode, period_count: int) -> str:
    if window_mode == "7d":
        return f"recent {period_count} comparable 7-day periods"
    return f"recent {period_count} comparable days"


def _label_for_sport(activity: GarminTrainingActivity) -> tuple[str, str]:
    raw_value = activity.sport_type or activity.activity_type or "other"
    normalized = str(raw_value).strip().lower().replace(" ", "_")
    label = normalized.replace("_", " ").title()
    return normalized, label


def _activity_calendar_date(activity: GarminTrainingActivity) -> date | None:
    reference_time = activity.start_time_local or activity.start_time_gmt
    return reference_time.date() if reference_time is not None else None


def _query_user_training_rows(db: Session, *, user_id: int) -> list[GarminTrainingActivity]:
    return (
        db.execute(
            select(GarminTrainingActivity)
            .where(GarminTrainingActivity.user_id == user_id)
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

    days = _window_days(window_mode)
    light_duration_limit = LIGHT_DAY_DURATION_MINUTES * days
    heavy_duration_limit = HEAVY_DAY_DURATION_MINUTES * days
    very_heavy_duration_limit = VERY_HEAVY_DAY_DURATION_MINUTES * days
    light_calorie_limit = LIGHT_DAY_CALORIES * days
    heavy_calorie_limit = HEAVY_DAY_CALORIES * days
    very_heavy_calorie_limit = VERY_HEAVY_DAY_CALORIES * days

    load_status = "moderate"
    if total_duration_minutes >= very_heavy_duration_limit or total_calories >= very_heavy_calorie_limit:
        load_status = "very_heavy"
    elif total_duration_minutes >= heavy_duration_limit or total_calories >= heavy_calorie_limit:
        load_status = "heavy"
    elif total_duration_minutes <= light_duration_limit and total_calories <= light_calorie_limit:
        load_status = "light"

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
        "load_status": load_status,
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

    activity_counts = [float(item["activity_count"]) for item in aggregates]
    active_day_counts = [float(item["active_day_count"]) for item in aggregates]
    durations = [float(item["total_duration_minutes"]) for item in aggregates]
    calories = [float(item["total_calories"]) for item in aggregates]
    heart_rates = [
        float(item["weighted_average_heart_rate"])
        for item in aggregates
        if item.get("weighted_average_heart_rate") is not None
    ]

    return {
        "available": True,
        "period_count": len(aggregates),
        "window_size_days": window_days,
        "comparison_label": _comparison_label(window_mode, len(aggregates)),
        "average_activity_count": _round(_avg(activity_counts), 1),
        "average_active_day_count": _round(_avg(active_day_counts), 1),
        "average_duration_minutes": _round(_avg(durations), 0),
        "average_calories": _round(_avg(calories), 0),
        "average_heart_rate": _round(_avg(heart_rates), 0),
    }


def _build_findings(period: dict[str, Any], baseline: dict[str, Any]) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    window_mode: InsightWindowMode = period.get("window_mode", "day")
    subject = _period_subject(window_mode)
    load_status = period.get("load_status")
    duration_minutes = period.get("total_duration_minutes")
    total_calories = period.get("total_calories")
    avg_hr = period.get("weighted_average_heart_rate")
    activity_count = period.get("activity_count") or 0
    active_day_count = period.get("active_day_count") or 0
    baseline_period_count = baseline.get("period_count") or 0
    baseline_duration = baseline.get("average_duration_minutes")
    baseline_calories = baseline.get("average_calories")
    baseline_hr = baseline.get("average_heart_rate")
    comparison_label = baseline.get("comparison_label") or "recent comparable periods"

    if load_status == "very_heavy":
        findings.append({
            "code": "very_heavy_period",
            "severity": "high",
            "title": "Training load was very high across the selected period",
            "detail": f"You logged {activity_count} sessions totaling about {period.get('duration_label')} and {int(total_calories)} kcal across {subject}.",
        })
    elif load_status == "heavy":
        findings.append({
            "code": "heavy_period",
            "severity": "medium",
            "title": "Training load was higher than usual across the selected period",
            "detail": f"That period added up to about {period.get('duration_label')} and {int(total_calories)} kcal across {activity_count} sessions.",
        })
    elif load_status == "light":
        findings.append({
            "code": "light_period",
            "severity": "low",
            "title": "This looked like a lighter training period",
            "detail": f"Total workload was about {period.get('duration_label')} and {int(total_calories)} kcal across {subject}.",
        })

    if window_mode == "7d" and active_day_count >= 4:
        findings.append({
            "code": "frequent_training_days",
            "severity": "medium" if active_day_count >= 5 else "low",
            "title": "Training was spread across several days",
            "detail": f"You were active on {active_day_count} of the 7 days in this window, which can accumulate fatigue even without one extreme session.",
        })
    elif window_mode == "day" and activity_count >= 2:
        findings.append({
            "code": "multiple_sessions",
            "severity": "medium" if activity_count >= 3 else "low",
            "title": "Workload was split across multiple sessions",
            "detail": f"You recorded {activity_count} sessions that day, which can raise total fatigue even if each session felt manageable on its own.",
        })

    longest_session = period.get("longest_session") or {}
    longest_duration = longest_session.get("duration_minutes")
    if longest_duration is not None and longest_duration >= 90:
        findings.append({
            "code": "long_session",
            "severity": "medium",
            "title": "One session carried a large share of the load",
            "detail": f"{longest_session.get('name') or 'Your longest session'} lasted about {_format_duration(longest_duration)}.",
        })

    if baseline_period_count >= 2 and baseline_duration is not None and duration_minutes is not None:
        duration_delta = duration_minutes - baseline_duration
        if abs(duration_delta) >= SIGNIFICANT_DURATION_DELTA_MINUTES * _window_days(window_mode):
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
        if abs(calorie_delta) >= SIGNIFICANT_CALORIE_DELTA * _window_days(window_mode):
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
                "detail": f"Weighted average heart rate was about {int(round(avg_hr))} bpm across {subject}.",
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


def _build_actions(period: dict[str, Any], baseline: dict[str, Any]) -> list[dict[str, Any]]:
    actions: list[dict[str, Any]] = []
    window_mode: InsightWindowMode = period.get("window_mode", "day")
    load_status = period.get("load_status")
    activity_count = period.get("activity_count") or 0
    active_day_count = period.get("active_day_count") or 0
    avg_hr = period.get("weighted_average_heart_rate")
    baseline_duration = baseline.get("average_duration_minutes")
    duration_minutes = period.get("total_duration_minutes")

    if load_status in {"heavy", "very_heavy"}:
        actions.append({
            "code": "protect_recovery",
            "title": "Treat the next day as recovery-sensitive",
            "detail": "If this was not intentionally part of a harder block, consider keeping the next session easier and protect sleep, hydration, and fueling.",
        })
    elif load_status == "light":
        actions.append({
            "code": "use_light_period_well",
            "title": "Use the lighter stretch to absorb training",
            "detail": "A lighter stretch can help consistency if the rest of the month has been demanding, so avoid turning every easy day into extra hidden load.",
        })

    if window_mode == "7d" and active_day_count >= 4:
        actions.append({
            "code": "space_harder_days",
            "title": "Watch how many hard days you stack in a week",
            "detail": "If you train on most days of the week, try to separate the heavier sessions so the week does not drift into one long fatigue block.",
        })
    elif window_mode == "day" and activity_count >= 2:
        actions.append({
            "code": "fuel_multi_session_day",
            "title": "Refuel well when you stack sessions",
            "detail": "On multi-session days, spacing meals, fluids, and a calmer evening can matter more than squeezing in even more work.",
        })

    if avg_hr is not None and avg_hr >= HIGH_AVERAGE_HR_BPM:
        actions.append({
            "code": "watch_intensity",
            "title": "Watch back-to-back high-intensity work",
            "detail": "If your average heart rate stays elevated across several days, balance it with easier volume rather than adding intensity again immediately.",
        })

    if baseline_duration is not None and duration_minutes is not None and duration_minutes >= baseline_duration + (SIGNIFICANT_DURATION_DELTA_MINUTES * _window_days(window_mode)):
        actions.append({
            "code": "plan_heavy_periods",
            "title": "Plan heavier periods on purpose",
            "detail": "When training time jumps well above your recent norm, it usually works better when the following days are deliberately lighter rather than random.",
        })

    if not actions:
        actions.append({
            "code": "keep_consistent",
            "title": "Keep the routine consistent",
            "detail": "This period does not look extreme on its own, so focus on repeating the pattern that fits your week rather than over-correcting from one block.",
        })
    return actions[:4]


def _build_rule_based_explanation(period: dict[str, Any], baseline: dict[str, Any], actions: list[dict[str, Any]]) -> dict[str, Any]:
    activity_count = period.get("activity_count") or 0
    active_day_count = period.get("active_day_count") or 0
    duration_label = period.get("duration_label") or "an unknown duration"
    calories = int(period.get("total_calories") or 0)
    avg_hr = period.get("weighted_average_heart_rate")
    primary_sport = period.get("primary_sport_label") or "training"
    baseline_period_count = baseline.get("period_count") or 0
    baseline_duration = baseline.get("average_duration_minutes")
    comparison_label = baseline.get("comparison_label") or "recent comparable periods"
    window_mode: InsightWindowMode = period.get("window_mode", "day")

    headline = "Training load looked well balanced."
    load_status = period.get("load_status")
    if load_status == "very_heavy":
        headline = "Training load looked very high in this window."
    elif load_status == "heavy":
        headline = "Training load looked higher than usual in this window."
    elif load_status == "light":
        headline = "This looked like a lighter training stretch."

    summary_parts = [
        f"From {period.get('window_label') if window_mode == 'day' else period.get('window_label')}, you logged {activity_count} sessions totaling about {duration_label} and {calories} kcal.",
    ]
    if window_mode == "7d":
        summary_parts.append(f"You were active on {active_day_count} of the 7 days, with most of the load coming from {primary_sport.lower()}.")
    elif primary_sport:
        summary_parts.append(f"Most of the workload came from {primary_sport.lower()}.")
    if baseline_period_count >= 2 and baseline_duration is not None and period.get("total_duration_minutes") is not None:
        duration_delta = period["total_duration_minutes"] - baseline_duration
        if abs(duration_delta) >= SIGNIFICANT_DURATION_DELTA_MINUTES * _window_days(window_mode):
            direction = "above" if duration_delta > 0 else "below"
            summary_parts.append(f"That sits about {_format_duration(abs(duration_delta))} {direction} your {comparison_label} average.")
    if avg_hr is not None:
        summary_parts.append(f"Weighted average heart rate was about {int(round(avg_hr))} bpm.")

    return {
        "source": "rule_based",
        "headline": headline,
        "summary": " ".join(summary_parts[:4]),
        "action_items": [action["detail"] for action in actions[:3]],
        "training_note": None,
        "caveats": [
            "This is a training-pattern summary, not a diagnosis of fitness or recovery.",
            "Garmin activity data can describe load, but it does not replace coaching context, soreness, or readiness measures.",
        ],
    }


def build_training_insight(
    db: Session,
    *,
    current_user: User,
    target_date: date,
    window_mode: InsightWindowMode = "day",
) -> dict[str, Any]:
    rows = _query_user_training_rows(db, user_id=current_user.id)
    day_buckets = _bucket_rows_by_date(rows)
    window_days = _window_days(window_mode)
    start_date = target_date - timedelta(days=window_days - 1)

    if not any(day_buckets.get(current_date) for current_date in _iter_period_dates(start_date, target_date)):
        raise ValueError("No training sessions were stored for that period.")

    period = _aggregate_period_from_buckets(
        day_buckets,
        start_date=start_date,
        end_date=target_date,
        anchor_date=target_date,
        window_mode=window_mode,
    )
    baseline = _load_recent_period_baseline(
        day_buckets,
        period_start=start_date,
        window_mode=window_mode,
    )
    findings = _build_findings(period, baseline)
    actions = _build_actions(period, baseline)
    explanation = _build_rule_based_explanation(period, baseline, actions)

    return {
        "ok": True,
        "date": target_date.isoformat(),
        "day": period,
        "recent_baseline": baseline,
        "data_quality": {
            "session_count": period.get("activity_count", 0),
            "has_heart_rate": period.get("weighted_average_heart_rate") is not None,
            "recent_baseline_days": baseline.get("period_count", 0),
            "window_mode": window_mode,
        },
        "findings": findings,
        "actions": actions,
        "explanation": explanation,
    }
