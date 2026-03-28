from __future__ import annotations

from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class GarminSleepSummary(Base):
    __tablename__ = "garmin_sleep_summaries"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "calendar_date",
            name="uq_garmin_sleep_summaries_user_calendar_date",
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

    calendar_date: Mapped[date] = mapped_column(Date, nullable=False)
    external_uuid: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source_file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    wellness_start_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    wellness_end_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    sleep_start_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    sleep_end_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    sleep_start_local_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sleep_end_local_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sleep_duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sleep_deep_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sleep_light_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sleep_rem_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sleep_awake_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sleep_unmeasurable_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sleep_window_confirmation_type: Mapped[str | None] = mapped_column(String(64), nullable=True)

    sleep_stress_avg: Mapped[float | None] = mapped_column(Numeric(8, 2), nullable=True)
    sleep_stress_max: Mapped[int | None] = mapped_column(Integer, nullable=True)

    body_battery_start: Mapped[int | None] = mapped_column(Integer, nullable=True)
    body_battery_end: Mapped[int | None] = mapped_column(Integer, nullable=True)
    body_battery_gain: Mapped[int | None] = mapped_column(Integer, nullable=True)

    resting_heart_rate: Mapped[int | None] = mapped_column(Integer, nullable=True)
    min_heart_rate: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_heart_rate: Mapped[int | None] = mapped_column(Integer, nullable=True)
    avg_waking_respiration: Mapped[float | None] = mapped_column(
        Numeric(8, 2),
        nullable=True,
    )
    avg_sleep_respiration: Mapped[float | None] = mapped_column(
        Numeric(8, 2),
        nullable=True,
    )
    lowest_sleep_respiration: Mapped[float | None] = mapped_column(
        Numeric(8, 2),
        nullable=True,
    )
    highest_sleep_respiration: Mapped[float | None] = mapped_column(
        Numeric(8, 2),
        nullable=True,
    )

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
