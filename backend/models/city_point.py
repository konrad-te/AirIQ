from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    Numeric,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class CityPoint(Base):
    __tablename__ = "city_points"
    __table_args__ = (
        UniqueConstraint(
            "country_name",
            "city_name",
            name="uq_city_points_country_city",
        ),
        CheckConstraint("lat BETWEEN -90 AND 90", name="ck_city_points_lat_range"),
        CheckConstraint("lon BETWEEN -180 AND 180", name="ck_city_points_lon_range"),
        CheckConstraint(
            "population IS NULL OR population >= 0",
            name="ck_city_points_population_nonnegative",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)

    country_code: Mapped[str | None] = mapped_column(String(2), nullable=True)
    country_name: Mapped[str] = mapped_column(String(120), nullable=False)
    city_name: Mapped[str] = mapped_column(String(120), nullable=False)

    lat: Mapped[Decimal] = mapped_column(Numeric(9, 6), nullable=False)
    lon: Mapped[Decimal] = mapped_column(Numeric(9, 6), nullable=False)

    population: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    is_capital: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default="false",
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default="true",
        index=True,
    )

    source_dataset: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        server_default="geonames_restcountries",
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