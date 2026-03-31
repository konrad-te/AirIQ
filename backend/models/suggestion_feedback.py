from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Numeric, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class SuggestionFeedback(Base):
    __tablename__ = "suggestion_feedback"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)

    user_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    vote: Mapped[str] = mapped_column(String(20), nullable=False)
    suggestion_id: Mapped[str] = mapped_column(String(120), nullable=False)
    suggestion_family: Mapped[str | None] = mapped_column(String(80), nullable=True)
    suggestion_category: Mapped[str | None] = mapped_column(String(80), nullable=True)
    suggestion_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    suggestion_short_label: Mapped[str | None] = mapped_column(String(120), nullable=True)
    suggestion_recommendation: Mapped[str | None] = mapped_column(Text, nullable=True)
    suggestion_impact: Mapped[str | None] = mapped_column(Text, nullable=True)
    location_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    lat: Mapped[float | None] = mapped_column(Numeric(9, 6), nullable=True)
    lon: Mapped[float | None] = mapped_column(Numeric(9, 6), nullable=True)
    source_view: Mapped[str | None] = mapped_column(String(80), nullable=True)
    suggestion_payload_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    context_payload_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    settings_payload_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    feedback_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_reviewed: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=text("false"),
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
