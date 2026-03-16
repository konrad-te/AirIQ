from __future__ import annotations

import base64
import hashlib
import os
from datetime import UTC, datetime, timedelta
from random import SystemRandom
from typing import Annotated

from database import get_db
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from models import User, UserSession
from pwdlib import PasswordHash
from sqlalchemy import select
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


def create_database_token(
    user_id: int,
    db: Session,
    user_agent: str | None = None,
    ip_address: str | None = None,
) -> str:
    raw_token = token_urlsafe()
    expires_at = utc_now() + timedelta(minutes=get_access_token_expire_minutes())

    session = UserSession(
        user_id=user_id,
        token_hash=hash_token(raw_token),
        expires_at=expires_at,
        last_used_at=None,
        revoked_at=None,
        user_agent=user_agent,
        ip_address=ip_address,
    )
    db.add(session)
    db.commit()
    return raw_token


def verify_token_access(token_str: str, db: Session) -> UserSession:
    token_hash = hash_token(token_str)
    now = utc_now()

    session = (
        db.execute(
            select(UserSession).where(
                UserSession.token_hash == token_hash,
                UserSession.revoked_at.is_(None),
                UserSession.expires_at > now,
            )
        )
        .scalars()
        .first()
    )

    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalid or expired",
            headers={"WWW-Authenticate": "Bearer"},
        )

    session.last_used_at = now
    db.commit()
    return session


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


def utc_now() -> datetime:
    return datetime.now(UTC)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
