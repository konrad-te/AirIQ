from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    func,
    ForeignKey,
    Numeric,
    String,
    Integer,
    Text,
    UniqueConstraint,
)
from sqlalchemy import CHAR
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class GeocodeCacheEntry(Base):
    __tablename__ = "geocode_cache_entries"
    __table_args__ = (
        CheckConstraint("lat BETWEEN -90 AND 90", name="ck_geocode_cache_entries_lat_range"),
        CheckConstraint("lon BETWEEN -180 AND 180", name="ck_geocode_cache_entries_lon_range"),
        CheckConstraint("use_count >= 0", name="ck_geocode_cache_entries_use_count"),
        UniqueConstraint("provider_id", "query_hash", name="uq_geocode_cache_entries_provider_query"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    provider_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("data_providers.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    query_hash: Mapped[str] = mapped_column(CHAR(16), nullable=False)
    query_text: Mapped[str] = mapped_column(Text, nullable=False)
    normalized_query: Mapped[str] = mapped_column(Text, nullable=False)
    lat: Mapped[float] = mapped_column(Numeric(9, 6), nullable=False)
    lon: Mapped[float] = mapped_column(Numeric(9, 6), nullable=False)
    display_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    external_place_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    cached_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    use_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
