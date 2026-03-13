from __future__ import annotations

import base64
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


def create_database_token(user_id: int, db: Session) -> UserSession:
    randomized_token = token_urlsafe()
    new_token = UserSession(
        token=randomized_token,
        user_id=user_id,
    )
    db.add(new_token)
    db.commit()
    db.refresh(new_token)
    return new_token


def verify_token_access(token_str: str, db: Session) -> UserSession:
    max_age = timedelta(minutes=get_access_token_expire_minutes())
    cutoff = datetime.now(UTC) - max_age

    token = (
        db.execute(
            select(UserSession).where(
                UserSession.token == token_str,
                UserSession.created_at >= cutoff,
            )
        )
        .scalars()
        .first()
    )

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
