from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    String,
    UniqueConstraint,
    func,
<<<<<<< HEAD
=======
    text,
>>>>>>> database-implementation-2
)
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class HouseholdMember(Base):
    __tablename__ = "household_members"
    __table_args__ = (
<<<<<<< HEAD
        UniqueConstraint("household_id", "user_id", name="uq_household_members_household_user"),
=======
        UniqueConstraint(
            "household_id",
            "user_id",
            name="uq_household_members_household_user",
        ),
>>>>>>> database-implementation-2
        CheckConstraint(
            "role IN ('owner','admin','member','viewer')",
            name="ck_household_members_role",
        ),
    )

<<<<<<< HEAD
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    household_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("households.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    role: Mapped[str] = mapped_column(String(24), nullable=False, server_default="member")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
=======
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)

    household_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("households.id"),
        nullable=False,
    )

    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id"),
        nullable=False,
    )

    role: Mapped[str] = mapped_column(
        String(24),
        nullable=False,
        server_default="member",
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=text("true"),
    )

>>>>>>> database-implementation-2
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
<<<<<<< HEAD
    invited_by_user_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
=======

    invited_by_user_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("users.id"),
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
