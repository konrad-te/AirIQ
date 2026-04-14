from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from backend.schemas.suggestions import VentilationContext, VentilationSuggestion

OutdoorVentilationBucket = Literal["good", "acceptable", "poor"]
IndoorVentilationNeedBucket = Literal["clear", "slight", "none"]

_FIELD_ORDER = (
    "outdoor_pm25",
    "outdoor_pm10",
    "indoor_co2_ppm",
    "indoor_pm25",
    "indoor_pm10",
    "wind_kmh",
)


@dataclass(frozen=True)
class _OutdoorAssessment:
    bucket: OutdoorVentilationBucket
    based_on_fields: tuple[str, ...]


@dataclass(frozen=True)
class _IndoorAssessment:
    bucket: IndoorVentilationNeedBucket
    clear_co2: bool
    clear_particles: bool
    slight_co2: bool
    slight_particles: bool
    trigger_fields: list[str]
    provided_fields: tuple[str, ...]


def get_outdoor_ventilation_bucket(
    context: VentilationContext,
) -> OutdoorVentilationBucket | None:
    assessment = _assess_outdoor_air(context)
    return assessment.bucket if assessment else None


def get_indoor_ventilation_need_bucket(
    context: VentilationContext,
) -> IndoorVentilationNeedBucket | None:
    assessment = _assess_indoor_need(context)
    return assessment.bucket if assessment else None


def evaluate_ventilation(
    context: VentilationContext,
) -> VentilationSuggestion | None:
    outdoor = _assess_outdoor_air(context)
    if outdoor is None:
        return None

    indoor = _assess_indoor_need(context)
    if indoor is None:
        return None

    note = _build_note(context)
    note_fields = ("wind_kmh",) if note is not None else ()

    if outdoor.bucket == "poor" and indoor.bucket == "clear":
        return VentilationSuggestion(
            id="improve_air_without_ventilation",
            priority="high",
            title="Improve air without opening windows",
            recommendation=_build_blocked_recommendation(indoor),
            impact=_build_clear_impact(indoor),
            primary_reason="Outdoor air is too polluted for ventilation.",
            secondary_reasons=_build_clear_secondary_reasons(indoor, fallback=True),
            advice=None,
            note=note,
            based_on=_ordered_fields(
                *outdoor.based_on_fields,
                *indoor.trigger_fields,
                *note_fields,
            ),
        )

    if outdoor.bucket == "poor" and indoor.bucket != "clear":
        return VentilationSuggestion(
            id="keep_windows_closed",
            priority="high",
            title="Keep windows closed for now",
            recommendation=(
                "Keep windows closed for now because outdoor particle pollution is "
                "too high for safe ventilation."
            ),
            impact=(
                "Bringing polluted outdoor air inside can make the room less "
                "comfortable to breathe."
            ),
            primary_reason="Outdoor particle levels are too high for safe ventilation.",
            secondary_reasons=[],
            advice=None,
            note=note,
            based_on=_ordered_fields(
                *outdoor.based_on_fields,
                *indoor.provided_fields,
                *note_fields,
            ),
        )

    if outdoor.bucket == "good" and indoor.bucket == "clear":
        return VentilationSuggestion(
            id="open_windows_now",
            priority="high",
            title="Open windows now",
            recommendation=_build_open_recommendation(indoor, outdoor.bucket),
            impact=_build_clear_impact(indoor),
            primary_reason=(
                "Outdoor air is clean and indoor air would benefit from ventilation."
            ),
            secondary_reasons=_build_clear_secondary_reasons(indoor, fallback=False),
            advice=None,
            note=note,
            based_on=_ordered_fields(
                *outdoor.based_on_fields,
                *indoor.trigger_fields,
                *note_fields,
            ),
        )

    if outdoor.bucket == "acceptable" and indoor.bucket == "clear":
        return VentilationSuggestion(
            id="ventilate_briefly",
            priority="high",
            title="Ventilate briefly",
            recommendation=_build_open_recommendation(indoor, outdoor.bucket),
            impact=_build_clear_impact(indoor),
            primary_reason=(
                "Indoor air would benefit from ventilation, and outdoor air is "
                "acceptable for a short refresh."
            ),
            secondary_reasons=_build_clear_secondary_reasons(indoor, fallback=False),
            advice="A short airing-out is safer here than leaving windows open for long.",
            note=note,
            based_on=_ordered_fields(
                *outdoor.based_on_fields,
                *indoor.trigger_fields,
                *note_fields,
            ),
        )

    if outdoor.bucket in {"good", "acceptable"} and indoor.bucket == "slight":
        return VentilationSuggestion(
            id="ventilate_soon",
            priority="medium",
            title="Ventilate soon",
            recommendation=_build_soon_recommendation(indoor, outdoor.bucket),
            impact=_build_slight_impact(indoor),
            primary_reason=(
                "Indoor air is starting to feel stale, and outdoor air is still "
                "acceptable for ventilation."
            ),
            secondary_reasons=_build_slight_secondary_reasons(indoor),
            advice=None,
            note=note,
            based_on=_ordered_fields(
                *outdoor.based_on_fields,
                *indoor.trigger_fields,
                *note_fields,
            ),
        )

    return None


