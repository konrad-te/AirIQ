from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class UserPreference(Base):
    __tablename__ = "user_preferences"
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_user_preferences_user_id"),
        CheckConstraint(
            "theme IN ('light','dark')",
            name="ck_user_preferences_theme",
        ),
        CheckConstraint(
            "discord_outlook_local_hour >= 0 AND discord_outlook_local_hour <= 23",
            name="ck_user_preferences_discord_outlook_local_hour",
        ),
        CheckConstraint(
            "discord_outlook_local_minute >= 0 AND discord_outlook_local_minute <= 59",
            name="ck_user_preferences_discord_outlook_local_minute",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)

    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id"),
        nullable=False,
    )

    theme: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        server_default="light",
    )

    language_code: Mapped[str | None] = mapped_column(
        String(10),
        nullable=True,
    )

    timezone: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
    )

    allow_gemini_health_insights: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default="false",
    )

    discord_morning_outlook_enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default="false",
    )

    discord_outlook_webhook_encrypted: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    discord_outlook_last_sent_on: Mapped[str | None] = mapped_column(
        String(10),
        nullable=True,
    )

    discord_outlook_local_hour: Mapped[int] = mapped_column(
        SmallInteger,
        nullable=False,
        server_default="7",
    )

    discord_outlook_local_minute: Mapped[int] = mapped_column(
        SmallInteger,
        nullable=False,
        server_default="0",
    )

    discord_indoor_alerts_enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default="false",
    )

    discord_indoor_include_medium_priority: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default="false",
    )

    discord_indoor_last_alert_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    discord_indoor_last_alert_hash: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
    )

    pm25_medium_threshold: Mapped[float | None] = mapped_column(
        Float, nullable=True,
    )
    pm25_high_threshold: Mapped[float | None] = mapped_column(
        Float, nullable=True,
    )
    pm25_critical_threshold: Mapped[float | None] = mapped_column(
        Float, nullable=True,
    )
    pm10_medium_threshold: Mapped[float | None] = mapped_column(
        Float, nullable=True,
    )
    pm10_high_threshold: Mapped[float | None] = mapped_column(
        Float, nullable=True,
    )
    pm10_critical_threshold: Mapped[float | None] = mapped_column(
        Float, nullable=True,
    )

    outdoor_temp_high_c: Mapped[float | None] = mapped_column(Float, nullable=True)
    uv_high_threshold: Mapped[float | None] = mapped_column(Float, nullable=True)
    indoor_co2_medium_ppm: Mapped[float | None] = mapped_column(Float, nullable=True)
    indoor_co2_high_ppm: Mapped[float | None] = mapped_column(Float, nullable=True)
    indoor_humidity_low_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    indoor_humidity_high_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    indoor_temp_hot_c: Mapped[float | None] = mapped_column(Float, nullable=True)
    indoor_temp_cold_c: Mapped[float | None] = mapped_column(Float, nullable=True)

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
