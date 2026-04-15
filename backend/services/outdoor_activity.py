from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from backend.schemas.suggestions import (
    OutdoorActivitySuggestion,
    SuggestionPriority,
    SuggestionSeverity,
    VentilationContext,
)

_FIELD_ORDER = (
    "outdoor_pm25",
    "outdoor_pm10",
    "outdoor_uv_index",
    "outdoor_temperature_c",
    "outdoor_humidity_pct",
)

_SEVERITY_RANK: dict[SuggestionSeverity, int] = {
    "good": 0,
    "ok": 1,
    "caution": 2,
    "warning": 3,
    "danger": 4,
}

_PRIORITY_BY_SEVERITY: dict[SuggestionSeverity, SuggestionPriority] = {
    "good": "low",
    "ok": "low",
    "caution": "medium",
    "warning": "high",
    "danger": "high",
}

UvBucket = Literal["low", "moderate", "high", "very_high", "extreme"]


@dataclass(frozen=True)
class _AirAssessment:
    severity: SuggestionSeverity
    title: str
    message: str
    short_label: str
    reasons: tuple[str, ...]
    based_on_fields: tuple[str, ...]


@dataclass(frozen=True)
class _UvAssessment:
    bucket: UvBucket
    note: str
    reason_tag: str
    based_on_fields: tuple[str, ...]


def evaluate_outdoor_activity(
    context: VentilationContext,
    *,
    pm_thresholds: dict[str, float] | None = None,
) -> OutdoorActivitySuggestion:
    air = _assess_air_quality(context, pm_thresholds=pm_thresholds)
    uv = _assess_uv(context.outdoor_uv_index)

    if air is None and uv is None:
        return OutdoorActivitySuggestion(
            id="outdoor_activity_missing",
            priority="low",
            severity=None,
            title="Not enough outdoor data",
            short_label="Data missing",
            recommendation=(
                "AirIQ needs current outdoor PM or UV data before it can judge "
                "outdoor activity right now."
            ),
            impact=None,
            primary_reason=(
                "AirIQ needs current outdoor PM or UV data before it can judge "
                "outdoor activity right now."
            ),
            reasons=["Waiting for outdoor data"],
            based_on=[],
        )

    if air is None:
        return _build_uv_only_suggestion(context, uv)

    note_parts = _build_note_parts(context, uv)
    reasons = _build_reason_tags(
        *air.reasons,
        *(() if uv is None else (uv.reason_tag,)),
        *_build_weather_reason_tags(context),
    )

    based_on = _ordered_fields(
        *air.based_on_fields,
        *(() if uv is None else uv.based_on_fields),
        *(
            field_name
            for field_name in ("outdoor_temperature_c",)
            if getattr(context, field_name) is not None
        ),
    )

    return OutdoorActivitySuggestion(
        id="outdoor_activity",
        priority=_PRIORITY_BY_SEVERITY[air.severity],
        severity=air.severity,
        title=air.title,
        short_label=air.short_label,
        recommendation=_merge_recommendation(air.message, note_parts),
        impact=_build_activity_impact(
            severity=air.severity,
            uv=uv,
            temperature_c=context.outdoor_temperature_c,
            air_data_available=True,
        ),
        primary_reason=air.message,
        reasons=reasons,
        note=" ".join(note_parts) if note_parts else None,
        based_on=based_on,
    )


def _build_uv_only_suggestion(
    context: VentilationContext,
    uv: _UvAssessment | None,
) -> OutdoorActivitySuggestion:
    assert uv is not None

    severity_by_bucket: dict[UvBucket, SuggestionSeverity] = {
        "low": "good",
        "moderate": "ok",
        "high": "caution",
        "very_high": "warning",
        "extreme": "danger",
    }
    title_by_bucket: dict[UvBucket, str] = {
        "low": "Outdoor activity looks fine",
        "moderate": "Outdoor activity looks fine",
        "high": "Plan for sun protection outdoors",
        "very_high": "Be careful with sun exposure outdoors",
        "extreme": "Reduce direct sun exposure outdoors",
    }
    short_label_by_bucket: dict[UvBucket, str] = {
        "low": "UV low",
        "moderate": "UV moderate",
        "high": "UV high",
        "very_high": "UV very high",
        "extreme": "UV extreme",
    }

    note_parts = _build_note_parts(context, uv)
    reasons = _build_reason_tags(
        uv.reason_tag,
        "Air data unavailable",
        *_build_weather_reason_tags(context),
    )
    severity = severity_by_bucket[uv.bucket]

    return OutdoorActivitySuggestion(
        id="outdoor_activity_uv_only",
        priority=_PRIORITY_BY_SEVERITY[severity],
        severity=severity,
        title=title_by_bucket[uv.bucket],
        short_label=short_label_by_bucket[uv.bucket],
        recommendation=_merge_recommendation(
            "Air quality data is unavailable right now, so this recommendation is based on UV exposure only.",
            note_parts,
        ),
        impact=_build_activity_impact(
            severity=severity,
            uv=uv,
            temperature_c=context.outdoor_temperature_c,
            air_data_available=False,
        ),
        primary_reason=(
            "Air quality data is unavailable right now, so this recommendation is "
            "based on UV exposure only."
        ),
        reasons=reasons,
        note=" ".join(note_parts) if note_parts else None,
        based_on=_ordered_fields(
            *uv.based_on_fields,
            *(
                field_name
                for field_name in ("outdoor_temperature_c",)
                if getattr(context, field_name) is not None
            ),
        ),
    )


