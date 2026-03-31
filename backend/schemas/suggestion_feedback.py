from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class SuggestionFeedbackCreateSchema(BaseModel):
    vote: Literal["helpful", "not_helpful"]
    suggestion: dict[str, Any]
    context: dict[str, Any] | None = None
    settings: dict[str, Any] | None = None
    feedback_text: str | None = Field(default=None, max_length=2000)
    location_label: str | None = Field(default=None, max_length=255)
    lat: float | None = None
    lon: float | None = None
    source_view: str | None = Field(default="dashboard", max_length=80)


class SuggestionFeedbackOutSchema(BaseModel):
    id: int
    user_id: int | None
    user_email: str
    user_display_name: str | None
    vote: str
    suggestion_id: str
    suggestion_family: str | None
    suggestion_category: str | None
    suggestion_title: str | None
    suggestion_short_label: str | None
    suggestion_recommendation: str | None
    suggestion_impact: str | None
    location_label: str | None
    lat: float | None
    lon: float | None
    source_view: str | None
    suggestion_payload_json: dict[str, Any] | None
    context_payload_json: dict[str, Any] | None
    settings_payload_json: dict[str, Any] | None
    feedback_text: str | None
    is_reviewed: bool
    created_at: datetime
