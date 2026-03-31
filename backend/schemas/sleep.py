from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class SleepImportFileResultSchema(BaseModel):
    file_name: str
    imported: int
    updated: int
    skipped: int


class SleepImportResponseSchema(BaseModel):
    ok: bool
    provider: str
    message: str
    imported: int
    updated: int
    skipped: int
    files: list[SleepImportFileResultSchema]


class SleepHistoryPointSchema(BaseModel):
    time: datetime
    calendar_date: str
    sample_count: int
    indoor_sample_count: int = 0
    has_indoor_sensor_data: bool = False
    sleep_start_at: datetime | None = None
    sleep_end_at: datetime | None = None
    sleep_duration_minutes: int | None = None
    sleep_deep_minutes: int | None = None
    sleep_light_minutes: int | None = None
    sleep_rem_minutes: int | None = None
    sleep_awake_minutes: int | None = None
    sleep_unmeasurable_minutes: int | None = None
    sleep_window_confirmation_type: str | None = None
    sleep_stress_avg: float | None = None
    body_battery_gain: int | None = None
    resting_heart_rate: int | None = None
    avg_waking_respiration: float | None = None
    avg_sleep_respiration: float | None = None
    lowest_sleep_respiration: float | None = None
    highest_sleep_respiration: float | None = None
    sleep_start_local_minutes: int | None = None
    sleep_end_local_minutes: int | None = None


class SleepHistoryResponseSchema(BaseModel):
    range: str
    bucket_days: int
    source_label: str
    last_calendar_date: str | None = None
    latest_imported_at: datetime | None = None
    points: list[SleepHistoryPointSchema]