def _assess_air_quality(
    context: VentilationContext,
    *,
    pm_thresholds: dict[str, float] | None = None,
) -> _AirAssessment | None:
    pollutant_levels: list[tuple[str, SuggestionSeverity]] = []

    if context.outdoor_pm25 is not None:
        pollutant_levels.append(("outdoor_pm25", _pm25_severity(context.outdoor_pm25, pm_thresholds)))
    if context.outdoor_pm10 is not None:
        pollutant_levels.append(("outdoor_pm10", _pm10_severity(context.outdoor_pm10, pm_thresholds)))

    if not pollutant_levels:
        return None

    dominant_field, severity = max(
        pollutant_levels,
        key=lambda item: (_SEVERITY_RANK[item[1]], 1 if item[0] == "outdoor_pm25" else 0),
    )

    title_map = {
        "good": "Great time for outdoor activity",
        "ok": "Outdoor activity looks fine",
        "caution": "Take it a bit easier outdoors",
        "warning": "Limit intense outdoor exercise",
        "danger": "Better to avoid outdoor exercise now",
    }
    message_map = {
        "good": (
            "Outdoor air looks clean right now. This is a good time for walking, "
            "running, cycling, or other outdoor activity."
        ),
        "ok": (
            "Outdoor conditions look okay right now. Normal outdoor activity should "
            "be fine for most people."
        ),
        "caution": (
            "Air quality is slightly elevated right now, so lighter or shorter "
            "outdoor activity is the better choice."
        ),
        "warning": (
            "Air quality is poor right now, so it is better to keep outdoor "
            "activity light or move intense exercise indoors."
        ),
        "danger": (
            "Air quality is very poor right now, so it is better to avoid outdoor "
            "exercise and limit time outside if possible."
        ),
    }
    short_label_map = {
        "good": "Good for outdoor activity",
        "ok": "Good for most people",
        "caution": "Better for light activity",
        "warning": "Limit intense exercise",
        "danger": "Avoid outdoor exercise",
    }

    reasons = _build_air_reason_tags(
        severity=severity,
        dominant_field=dominant_field,
        has_pm25=context.outdoor_pm25 is not None,
        has_pm10=context.outdoor_pm10 is not None,
    )

    based_on = tuple(field_name for field_name, _ in pollutant_levels)

    return _AirAssessment(
        severity=severity,
        title=title_map[severity],
        message=message_map[severity],
        short_label=short_label_map[severity],
        reasons=reasons,
        based_on_fields=based_on,
    )


def _assess_uv(value: float | None) -> _UvAssessment | None:
    if value is None:
        return None

    if value <= 2:
        return _UvAssessment(
            bucket="low",
            note="UV is low right now.",
            reason_tag="UV low",
            based_on_fields=("outdoor_uv_index",),
        )
    if value <= 5:
        return _UvAssessment(
            bucket="moderate",
            note=(
                "UV is moderate right now. Sun protection may be useful during "
                "longer time outdoors."
            ),
            reason_tag="UV moderate",
            based_on_fields=("outdoor_uv_index",),
        )
    if value <= 7:
        return _UvAssessment(
            bucket="high",
            note=(
                "UV is high right now. Consider sunscreen, sunglasses, and limiting "
                "long exposure during peak sun hours."
            ),
            reason_tag="UV high",
            based_on_fields=("outdoor_uv_index",),
        )
    if value <= 10:
        return _UvAssessment(
            bucket="very_high",
            note=(
                "UV is very high right now. Outdoor activity is still possible, but "
                "sun protection is strongly recommended and long exposure should be "
                "limited."
            ),
            reason_tag="Sun protection recommended",
            based_on_fields=("outdoor_uv_index",),
        )
    return _UvAssessment(
        bucket="extreme",
        note=(
            "UV is extreme right now. Try to reduce prolonged sun exposure and "
            "avoid intense activity in direct sun during peak hours if possible."
        ),
        reason_tag="UV extreme",
        based_on_fields=("outdoor_uv_index",),
    )


