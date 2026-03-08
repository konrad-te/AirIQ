from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Numeric,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class ExternalStation(Base):
    __tablename__ = "external_stations"
    __table_args__ = (
        UniqueConstraint(
            "provider_id",
            "provider_station_id",
            name="uq_external_stations_provider_station",
        ),
        CheckConstraint(
            "lat IS NULL OR lat BETWEEN -90 AND 90",
            name="ck_external_stations_lat_range",
        ),
        CheckConstraint(
            "lon IS NULL OR lon BETWEEN -180 AND 180",
            name="ck_external_stations_lon_range",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)

    provider_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("data_providers.id"),
        nullable=False,
    )

    provider_station_id: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
    )

    station_name: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
    )

    country_code: Mapped[str | None] = mapped_column(
        String(2),
        nullable=True,
    )

    city_name: Mapped[str | None] = mapped_column(
        String(120),
        nullable=True,
    )

    lat: Mapped[float | None] = mapped_column(Numeric(9, 6), nullable=True)
    lon: Mapped[float | None] = mapped_column(Numeric(9, 6), nullable=True)

    timezone: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
    )

    is_mobile: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=text("false"),
    )

    is_monitor: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=text("true"),
    )

    first_seen_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    last_seen_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    metadata_json: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB,
        nullable=True,
    )

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
