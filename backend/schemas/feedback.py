from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class FeedbackCreateSchema(BaseModel):
    category: str = Field(max_length=40)
    message: str = Field(min_length=1, max_length=2000)


class FeedbackOutSchema(BaseModel):
    id: int
    user_id: int | None
    user_email: str
    user_display_name: str | None
    category: str
    message: str
    is_read: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
