from __future__ import annotations

from backend.schemas.suggestions import (
    IndoorAirSuggestion,
    SuggestionPriority,
    SuggestionSeverity,
    VentilationContext,
)

_FIELD_ORDER = (
    "outdoor_pm25",
    "indoor_pm25",
    "indoor_humidity_pct",
    "outdoor_humidity_pct",
)


def evaluate_high_indoor_pm25(
    context: VentilationContext,
    *,
    threshold: float,
    has_ventilation_recommendation: bool,
    pm_thresholds: dict[str, float] | None = None,
) -> IndoorAirSuggestion | None:
    indoor_pm25 = context.indoor_pm25
    if indoor_pm25 is None:
        return None

    medium = (pm_thresholds or {}).get("pm25_medium_threshold", threshold)
    high = (pm_thresholds or {}).get("pm25_high_threshold", medium + 10)
    critical = (pm_thresholds or {}).get("pm25_critical_threshold", high + 25)

    if indoor_pm25 < medium:
        return None

    based_on: list[str] = ["indoor_pm25"]

    if indoor_pm25 >= critical:
        priority: SuggestionPriority = "high"
        severity: SuggestionSeverity = "danger"
        title = "Indoor PM2.5 is very high"
        short_label = "Particles critical"
        recommendation = (
            "Indoor PM2.5 is very high. The air inside contains a dangerous amount "
            "of fine particles. Ventilate immediately if outdoor air is cleaner, "
            "and consider using an air purifier."
        )
    elif indoor_pm25 >= high:
        priority = "high"
        severity = "warning"
        title = "Indoor PM2.5 is high"
        short_label = "Particles elevated"
        recommendation = (
            "Indoor PM2.5 is high, which means the air inside currently contains "
            "too many fine particles."
        )
    else:
        priority = "medium"
        severity = "caution"
        title = "Indoor PM2.5 is moderately elevated"
        short_label = "Particles moderate"
        recommendation = (
            "Indoor PM2.5 is moderately elevated. The level is not critical, "
            "but ventilating when outdoor air is cleaner can help keep it in check."
        )

    reasons = [f"Indoor PM2.5 {short_label.lower()}"]

    if (
        not has_ventilation_recommendation
        and context.outdoor_pm25 is not None
        and context.outdoor_pm25 <= medium
        and context.outdoor_pm25 + 5 <= indoor_pm25
    ):
        recommendation += " Outdoor air looks cleaner than indoor air right now, so a short airing-out may help."
        reasons.append("Outdoor air cleaner")
        based_on = _ordered_fields("outdoor_pm25", "indoor_pm25")

    return IndoorAirSuggestion(
        id="indoor_pm25_high",
        priority=priority,
        severity=severity,
        title=title,
        short_label=short_label,
        recommendation=recommendation,
        impact=(
            "Elevated indoor PM2.5 can irritate the airways and reduce indoor air "
            "quality, especially during longer exposure."
        ),
        primary_reason=recommendation,
        reasons=reasons,
        based_on=based_on,
    )


def evaluate_low_indoor_humidity(
    context: VentilationContext,
    *,
    low_threshold: float,
    ideal_min: float | None = None,
) -> IndoorAirSuggestion | None:
    indoor_humidity = context.indoor_humidity_pct
    if indoor_humidity is None:
        return None

    effective_ideal_min = ideal_min if ideal_min is not None else low_threshold
    if indoor_humidity >= effective_ideal_min:
        return None

    outdoor_humidity = context.outdoor_humidity_pct
    outdoor_is_humid = outdoor_humidity is not None and outdoor_humidity > 50
    outdoor_is_dry = outdoor_humidity is not None and outdoor_humidity <= 50

    based_on: list[str] = _ordered_fields("indoor_humidity_pct", "outdoor_humidity_pct") if outdoor_humidity is not None else ["indoor_humidity_pct"]

    if indoor_humidity < low_threshold:
        if outdoor_is_humid:
            recommendation = (
                "Indoor humidity is very low, but outdoor humidity is currently "
                f"around {outdoor_humidity:.0f}%. Opening a window for a while "
                "should help bring moisture back inside. You can also use a "
                "humidifier or place water containers near heat sources."
            )
            reasons = ["Very dry indoors", "Humid outdoors"]
        elif outdoor_is_dry:
            recommendation = (
                "Indoor humidity is very low and outdoor air is dry too "
                f"(around {outdoor_humidity:.0f}%), so airing alone won't help "
                "much. Consider using a humidifier, placing water containers "
                "near heat sources, or drying laundry indoors."
            )
            reasons = ["Very dry indoors", "Dry outdoors"]
        else:
            recommendation = (
                "Indoor humidity is very low. Consider using a humidifier, "
                "placing water containers near heat sources, or drying laundry "
                "indoors to bring moisture back into the air."
            )
            reasons = ["Very dry indoors"]

        return IndoorAirSuggestion(
            id="indoor_humidity_low",
            priority="high",
            severity="warning",
            title="Indoor humidity is very low",
            short_label="Very dry air",
            recommendation=recommendation,
            impact=(
                "Very dry air can cause cracked skin, irritated eyes and throat, "
                "nosebleeds, and worsened respiratory conditions."
            ),
            primary_reason=recommendation,
            reasons=reasons,
            based_on=based_on,
        )

    if outdoor_is_humid:
        recommendation = (
            "Indoor humidity is a bit low, but outdoor humidity is currently "
            f"around {outdoor_humidity:.0f}%. Try opening a window briefly to "
            "let some of that moisture in."
        )
        reasons = ["Dry indoors", "Humid outdoors"]
    elif outdoor_is_dry:
        recommendation = (
            "Indoor humidity is a bit low and outdoor air is also dry "
            f"(around {outdoor_humidity:.0f}%), so ventilating won't raise it "
            "much. A humidifier or keeping houseplants can help gently raise "
            "indoor moisture levels."
        )
        reasons = ["Dry indoors", "Dry outdoors"]
    else:
        recommendation = (
            "Indoor humidity is a bit low. Try airing briefly, using a "
            "humidifier, or keeping houseplants to gently raise indoor "
            "moisture levels."
        )
        reasons = ["Dry indoors"]

    return IndoorAirSuggestion(
        id="indoor_humidity_low",
        priority="medium",
        severity="caution",
        title="Indoor humidity is low",
        short_label="Dry air",
        recommendation=recommendation,
        impact=(
            "Mildly dry indoor air can irritate the throat, skin, eyes, or nose "
            "and may feel uncomfortable over time."
        ),
        primary_reason=recommendation,
        reasons=reasons,
        based_on=based_on,
    )


