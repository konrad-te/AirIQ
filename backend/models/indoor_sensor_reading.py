from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Numeric,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class IndoorSensorReading(Base):
    __tablename__ = "indoor_sensor_readings"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "provider",
            "provider_device_key",
            "recorded_at",
            name="uq_indoor_sensor_readings_user_provider_device_time",
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
    )

    provider_device_key: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    source_type: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        server_default="indoor_sensor",
    )

    device_name: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    product_name: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    serial_number: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    wifi_mac: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
    )

    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    temperature_c: Mapped[float | None] = mapped_column(Numeric(8, 2), nullable=True)
    humidity_pct: Mapped[float | None] = mapped_column(Numeric(8, 2), nullable=True)
    pm25_ug_m3: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    pm10_ug_m3: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    co2_ppm: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    battery_pct: Mapped[float | None] = mapped_column(Numeric(8, 2), nullable=True)

    raw_payload_json: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB,
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
