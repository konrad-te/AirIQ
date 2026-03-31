from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class SleepInsightSleepSchema(BaseModel):
    calendar_date: str
    sleep_start_at: datetime | None = None
    sleep_end_at: datetime | None = None
    sleep_duration_minutes: int | None = None
    sleep_deep_minutes: int | None = None
    sleep_light_minutes: int | None = None
    sleep_rem_minutes: int | None = None
    sleep_awake_minutes: int | None = None
    body_battery_gain: int | None = None
    resting_heart_rate: int | None = None
    avg_sleep_respiration: float | None = None


class SleepInsightIndoorSchema(BaseModel):
    available: bool
    source_label: str | None = None
    data_source: str | None = None
    sample_count: int = 0
    coverage_ratio: float | None = None
    window_start_at: datetime | None = None
    window_end_at: datetime | None = None
    average_temperature_c: float | None = None
    min_temperature_c: float | None = None
    max_temperature_c: float | None = None
    average_humidity_pct: float | None = None
    average_pm25_ug_m3: float | None = None
    max_pm25_ug_m3: float | None = None
    average_pm10_ug_m3: float | None = None
    average_co2_ppm: float | None = None
    max_co2_ppm: float | None = None
    minutes_over_1000_co2: int | None = None
    minutes_over_1400_co2: int | None = None


class SleepInsightOutdoorSchema(BaseModel):
    available: bool
    location_label: str | None = None
    matched_time: datetime | None = None
    hours_from_sleep_start: float | None = None
    pm25: float | None = None
    pm10: float | None = None
    temperature_c: float | None = None
    humidity_pct: float | None = None
    confidence: str | None = None
    source_label: str | None = None


class SleepInsightTrainingSchema(BaseModel):
    had_recent_workout: bool
    name: str | None = None
    sport_type: str | None = None
    start_time_gmt: datetime | None = None
    duration_minutes: float | None = None
    calories: float | None = None
    average_heart_rate: float | None = None
    intensity: str | None = None
    hours_before_sleep: float | None = None


class SleepInsightFindingSchema(BaseModel):
    code: str
    severity: Literal["high", "medium", "low", "info"]
    title: str
    detail: str


class SleepInsightActionSchema(BaseModel):
    code: str
    title: str
    detail: str


class SleepInsightExplanationSchema(BaseModel):
    source: Literal["gemini", "rule_based"]
    headline: str
    summary: str
    action_items: list[str] = Field(default_factory=list)
    training_note: str | None = None
    caveats: list[str] = Field(default_factory=list)


class SleepInsightDataQualitySchema(BaseModel):
    sleep_window_available: bool
    indoor_coverage: Literal["missing", "low", "partial", "good"]
    indoor_sample_count: int
    outdoor_available: bool
    training_available: bool


class SleepInsightResponseSchema(BaseModel):
    ok: bool = True
    date: str
    sleep: SleepInsightSleepSchema
    data_quality: SleepInsightDataQualitySchema
    indoor: SleepInsightIndoorSchema
    outdoor: SleepInsightOutdoorSchema
    training_context: SleepInsightTrainingSchema
    findings: list[SleepInsightFindingSchema]
    actions: list[SleepInsightActionSchema]
    explanation: SleepInsightExplanationSchema


class TrainingInsightSportShareSchema(BaseModel):
    label: str
    duration_minutes: float | None = None


class TrainingInsightSessionSchema(BaseModel):
    activity_id: int
    name: str
    sport_label: str | None = None
    duration_minutes: float | None = None
    calories: float | None = None
    average_heart_rate: float | None = None
    start_time_gmt: datetime | None = None
    start_time_local: datetime | None = None


class TrainingInsightDaySchema(BaseModel):
    calendar_date: str
    anchor_date: str
    start_date: str
    end_date: str
    window_mode: Literal["day", "7d"]
    window_label: str
    activity_count: int
    active_day_count: int
    total_duration_minutes: float
    duration_label: str | None = None
    total_calories: float
    weighted_average_heart_rate: float | None = None
    total_distance_km: float | None = None
    primary_sport_label: str | None = None
    top_sports: list[TrainingInsightSportShareSchema] = Field(default_factory=list)
    longest_session: TrainingInsightSessionSchema | None = None
    sessions: list[TrainingInsightSessionSchema] = Field(default_factory=list)
    load_status: Literal["light", "moderate", "heavy", "very_heavy"]


class TrainingInsightBaselineSchema(BaseModel):
    available: bool
    period_count: int
    window_size_days: int
    comparison_label: str | None = None
    average_activity_count: float | None = None
    average_active_day_count: float | None = None
    average_duration_minutes: float | None = None
    average_calories: float | None = None
    average_heart_rate: float | None = None


class TrainingInsightDataQualitySchema(BaseModel):
    session_count: int
    has_heart_rate: bool
    recent_baseline_days: int
    window_mode: Literal["day", "7d"]


class TrainingInsightRecoverySchema(BaseModel):
    recent_sleep_available: bool
    recent_sleep_date: str | None = None
    sleep_status: Literal["good", "mixed", "poor", "unknown"]
    sleep_label: str
    sleep_duration_minutes: int | None = None
    sleep_duration_label: str | None = None
    body_battery_gain: int | None = None
    deep_sleep_pct: float | None = None
    rem_sleep_pct: float | None = None
    yesterday_had_training: bool
    yesterday_was_rest_day: bool
    yesterday_load_status: Literal["rest", "light", "moderate", "heavy", "very_heavy"]
    training_streak_days: int
    heavy_training_days: int
    very_heavy_training_days: int
    recommendation_level: Literal["go", "easy", "rest"]
    recommendation_title: str
    recommendation_detail: str


class TrainingInsightResponseSchema(BaseModel):
    ok: bool = True
    date: str
    day: TrainingInsightDaySchema
    recent_baseline: TrainingInsightBaselineSchema
    recovery: TrainingInsightRecoverySchema
    data_quality: TrainingInsightDataQualitySchema
    findings: list[SleepInsightFindingSchema]
    actions: list[SleepInsightActionSchema]
    explanation: SleepInsightExplanationSchema
