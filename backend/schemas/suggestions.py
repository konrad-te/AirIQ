from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

VentilationSuggestionId = Literal[
    "improve_air_without_ventilation",
    "keep_windows_closed",
    "open_windows_now",
    "ventilate_briefly",
    "ventilate_soon",
    "ventilate_carefully",
    "outdoor_moderate_hold",
]
OutdoorActivitySuggestionId = Literal[
    "outdoor_activity",
    "outdoor_activity_uv_only",
    "outdoor_activity_missing",
]
IndoorAirSuggestionId = Literal[
    "indoor_pm25_high",
    "indoor_humidity_low",
    "indoor_humidity_high",
    "indoor_co2_elevated",
]
SleepSuggestionId = Literal[
    "sleep_temp_too_warm",
    "sleep_temp_too_cold",
]
TemperatureSuggestionId = Literal[
    "outdoor_temp_too_hot",
    "outdoor_temp_too_cold",
    "indoor_temp_too_hot",
    "indoor_temp_too_cold",
]
RainSuggestionId = Literal["rain_advisory", "heavy_rain_warning"]
UvSuggestionId = Literal["uv_high"]
IndoorCo2SuggestionId = Literal["indoor_co2_elevated"]
SuggestionPriority = Literal["high", "medium", "low"]
SuggestionSeverity = Literal["good", "ok", "caution", "warning", "danger"]


class VentilationContext(BaseModel):
    outdoor_pm25: float | None = None
    outdoor_pm10: float | None = None
    outdoor_uv_index: float | None = None
    outdoor_temperature_c: float | None = None
    outdoor_humidity_pct: float | None = None
    indoor_co2_ppm: float | None = None
    indoor_temperature_c: float | None = None
    indoor_pm25: float | None = None
    indoor_pm10: float | None = None
    indoor_humidity_pct: float | None = None
    wind_kmh: float | None = None
    rain_mm: float | None = None
    weather_code: int | None = None

    model_config = ConfigDict(extra="forbid")


class VentilationSuggestion(BaseModel):
    id: VentilationSuggestionId
    family: Literal["ventilation"] = "ventilation"
    category: Literal["ventilation"] = "ventilation"
    priority: SuggestionPriority
    title: str
    recommendation: str
    impact: str | None = None
    primary_reason: str
    secondary_reasons: list[str] = Field(default_factory=list)
    advice: str | None = None
    note: str | None = None
    based_on: list[str] = Field(default_factory=list)
    severity: None = None
    short_label: None = None
    reasons: list[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class OutdoorActivitySuggestion(BaseModel):
    id: OutdoorActivitySuggestionId
    family: Literal["outdoor_activity"] = "outdoor_activity"
    category: Literal["outdoor_activity"] = "outdoor_activity"
    priority: SuggestionPriority
    severity: SuggestionSeverity | None = None
    title: str
    short_label: str | None = None
    recommendation: str
    impact: str | None = None
    primary_reason: str
    secondary_reasons: list[str] = Field(default_factory=list)
    reasons: list[str] = Field(default_factory=list)
    advice: str | None = None
    note: str | None = None
    based_on: list[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class IndoorAirSuggestion(BaseModel):
    id: IndoorAirSuggestionId
    family: Literal["indoor_air"] = "indoor_air"
    category: Literal["indoor_air"] = "indoor_air"
    priority: SuggestionPriority
    severity: SuggestionSeverity | None = None
    title: str
    short_label: str | None = None
    recommendation: str
    impact: str | None = None
    primary_reason: str
    secondary_reasons: list[str] = Field(default_factory=list)
    reasons: list[str] = Field(default_factory=list)
    advice: str | None = None
    note: str | None = None
    based_on: list[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class SleepSuggestion(BaseModel):
    id: SleepSuggestionId
    family: Literal["sleep"] = "sleep"
    category: Literal["sleep"] = "sleep"
    priority: SuggestionPriority
    severity: SuggestionSeverity | None = None
    title: str
    short_label: str | None = None
    recommendation: str
    impact: str | None = None
    primary_reason: str
    secondary_reasons: list[str] = Field(default_factory=list)
    reasons: list[str] = Field(default_factory=list)
    advice: str | None = None
    note: str | None = None
    based_on: list[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class TemperatureSuggestion(BaseModel):
    id: TemperatureSuggestionId
    family: Literal["temperature"] = "temperature"
    category: Literal["temperature"] = "temperature"
    priority: SuggestionPriority
    severity: SuggestionSeverity | None = None
    title: str
    short_label: str | None = None
    recommendation: str
    impact: str | None = None
    primary_reason: str
    secondary_reasons: list[str] = Field(default_factory=list)
    reasons: list[str] = Field(default_factory=list)
    advice: str | None = None
    note: str | None = None
    based_on: list[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class RainSuggestion(BaseModel):
    id: RainSuggestionId
    family: Literal["weather"] = "weather"
    category: Literal["weather"] = "weather"
    priority: SuggestionPriority
    severity: SuggestionSeverity | None = None
    title: str
    short_label: str | None = None
    recommendation: str
    impact: str | None = None
    primary_reason: str
    reasons: list[str] = Field(default_factory=list)
    based_on: list[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class UvSuggestion(BaseModel):
    id: UvSuggestionId
    family: Literal["uv"] = "uv"
    category: Literal["uv"] = "uv"
    priority: SuggestionPriority
    severity: SuggestionSeverity | None = None
    title: str
    short_label: str | None = None
    recommendation: str
    impact: str | None = None
    primary_reason: str
    reasons: list[str] = Field(default_factory=list)
    based_on: list[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")
