from __future__ import annotations

import base64
import hashlib
import os
from datetime import UTC, datetime, timedelta
from random import SystemRandom
from typing import Annotated

from backend.database import get_db
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from backend.models import EmailToken, User, UserSession
from pwdlib import PasswordHash
from sqlalchemy import select
from sqlalchemy import text as sql_text
from sqlalchemy.orm import Session

password_hash = PasswordHash.recommended()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")

DEFAULT_ENTROPY = 32
_sysrand = SystemRandom()


def get_access_token_expire_minutes() -> int:
    raw = os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "10080").strip()
    return int(raw)


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return password_hash.verify(plain_password, hashed_password)


def token_bytes(nbytes: int | None = None) -> bytes:
    if nbytes is None:
        nbytes = DEFAULT_ENTROPY
    return _sysrand.randbytes(nbytes)


def token_urlsafe(nbytes: int | None = None) -> str:
    tok = token_bytes(nbytes)
    return base64.urlsafe_b64encode(tok).rstrip(b"=").decode("ascii")


def hash_session_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


# Tables allowed for serial-style MAX(id)+1 allocation (must match real PG table names).
_RESERVE_NEXT_ID_TABLES: frozenset[str] = frozenset(
    {
        "email_tokens",
        "household_members",
        "households",
        "user_preferences",
        "user_sessions",
        "users",
    }
)


def reserve_next_id(db: Session, table_name: str) -> int:
    if table_name not in _RESERVE_NEXT_ID_TABLES:
        raise ValueError(f"reserve_next_id: disallowed or unknown table {table_name!r}")

    db.execute(
        sql_text("SELECT pg_advisory_xact_lock(hashtext(:table_name))"),
        {"table_name": table_name},
    )
    next_id = db.execute(
        sql_text(f'SELECT COALESCE(MAX(id), 0) + 1 FROM "{table_name}"')
    ).scalar_one()
    return int(next_id)


def create_database_token(
    user_id: int,
    db: Session,
    user_agent: str | None = None,
    ip_address: str | None = None,
) -> str:
    randomized_token = token_urlsafe()
    now = datetime.now(UTC)
    ttl = timedelta(minutes=get_access_token_expire_minutes())

    new_token = UserSession(
        id=reserve_next_id(db, "user_sessions"),
        token_hash=hash_session_token(randomized_token),
        user_id=user_id,
        user_agent=user_agent,
        ip_address=ip_address,
        created_at=now,
        expires_at=now + ttl,
        last_used_at=now,
    )
    db.add(new_token)
    db.commit()
    db.refresh(new_token)
    return randomized_token


def verify_token_access(token_str: str, db: Session) -> UserSession:
    now = datetime.now(UTC)
    hashed_token = hash_session_token(token_str)

    token = (
        db.execute(
            select(UserSession).where(
                UserSession.token_hash == hashed_token,
                UserSession.expires_at >= now,
                UserSession.revoked_at.is_(None),
            )
        )
        .scalars()
        .first()
    )

    if token:
        token.last_used_at = now
        db.commit()
        db.refresh(token)

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalid or expired",
            headers={"WWW-Authenticate": "Bearer"},
    )

    return token


def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Session = Depends(get_db),
) -> User:
    token_row = verify_token_access(token_str=token, db=db)

    user = (
        db.execute(
            select(User).where(
                User.id == token_row.user_id,
                User.is_active.is_(True),
            )
        )
        .scalars()
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User inactive or missing",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


def get_current_token(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Session = Depends(get_db),
) -> UserSession:
    return verify_token_access(token_str=token, db=db)


def authenticate_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Session = Depends(get_db),
) -> None:
    verify_token_access(token_str=token, db=db)
    return


# ── Email tokens (activation / password reset) ──────────────────────────────

EMAIL_TOKEN_TTL = {
    "activation": timedelta(hours=24),
    "password_reset": timedelta(hours=1),
}


def create_email_token(
    user_id: int,
    token_type: str,
    db: Session,
) -> str:
    raw = token_urlsafe()
    now = datetime.now(UTC)
    ttl = EMAIL_TOKEN_TTL[token_type]

    tok = EmailToken(
        id=reserve_next_id(db, "email_tokens"),
        user_id=user_id,
        token_hash=hash_session_token(raw),
        token_type=token_type,
        created_at=now,
        expires_at=now + ttl,
    )
    db.add(tok)
    db.flush()
    return raw


def verify_email_token(
    raw_token: str,
    expected_type: str,
    db: Session,
) -> EmailToken:
    hashed = hash_session_token(raw_token)
    now = datetime.now(UTC)

    tok = (
        db.execute(
            select(EmailToken).where(
                EmailToken.token_hash == hashed,
                EmailToken.token_type == expected_type,
                EmailToken.expires_at >= now,
                EmailToken.used_at.is_(None),
            )
        )
        .scalars()
        .first()
    )

    if not tok:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token is invalid or has expired.",
        )

    tok.used_at = now
    db.flush()
    return tok
