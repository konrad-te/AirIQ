from __future__ import annotations

from backend.schemas.suggestions import (
    RainSuggestion,
    UvSuggestion,
    VentilationContext,
)

_STORM_CODES = frozenset({
    95, 96, 99,
})
_HEAVY_RAIN_CODES = frozenset({
    65, 67, 75, 77, 82, 86,
})
_MODERATE_RAIN_CODES = frozenset({
    51, 53, 55, 56, 57, 61, 63, 66, 71, 73, 80, 81, 85,
})


def evaluate_rain(context: VentilationContext) -> RainSuggestion | None:
    rain_mm = context.rain_mm
    weather_code = context.weather_code

    is_storm = weather_code in _STORM_CODES
    is_heavy = weather_code in _HEAVY_RAIN_CODES or (rain_mm is not None and rain_mm >= 7.5)

    if is_storm:
        return RainSuggestion(
            id="heavy_rain_warning",
            priority="high",
            severity="danger",
            title="Thunderstorm in the area",
            short_label="Storm warning",
            recommendation=(
                "A thunderstorm is reported in your area. Stay indoors, avoid open "
                "fields, and postpone outdoor activities until it passes."
            ),
            impact="Lightning and strong gusts make outdoor activity dangerous.",
            primary_reason="Active thunderstorm detected.",
            reasons=["Storm", "Stay indoors"],
            based_on=["weather_code"],
        )

    if is_heavy:
        return RainSuggestion(
            id="heavy_rain_warning",
            priority="high",
            severity="warning",
            title="Heavy rain right now",
            short_label="Heavy rain",
            recommendation=(
                "Heavy rain is falling right now. If you go outside, expect reduced "
                "visibility and wet conditions. Consider postponing outdoor plans."
            ),
            impact="Heavy rain can make roads slippery and outdoor activity unpleasant.",
            primary_reason="Heavy precipitation is reported.",
            reasons=["Heavy rain"],
            based_on=["rain_mm", "weather_code"],
        )

    is_moderate = weather_code in _MODERATE_RAIN_CODES or (rain_mm is not None and rain_mm >= 1.0)

    if is_moderate:
        return RainSuggestion(
            id="rain_advisory",
            priority="medium",
            severity="caution",
            title="Rain expected or falling",
            short_label="Rain",
            recommendation=(
                "Light to moderate rain is expected or falling. Bring rain gear if "
                "you head outside, and plan for wet surfaces."
            ),
            impact="Rain can make outdoor activity less comfortable and surfaces slippery.",
            primary_reason="Light to moderate precipitation.",
            reasons=["Rain"],
            based_on=["rain_mm", "weather_code"],
        )

    return None


def evaluate_uv(
    context: VentilationContext,
    *,
    pm_thresholds: dict[str, float] | None = None,
) -> UvSuggestion | None:
    uv = context.outdoor_uv_index
    if uv is None:
        return None

    t = pm_thresholds or {}
    high_threshold = t.get("uv_high_threshold", 6.0)

    if uv < high_threshold:
        return None

    if uv >= 11:
        return UvSuggestion(
            id="uv_high",
            priority="high",
            severity="danger",
            title="UV index is extreme",
            short_label="UV extreme",
            recommendation=(
                f"UV index is {round(uv, 1)} — avoid prolonged sun exposure, seek shade, "
                "wear sunscreen SPF 50+, sunglasses, and a hat."
            ),
            impact="Extreme UV can cause sunburn in minutes and raises skin damage risk.",
            primary_reason="UV index is at an extreme level.",
            reasons=["UV extreme", "Seek shade"],
            based_on=["outdoor_uv_index"],
        )

    if uv >= 8:
        return UvSuggestion(
            id="uv_high",
            priority="high",
            severity="warning",
            title="UV index is very high",
            short_label="UV very high",
            recommendation=(
                f"UV index is {round(uv, 1)} — use sunscreen, limit midday exposure, "
                "and wear sun-protective clothing."
            ),
            impact="Very high UV increases sunburn risk during extended outdoor time.",
            primary_reason="UV index is very high.",
            reasons=["UV very high", "Sun protection needed"],
            based_on=["outdoor_uv_index"],
        )

    return UvSuggestion(
        id="uv_high",
        priority="high",
        severity="caution",
        title="UV index is high",
        short_label="UV high",
        recommendation=(
            f"UV index is {round(uv, 1)} — consider sunscreen and a hat if you "
            "plan to spend time outside, especially around midday."
        ),
        impact="High UV can cause sunburn with extended exposure.",
        primary_reason="UV index is high enough to merit sun protection.",
        reasons=["UV high"],
        based_on=["outdoor_uv_index"],
    )
