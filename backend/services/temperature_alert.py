from __future__ import annotations

from backend.schemas.suggestions import TemperatureSuggestion, VentilationContext

COLD_CAUTION_C = -5.0
COLD_WARNING_C = -10.0
INDOOR_COLD_CAUTION_C = 16.0
INDOOR_COLD_WARNING_C = 12.0


def evaluate_outdoor_temperature(
    context: VentilationContext,
    *,
    pm_thresholds: dict[str, float] | None = None,
) -> TemperatureSuggestion | None:
    temperature_c = context.outdoor_temperature_c
    if temperature_c is None:
        return None

    t = pm_thresholds or {}
    hot_high = t.get("outdoor_temp_high_c", 30.0)
    hot_caution = hot_high - 2

    if temperature_c >= hot_high:
        return TemperatureSuggestion(
            id="outdoor_temp_too_hot",
            priority="high",
            severity="warning",
            title="Outdoor temperature is very high",
            short_label="Heat stress risk",
            recommendation=(
                f"It is around {round(temperature_c)}°C outside, so keep outdoor activity lighter, "
                "drink water regularly, and look for shade or cooler indoor breaks."
            ),
            impact=(
                "Very hot weather can increase the risk of dehydration, overheating, and fatigue, "
                "especially during longer walks or exercise."
            ),
            primary_reason="Outdoor temperature is high enough to make heat stress more likely.",
            reasons=["Very hot outside", "Hydration matters"],
            based_on=["outdoor_temperature_c"],
        )

    if temperature_c >= hot_caution:
        return TemperatureSuggestion(
            id="outdoor_temp_too_hot",
            priority="medium",
            severity="caution",
            title="Outdoor temperature is high",
            short_label="Hot weather",
            recommendation=(
                f"It is around {round(temperature_c)}°C outside, so take water with you, prefer lighter clothing, "
                "and avoid pushing too hard in direct sun."
            ),
            impact=(
                "Warm conditions can make outdoor activity feel harder and may increase dehydration over time."
            ),
            primary_reason="Outdoor temperature is warm enough to affect comfort and exertion.",
            reasons=["Hot outside"],
            based_on=["outdoor_temperature_c"],
        )

    if temperature_c <= COLD_WARNING_C:
        return TemperatureSuggestion(
            id="outdoor_temp_too_cold",
            priority="high",
            severity="warning",
            title="Outdoor temperature is very low",
            short_label="Cold exposure risk",
            recommendation=(
                f"It is around {round(temperature_c)}°C outside, so dress in warm layers, cover hands and ears, "
                "and limit long exposure if you do not need to stay outside."
            ),
            impact=(
                "Very cold air can strain breathing, reduce comfort, and increase the risk of cold exposure "
                "during longer time outdoors."
            ),
            primary_reason="Outdoor temperature is low enough to make cold exposure more likely.",
            reasons=["Very cold outside", "Layer up"],
            based_on=["outdoor_temperature_c"],
        )

    if temperature_c <= COLD_CAUTION_C:
        return TemperatureSuggestion(
            id="outdoor_temp_too_cold",
            priority="medium",
            severity="caution",
            title="Outdoor temperature is low",
            short_label="Cold air",
            recommendation=(
                f"It is around {round(temperature_c)}°C outside, so wear an extra layer and protect exposed skin "
                "if you plan to stay out for a while."
            ),
            impact=(
                "Cold air can make outdoor activity less comfortable and may irritate the airways for some people."
            ),
            primary_reason="Outdoor temperature is low enough to noticeably affect comfort outdoors.",
            reasons=["Cold outside"],
            based_on=["outdoor_temperature_c"],
        )

    return None


def evaluate_indoor_temperature(
    context: VentilationContext,
    *,
    pm_thresholds: dict[str, float] | None = None,
) -> TemperatureSuggestion | None:
    temperature_c = context.indoor_temperature_c
    if temperature_c is None:
        return None

    t = pm_thresholds or {}
    hot_threshold = t.get("indoor_temp_hot_c", 28.0)
    cold_threshold = t.get("indoor_temp_cold_c", 16.0)
    hot_severe = hot_threshold + 4
    cold_severe = cold_threshold - 4

    if temperature_c >= hot_severe:
        return TemperatureSuggestion(
            id="indoor_temp_too_hot",
            priority="high",
            severity="warning",
            title="Indoor temperature is very high",
            short_label="Room too hot",
            recommendation=(
                f"The room is around {round(temperature_c)}°C, so try to cool it down before staying inside for long or going to sleep. "
                "Close blinds, reduce heat sources, drink water, and ventilate only if outdoor air is cooler and cleaner."
            ),
            impact=(
                "Very warm indoor air can feel exhausting, reduce comfort, worsen sleep, and increase overheating risk over time."
            ),
            primary_reason="Indoor temperature is high enough to strongly affect comfort and heat buildup.",
            reasons=["Room too hot", "Sleep may worsen"],
            based_on=["indoor_temperature_c"],
        )

    if temperature_c >= hot_threshold:
        return TemperatureSuggestion(
            id="indoor_temp_too_hot",
            priority="medium",
            severity="caution",
            title="Indoor temperature is high",
            short_label="Room warm",
            recommendation=(
                f"The room is around {round(temperature_c)}°C, so lighter clothing, water, and reducing extra heat in the room can help keep it comfortable."
            ),
            impact=(
                "A warm room can feel stuffy, reduce comfort, and make concentration or sleep less pleasant."
            ),
            primary_reason="Indoor temperature is warm enough to affect comfort indoors.",
            reasons=["Room warm"],
            based_on=["indoor_temperature_c"],
        )

    if temperature_c <= cold_severe:
        return TemperatureSuggestion(
            id="indoor_temp_too_cold",
            priority="high",
            severity="warning",
            title="Indoor temperature is very low",
            short_label="Room too cold",
            recommendation=(
                f"The room is around {round(temperature_c)}°C, so add heat or extra layers and avoid letting the room stay this cold for long."
            ),
            impact=(
                "Very cold indoor air can reduce comfort, make rest harder, and feel harsh during longer time indoors."
            ),
            primary_reason="Indoor temperature is low enough to strongly affect comfort indoors.",
            reasons=["Room too cold", "Warm up room"],
            based_on=["indoor_temperature_c"],
        )

    if temperature_c <= cold_threshold:
        return TemperatureSuggestion(
            id="indoor_temp_too_cold",
            priority="medium",
            severity="caution",
            title="Indoor temperature is low",
            short_label="Room cool",
            recommendation=(
                f"The room is around {round(temperature_c)}°C, so an extra layer or a bit more heating may help keep it comfortable."
            ),
            impact=(
                "A cool room can feel uncomfortable over time and may make relaxing or sleeping less comfortable."
            ),
            primary_reason="Indoor temperature is cool enough to noticeably affect comfort indoors.",
            reasons=["Room cool"],
            based_on=["indoor_temperature_c"],
        )

    return None
