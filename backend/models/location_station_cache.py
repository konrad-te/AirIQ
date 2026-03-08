from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class LocationStationCache(Base):
    __tablename__ = "location_station_cache"
    __table_args__ = (
        UniqueConstraint(
            "provider_id",
            "coord_key",
            name="uq_location_station_cache_provider_coord_key",
        ),
        CheckConstraint(
            "distance_km IS NULL OR distance_km >= 0",
            name="ck_location_station_cache_distance_nonnegative",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)

    provider_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("data_providers.id"),
        nullable=False,
    )

    coord_key: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
    )

    lat_rounded: Mapped[Decimal] = mapped_column(
        Numeric(8, 3),
        nullable=False,
    )

    lon_rounded: Mapped[Decimal] = mapped_column(
        Numeric(8, 3),
        nullable=False,
    )

    external_station_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("external_stations.id"),
        nullable=True,
    )

    distance_km: Mapped[Decimal | None] = mapped_column(
        Numeric(8, 3),
        nullable=True,
    )

    cached_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    hit_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default="0",
    )