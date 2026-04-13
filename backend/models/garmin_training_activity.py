from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, DateTime, ForeignKey, Numeric, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class GarminTrainingActivity(Base):
    __tablename__ = "garmin_training_activities"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "provider",
            "activity_id",
            name="uq_garmin_training_activities_user_provider_activity",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    provider: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="garmin",
        server_default="garmin",
    )
    activity_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    external_uuid: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source_file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    activity_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    sport_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    location_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    start_time_gmt: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    start_time_local: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_minutes: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    elapsed_duration_minutes: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    moving_duration_minutes: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    calories: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    average_heart_rate: Mapped[float | None] = mapped_column(Numeric(8, 2), nullable=True)
    max_heart_rate: Mapped[float | None] = mapped_column(Numeric(8, 2), nullable=True)
    min_heart_rate: Mapped[float | None] = mapped_column(Numeric(8, 2), nullable=True)
    distance_km: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)

    raw_payload_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
