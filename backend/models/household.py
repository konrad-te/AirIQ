from __future__ import annotations

from datetime import datetime

<<<<<<< HEAD
from sqlalchemy import BigInteger, Boolean, CHAR, DateTime, ForeignKey, String, CheckConstraint, func
=======
from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    String,
    func,
    text,
)
>>>>>>> database-implementation-2
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class Household(Base):
    __tablename__ = "households"
<<<<<<< HEAD
    __table_args__ = (
        CheckConstraint("timezone <> ''", name="ck_households_timezone_not_empty"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    slug: Mapped[str] = mapped_column(String(180), nullable=False, unique=True, index=True)
    owner_user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, server_default="UTC")
    country_code: Mapped[str | None] = mapped_column(CHAR(2), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
=======

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)

    slug: Mapped[str] = mapped_column(
        String(180),
        nullable=False,
        unique=True,
    )

    owner_user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id"),
        nullable=False,
    )

    name: Mapped[str] = mapped_column(
        String(160),
        nullable=False,
    )

    timezone: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        server_default="UTC",
    )

    country_code: Mapped[str | None] = mapped_column(
        String(2),
        nullable=True,
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=text("true"),
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