def evaluate_high_indoor_humidity(
    context: VentilationContext,
    *,
    pm_thresholds: dict[str, float] | None = None,
) -> IndoorAirSuggestion | None:
    humidity = context.indoor_humidity_pct
    if humidity is None:
        return None

    t = pm_thresholds or {}
    high_pct = t.get("indoor_humidity_high_pct", 70.0)

    if humidity < high_pct:
        return None

    severe = humidity >= high_pct + 10

    return IndoorAirSuggestion(
        id="indoor_humidity_high",
        priority="high" if severe else "medium",
        severity="warning" if severe else "caution",
        title="Indoor humidity is very high" if severe else "Indoor humidity is high",
        short_label="Very humid" if severe else "Humid air",
        recommendation=(
            f"Indoor humidity is around {humidity:.0f}%. High moisture promotes mold "
            "growth and dust mites. Ventilate, use a dehumidifier, or avoid drying "
            "laundry indoors."
        ),
        impact=(
            "Persistently high indoor humidity can trigger mold, worsen allergies, "
            "and make the air feel stuffy."
        ),
        primary_reason=f"Indoor humidity is {humidity:.0f}%, above the {high_pct:.0f}% threshold.",
        reasons=["Humid indoors", "Mold risk"] if severe else ["Humid indoors"],
        based_on=["indoor_humidity_pct"],
    )


def evaluate_indoor_co2(
    context: VentilationContext,
    *,
    pm_thresholds: dict[str, float] | None = None,
) -> IndoorAirSuggestion | None:
    co2 = context.indoor_co2_ppm
    if co2 is None:
        return None

    t = pm_thresholds or {}
    medium_ppm = t.get("indoor_co2_medium_ppm", 800.0)
    high_ppm = t.get("indoor_co2_high_ppm", 1200.0)

    if co2 < medium_ppm:
        return None

    if co2 >= high_ppm:
        return IndoorAirSuggestion(
            id="indoor_co2_elevated",
            priority="high",
            severity="warning",
            title="Indoor CO₂ is very high",
            short_label="CO₂ critical",
            recommendation=(
                f"Indoor CO₂ is around {round(co2)} ppm — well above healthy levels. "
                "Open windows or doors immediately to let fresh air in. The room is "
                "poorly ventilated."
            ),
            impact=(
                "Very high CO₂ can cause headaches, drowsiness, and difficulty "
                "concentrating. Ventilation is urgently needed."
            ),
            primary_reason=f"Indoor CO₂ is {round(co2)} ppm, above the {round(high_ppm)} ppm threshold.",
            reasons=["CO₂ very high", "Ventilate now"],
            based_on=["indoor_co2_ppm"],
        )

    return IndoorAirSuggestion(
        id="indoor_co2_elevated",
        priority="medium",
        severity="caution",
        title="Indoor CO₂ is getting high",
        short_label="CO₂ elevated",
        recommendation=(
            f"Indoor CO₂ is around {round(co2)} ppm. The air is getting stale — "
            "a brief airing-out will help keep it fresh."
        ),
        impact=(
            "Elevated CO₂ can gradually reduce concentration and make the room "
            "feel stuffy."
        ),
        primary_reason=f"Indoor CO₂ is {round(co2)} ppm, above the {round(medium_ppm)} ppm threshold.",
        reasons=["CO₂ elevated"],
        based_on=["indoor_co2_ppm"],
    )


def _ordered_fields(*field_names: str) -> list[str]:
    unique_fields = {field_name for field_name in field_names if field_name}
    return [field_name for field_name in _FIELD_ORDER if field_name in unique_fields]
