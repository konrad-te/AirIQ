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
) -> IndoorAirSuggestion | None:
    indoor_humidity = context.indoor_humidity_pct
    if indoor_humidity is None or indoor_humidity >= low_threshold:
        return None

    clearly_low = indoor_humidity <= max(0, low_threshold - 5)
    recommendation = (
        "Indoor humidity is very low, so the air may feel especially dry right now."
        if clearly_low
        else "Indoor humidity is low, so the air may feel dry right now."
    )

    return IndoorAirSuggestion(
        id="indoor_humidity_low",
        priority="medium",
        severity="warning" if clearly_low else "caution",
        title="Indoor humidity is low",
        short_label="Dry air",
        recommendation=recommendation,
        impact=(
            "Dry indoor air can irritate the throat, skin, eyes, or nose and may "
            "feel uncomfortable over time."
        ),
        primary_reason=recommendation,
        reasons=["Dry air"],
        based_on=["indoor_humidity_pct"],
    )


def _ordered_fields(*field_names: str) -> list[str]:
    unique_fields = {field_name for field_name in field_names if field_name}
    return [field_name for field_name in _FIELD_ORDER if field_name in unique_fields]
