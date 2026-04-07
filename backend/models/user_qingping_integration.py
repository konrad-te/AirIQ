from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class UserQingpingIntegration(Base):
    __tablename__ = "user_qingping_integrations"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)

    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )

    provider: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="qingping",
        server_default="qingping",
    )

    app_key: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    app_secret: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    access_token: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    selected_device_id: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    selected_device_name: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    selected_product_name: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    selected_serial_number: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    selected_wifi_mac: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
    )

    token_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="connected",
        server_default="connected",
    )

    last_validated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    last_synced_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
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
