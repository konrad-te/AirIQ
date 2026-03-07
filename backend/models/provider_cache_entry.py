from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class ProviderCacheEntry(Base):
    __tablename__ = "provider_cache_entries"
    __table_args__ = (
        CheckConstraint(
            "cache_kind IN ('aq_normalized','weather','station_lookup')",
            name="ck_provider_cache_entries_kind",
        ),
        CheckConstraint(
            "(method IS NULL) OR method IN ('point','nearest_station','model','batch_ingest')",
            name="ck_provider_cache_entries_method",
        ),
        CheckConstraint("hit_count >= 0", name="ck_provider_cache_entries_hit_count"),
        UniqueConstraint("provider_id", "cache_key", name="uq_provider_cache_entries_provider_key"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    provider_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("data_providers.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    cache_key: Mapped[str] = mapped_column(String(200), nullable=False)
    cache_kind: Mapped[str] = mapped_column(String(32), nullable=False)
    method: Mapped[str | None] = mapped_column(String(32), nullable=True)
    coord_key: Mapped[str | None] = mapped_column(String(32), nullable=True)
    external_station_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("external_stations.id", ondelete="SET NULL"),
        nullable=True,
    )
    variant_key: Mapped[str | None] = mapped_column(String(80), nullable=True)
    payload_json: Mapped[dict] = mapped_column(JSONB, nullable=False)
    cached_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    hit_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
