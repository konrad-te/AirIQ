from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class GlobeAqCache(Base):
    __tablename__ = "globe_aq_cache"
    __table_args__ = (
        CheckConstraint("pm25 >= 0", name="ck_globe_aq_cache_pm25_non_negative"),
        CheckConstraint("pm10 >= 0", name="ck_globe_aq_cache_pm10_non_negative"),
        CheckConstraint("us_aqi BETWEEN 0 AND 500", name="ck_globe_aq_cache_us_aqi_range"),
        CheckConstraint("eu_aqi >= 0", name="ck_globe_aq_cache_eu_aqi_non_negative"),
        CheckConstraint(
            "band IN ('0-10','10-20','20-25','25-50','50-75','75+')",
            name="ck_globe_aq_cache_band_values",
        ),
    )

    city_point_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("city_points.id", ondelete="CASCADE"),
        primary_key=True,
    )
    provider_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("data_providers.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    pm25: Mapped[float | None] = mapped_column(Numeric(8, 2), nullable=True)
    pm10: Mapped[float | None] = mapped_column(Numeric(8, 2), nullable=True)
    us_aqi: Mapped[int | None] = mapped_column(Integer, nullable=True)
    eu_aqi: Mapped[int | None] = mapped_column(Integer, nullable=True)
    band: Mapped[str | None] = mapped_column(String(16), nullable=True)
    observed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    stale: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    payload_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
