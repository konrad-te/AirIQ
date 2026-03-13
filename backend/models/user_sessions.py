from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class UserSession(Base):
    __tablename__ = "user_sessions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)

    token: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        unique=True,
        index=True,
    )

    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
