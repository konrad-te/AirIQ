from __future__ import annotations

from datetime import datetime
<<<<<<< HEAD
=======
from decimal import Decimal
>>>>>>> database-implementation-2

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
<<<<<<< HEAD
    Numeric,
    Integer,
=======
    Integer,
    Numeric,
>>>>>>> database-implementation-2
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class LocationStationCache(Base):
    __tablename__ = "location_station_cache"
    __table_args__ = (
<<<<<<< HEAD
        CheckConstraint("lat_rounded BETWEEN -90 AND 90", name="ck_location_station_cache_lat_range"),
        CheckConstraint("lon_rounded BETWEEN -180 AND 180", name="ck_location_station_cache_lon_range"),
        CheckConstraint(
            "distance_km IS NULL OR distance_km >= 0",
            name="ck_location_station_cache_distance_non_negative",
        ),
        CheckConstraint("hit_count >= 0", name="ck_location_station_cache_hit_count"),
        UniqueConstraint("provider_id", "coord_key", name="uq_location_station_cache_provider_coord"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    provider_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("data_providers.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    coord_key: Mapped[str] = mapped_column(String(32), nullable=False)
    lat_rounded: Mapped[float] = mapped_column(Numeric(8, 3), nullable=False)
    lon_rounded: Mapped[float] = mapped_column(Numeric(8, 3), nullable=False)
    external_station_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("external_stations.id", ondelete="SET NULL"),
        nullable=True,
    )
    distance_km: Mapped[float | None] = mapped_column(Numeric(8, 3), nullable=True)
=======
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

>>>>>>> database-implementation-2
    cached_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
<<<<<<< HEAD
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    hit_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
=======

    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    hit_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default="0",
    )
>>>>>>> database-implementation-2