def _assess_outdoor_air(context: VentilationContext) -> _OutdoorAssessment | None:
    if context.outdoor_pm25 is None or context.outdoor_pm10 is None:
        return None

    if context.outdoor_pm25 <= 12 and context.outdoor_pm10 <= 20:
        bucket: OutdoorVentilationBucket = "good"
    elif context.outdoor_pm25 <= 20 and context.outdoor_pm10 <= 35:
        bucket = "acceptable"
    else:
        bucket = "poor"

    return _OutdoorAssessment(
        bucket=bucket,
        based_on_fields=("outdoor_pm25", "outdoor_pm10"),
    )


def _assess_indoor_need(context: VentilationContext) -> _IndoorAssessment | None:
    provided_fields = tuple(
        field_name
        for field_name in ("indoor_co2_ppm", "indoor_pm25", "indoor_pm10")
        if getattr(context, field_name) is not None
    )
    if not provided_fields:
        return None

    clear_co2 = context.indoor_co2_ppm is not None and context.indoor_co2_ppm >= 900
    clear_particle_fields = tuple(
        field_name
        for field_name, value, threshold in (
            ("indoor_pm25", context.indoor_pm25, 40),
            ("indoor_pm10", context.indoor_pm10, 40),
        )
        if value is not None and value >= threshold
    )
    clear_particles = bool(clear_particle_fields)

    if clear_co2 or clear_particles:
        return _IndoorAssessment(
            bucket="clear",
            clear_co2=clear_co2,
            clear_particles=clear_particles,
            slight_co2=False,
            slight_particles=False,
            trigger_fields=_ordered_fields(
                *(("indoor_co2_ppm",) if clear_co2 else ()),
                *clear_particle_fields,
            ),
            provided_fields=provided_fields,
        )

    slight_co2 = (
        context.indoor_co2_ppm is not None and 700 <= context.indoor_co2_ppm < 900
    )
    slight_particle_fields = tuple(
        field_name
        for field_name, value, lower, upper in (
            ("indoor_pm25", context.indoor_pm25, 10, 40),
            ("indoor_pm10", context.indoor_pm10, 15, 40),
        )
        if value is not None and lower <= value < upper
    )
    slight_particles = bool(slight_particle_fields)

    return _IndoorAssessment(
        bucket="slight" if slight_co2 or slight_particles else "none",
        clear_co2=False,
        clear_particles=False,
        slight_co2=slight_co2,
        slight_particles=slight_particles,
        trigger_fields=_ordered_fields(
            *(("indoor_co2_ppm",) if slight_co2 else ()),
            *slight_particle_fields,
        ),
        provided_fields=provided_fields,
    )


