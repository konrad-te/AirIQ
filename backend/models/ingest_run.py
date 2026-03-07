from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class IngestRun(Base):
    __tablename__ = "ingest_runs"
    __table_args__ = (
        CheckConstraint(
            "status IN ('running','success','failed','partial')",
            name="ck_ingest_runs_status",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    provider_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("data_providers.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    job_name: Mapped[str] = mapped_column(String(64), nullable=False, server_default="globe_ingest_hourly")
    triggered_by: Mapped[str] = mapped_column(String(16), nullable=False, server_default="scheduler")
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    total_points: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    success_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    fail_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
