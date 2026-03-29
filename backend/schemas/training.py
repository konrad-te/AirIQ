from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class TrainingImportFileResultSchema(BaseModel):
    file_name: str
    imported: int
    updated: int
    skipped: int


class TrainingImportResponseSchema(BaseModel):
    ok: bool
    provider: str
    message: str
    imported: int
    updated: int
    skipped: int
    files: list[TrainingImportFileResultSchema]


class TrainingSportSummarySchema(BaseModel):
    sport_key: str
    label: str
    activity_count: int
    total_duration_hours: float
    total_calories: float


class TrainingActivitySummarySchema(BaseModel):
    activity_id: int
    name: str
    activity_type: str | None = None
    sport_type: str | None = None
    location_name: str | None = None
    start_time_gmt: datetime | None = None
    start_time_local: datetime | None = None
    duration_minutes: float | None = None
    elapsed_duration_minutes: float | None = None
    moving_duration_minutes: float | None = None
    calories: float | None = None
    average_heart_rate: float | None = None
    max_heart_rate: float | None = None
    min_heart_rate: float | None = None
    distance_km: float | None = None


class TrainingHistoryResponseSchema(BaseModel):
    range: str
    source_label: str
    latest_activity_at: datetime | None = None
    latest_imported_at: datetime | None = None
    total_activities: int
    total_duration_hours: float
    total_moving_hours: float
    total_calories: float
    weighted_average_heart_rate: float | None = None
    latest_activity_at: datetime | None = None
    sport_breakdown: list[TrainingSportSummarySchema]
    activities: list[TrainingActivitySummarySchema]