def _build_clear_secondary_reasons(
    assessment: _IndoorAssessment,
    *,
    fallback: bool,
) -> list[str]:
    reasons: list[str] = []

    if assessment.clear_co2:
        reasons.append(
            "Indoor CO2 is elevated, so the room may feel stale."
            if fallback
            else "Indoor CO2 is elevated, so ventilation would help refresh the room."
        )

    if assessment.clear_particles:
        reasons.append(
            "Indoor particle levels are elevated as well."
            if fallback
            else "Indoor particle levels are elevated."
        )

    return reasons


def _build_slight_secondary_reasons(assessment: _IndoorAssessment) -> list[str]:
    reasons: list[str] = []

    if assessment.slight_co2:
        reasons.append("CO2 is slightly elevated.")

    if assessment.slight_particles:
        reasons.append("Indoor particles are slightly elevated.")

    return reasons


def _build_blocked_recommendation(assessment: _IndoorAssessment) -> str:
    indoor_context = _describe_indoor_need(assessment, emphasize=True)
    return (
        f"{indoor_context}, but outdoor air is too polluted for opening windows "
        "right now."
    )


def _build_open_recommendation(
    assessment: _IndoorAssessment,
    outdoor_bucket: OutdoorVentilationBucket,
) -> str:
    indoor_context = _describe_indoor_need(assessment, emphasize=True)
    if outdoor_bucket == "acceptable":
        return (
            f"{indoor_context}, so a short airing-out is recommended. Outdoor air "
            "quality is acceptable right now, but it is better not to leave windows "
            "open for long."
        )
    return (
        f"{indoor_context}, so airing out the room is recommended. Outdoor air is "
        "clean right now."
    )


def _build_soon_recommendation(
    assessment: _IndoorAssessment,
    outdoor_bucket: OutdoorVentilationBucket,
) -> str:
    indoor_context = _describe_indoor_need(assessment, emphasize=False)
    outdoor_context = (
        "Outdoor air is still acceptable right now."
        if outdoor_bucket == "acceptable"
        else "Outdoor air is clean right now."
    )
    return f"{indoor_context}, so plan a short airing-out soon. {outdoor_context}"


def _build_clear_impact(assessment: _IndoorAssessment) -> str | None:
    impacts: list[str] = []

    if assessment.clear_co2:
        impacts.append(
            "High indoor CO2 can make the room feel stuffy and may reduce comfort or focus."
        )
    if assessment.clear_particles:
        impacts.append(
            "Elevated indoor particles can make the air feel less comfortable to breathe."
        )

    return " ".join(impacts) if impacts else None


def _build_slight_impact(assessment: _IndoorAssessment) -> str | None:
    impacts: list[str] = []

    if assessment.slight_co2:
        impacts.append(
            "Slightly elevated CO2 can make a room feel stale over time."
        )
    if assessment.slight_particles:
        impacts.append(
            "Slightly elevated indoor particles can reduce comfort if they keep building up."
        )

    return " ".join(impacts) if impacts else None


def _describe_indoor_need(
    assessment: _IndoorAssessment,
    *,
    emphasize: bool,
) -> str:
    if assessment.clear_co2 and assessment.clear_particles:
        return (
            "Indoor CO2 and particle levels are elevated"
            if emphasize
            else "Indoor air is starting to feel stale"
        )
    if assessment.clear_co2:
        return (
            "Indoor CO2 is high"
            if emphasize
            else "Indoor CO2 is starting to climb"
        )
    if assessment.clear_particles:
        return (
            "Indoor particle levels are elevated"
            if emphasize
            else "Indoor particles are starting to build up"
        )
    if assessment.slight_co2 and assessment.slight_particles:
        return "Indoor CO2 and particles are starting to rise"
    if assessment.slight_co2:
        return "Indoor CO2 is slightly elevated"
    if assessment.slight_particles:
        return "Indoor particle levels are slightly elevated"
    return "Indoor air is starting to feel stale"


def _build_note(context: VentilationContext) -> str | None:
    if context.wind_kmh is not None and context.wind_kmh >= 35:
        return "It is also quite windy outside right now."
    return None


def _ordered_fields(*field_names: str) -> list[str]:
    unique_fields = {field_name for field_name in field_names if field_name}
    return [field_name for field_name in _FIELD_ORDER if field_name in unique_fields]
