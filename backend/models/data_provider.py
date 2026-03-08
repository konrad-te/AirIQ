from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    Integer,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class DataProvider(Base):
    __tablename__ = "data_providers"
    __table_args__ = (
        CheckConstraint(
            "auth_type IN ('none','api_key')",
            name="ck_data_providers_auth_type",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)

    provider_code: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        unique=True,
    )

    display_name: Mapped[str] = mapped_column(
        String(80),
        nullable=False,
    )

    base_url: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    auth_type: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        server_default="none",
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=text("true"),
    )

    default_timeout_ms: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default="10000",
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