def _pm25_severity(
    value: float,
    pm_thresholds: dict[str, float] | None = None,
) -> SuggestionSeverity:
    t = pm_thresholds or {}
    medium = t.get("pm25_medium_threshold", 25)
    high = t.get("pm25_high_threshold", 50)
    critical = t.get("pm25_critical_threshold", 75)

    if value <= 10:
        return "good"
    if value < medium:
        return "ok"
    if value < high:
        return "caution"
    if value < critical:
        return "warning"
    return "danger"


def _pm10_severity(
    value: float,
    pm_thresholds: dict[str, float] | None = None,
) -> SuggestionSeverity:
    t = pm_thresholds or {}
    medium = t.get("pm10_medium_threshold", 50)
    high = t.get("pm10_high_threshold", 100)
    critical = t.get("pm10_critical_threshold", 150)

    if value <= 20:
        return "good"
    if value < medium:
        return "ok"
    if value < high:
        return "caution"
    if value < critical:
        return "warning"
    return "danger"


def _build_air_reason_tags(
    *,
    severity: SuggestionSeverity,
    dominant_field: str,
    has_pm25: bool,
    has_pm10: bool,
) -> tuple[str, ...]:
    reason_tags: list[str] = []

    if severity in {"caution", "warning", "danger"}:
        if dominant_field == "outdoor_pm25":
            reason_tags.append("PM2.5 elevated")
        elif dominant_field == "outdoor_pm10":
            reason_tags.append("PM10 elevated")
    elif severity == "ok":
        reason_tags.append("Air looks acceptable")
    else:
        reason_tags.append("Air looks clean")

    if severity == "caution":
        reason_tags.append("Better for light activity")
    elif severity == "warning":
        reason_tags.append("Limit intense exercise")
    elif severity == "danger":
        reason_tags.append("Avoid outdoor exercise")

    if has_pm25 and dominant_field != "outdoor_pm25" and severity in {"warning", "danger"}:
        reason_tags.append("PM2.5 tracked")
    if has_pm10 and dominant_field != "outdoor_pm10" and severity in {"warning", "danger"}:
        reason_tags.append("PM10 tracked")

    return tuple(reason_tags)


def _build_note_parts(
    context: VentilationContext,
    uv: _UvAssessment | None,
) -> list[str]:
    note_parts: list[str] = []

    if uv is not None and uv.bucket != "low":
        note_parts.append(uv.note)

    temperature = context.outdoor_temperature_c
    if temperature is not None and temperature >= 28:
        note_parts.append(
            "It is also hot outside right now, so intense activity may feel harder."
        )
    elif temperature is not None and temperature <= -5:
        note_parts.append(
            "It is also very cold outside right now, and cold air may irritate the "
            "lungs during intense exercise."
        )

    return note_parts


def _build_weather_reason_tags(context: VentilationContext) -> tuple[str, ...]:
    temperature = context.outdoor_temperature_c
    if temperature is None:
        return ()
    if temperature >= 28:
        return ("Hot weather",)
    if temperature <= -5:
        return ("Cold air",)
    return ()


def _build_reason_tags(*reason_tags: str) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for reason_tag in reason_tags:
        if not reason_tag or reason_tag in seen:
            continue
        seen.add(reason_tag)
        ordered.append(reason_tag)
    return ordered


def _merge_recommendation(base_message: str, note_parts: list[str]) -> str:
    return (
        f"{base_message} {' '.join(note_parts)}".strip()
        if note_parts
        else base_message
    )


def _build_activity_impact(
    *,
    severity: SuggestionSeverity,
    uv: _UvAssessment | None,
    temperature_c: float | None,
    air_data_available: bool,
) -> str | None:
    impact_parts: list[str] = []

    if air_data_available and severity in {"caution", "warning", "danger"}:
        impact_parts.append(
            "Elevated particle levels can make harder exercise feel less comfortable and may irritate breathing."
        )
    elif uv is not None and uv.bucket in {"moderate", "high", "very_high", "extreme"}:
        impact_parts.append(
            "Stronger sun exposure can increase sunburn risk and make longer activity less comfortable."
        )

    if temperature_c is not None and temperature_c >= 28:
        impact_parts.append(
            "Heat can make intense outdoor activity feel harder."
        )
    elif temperature_c is not None and temperature_c <= -5:
        impact_parts.append(
            "Very cold air can irritate the lungs during intense exercise."
        )

    return " ".join(impact_parts) if impact_parts else None


def _ordered_fields(*field_names: str) -> list[str]:
    unique_fields = {field_name for field_name in field_names if field_name}
    return [field_name for field_name in _FIELD_ORDER if field_name in unique_fields]
