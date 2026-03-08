from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    BigInteger,
<<<<<<< HEAD
    CheckConstraint,
    DateTime,
    Boolean,
    String,
    Integer,
    Text,
    func,
=======
    Boolean,
    CheckConstraint,
    DateTime,
    Integer,
    String,
    Text,
    func,
    text,
>>>>>>> database-implementation-2
)
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class DataProvider(Base):
    __tablename__ = "data_providers"
    __table_args__ = (
<<<<<<< HEAD
        CheckConstraint("provider_code <> ''", name="ck_data_providers_provider_code_not_empty"),
        CheckConstraint("display_name <> ''", name="ck_data_providers_display_name_not_empty"),
        CheckConstraint("base_url <> ''", name="ck_data_providers_base_url_not_empty"),
=======
>>>>>>> database-implementation-2
        CheckConstraint(
            "auth_type IN ('none','api_key')",
            name="ck_data_providers_auth_type",
        ),
<<<<<<< HEAD
        CheckConstraint("default_timeout_ms > 0", name="ck_data_providers_default_timeout_pos"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    provider_code: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    display_name: Mapped[str] = mapped_column(String(80), nullable=False)
    base_url: Mapped[str] = mapped_column(Text, nullable=False)
    auth_type: Mapped[str] = mapped_column(String(16), nullable=False, server_default="none")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    default_timeout_ms: Mapped[int] = mapped_column(Integer, nullable=False, server_default="10000")
=======
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
