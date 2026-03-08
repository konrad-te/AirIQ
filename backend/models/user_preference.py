from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class UserPreference(Base):
    __tablename__ = "user_preferences"
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_user_preferences_user_id"),
<<<<<<< HEAD
        CheckConstraint("theme IN ('light','dark')", name="ck_user_preferences_theme"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        unique=True,
        index=True,
    )
    theme: Mapped[str] = mapped_column(String(16), nullable=False, server_default="light")
    language_code: Mapped[str | None] = mapped_column(String(10), nullable=True)
    timezone: Mapped[str | None] = mapped_column(String(64), nullable=True)
=======
        CheckConstraint(
            "theme IN ('light','dark')",
            name="ck_user_preferences_theme",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)

    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id"),
        nullable=False,
    )

    theme: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        server_default="light",
    )

    language_code: Mapped[str | None] = mapped_column(
        String(10),
        nullable=True,
    )

    timezone: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
    )

>>>>>>> database-implementation-2
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
<<<<<<< HEAD
=======

>>>>>>> database-implementation-2
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
<<<<<<< HEAD
    )
=======
    )
>>>>>>> database-implementation-2
