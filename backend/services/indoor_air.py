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
) -> IndoorAirSuggestion | None:
    indoor_pm25 = context.indoor_pm25
    if indoor_pm25 is None or indoor_pm25 <= threshold:
        return None

    recommendation = (
        "Indoor PM2.5 is high, which means the air inside currently contains too "
        "many fine particles."
    )
    reasons = ["Indoor PM2.5 high"]
    based_on = ["indoor_pm25"]

    if (
        not has_ventilation_recommendation
        and context.outdoor_pm25 is not None
        and context.outdoor_pm25 <= threshold
        and context.outdoor_pm25 + 5 <= indoor_pm25
    ):
        recommendation += " Outdoor air looks cleaner than indoor air right now, so a short airing-out may help."
        reasons.append("Outdoor air cleaner")
        based_on = _ordered_fields("outdoor_pm25", "indoor_pm25")

    severity: SuggestionSeverity = "danger" if indoor_pm25 >= threshold * 2 else "warning"
    priority: SuggestionPriority = "high"

    return IndoorAirSuggestion(
        id="indoor_pm25_high",
        priority=priority,
        severity=severity,
        title="Indoor PM2.5 is high",
        short_label="Particles elevated",
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


def _ordered_fields(*field_names: str) -> list[str]:
    unique_fields = {field_name for field_name in field_names if field_name}
    return [field_name for field_name in _FIELD_ORDER if field_name in unique_fields]
