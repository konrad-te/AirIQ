import hashlib
import secrets
from datetime import datetime, timedelta, timezone

COOKIE_NAME = "airiq_session"
SESSION_TTL_DAYS = 30


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def normalize_email(email: str) -> str:
    return email.strip().lower()


def generate_session_token() -> str:
    return secrets.token_urlsafe(32)


def hash_session_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def hash_password(password: str) -> str: ...


def verify_password(password: str, password_hash: str) -> bool: ...


def create_user_session(db, user, user_agent: str | None, ip_address: str | None):
    raw_token = generate_session_token()
    token_hash = hash_session_token(raw_token)

    session = UserSession(
        user_id=user.id,
        token_hash=token_hash,
        user_agent=user_agent,
        ip_address=ip_address,
        expires_at=utc_now() + timedelta(days=SESSION_TTL_DAYS),
        last_used_at=utc_now(),
    )

    db.add(session)
    db.flush()

    return raw_token, session


def revoke_session(db, raw_token: str) -> None:
    token_hash = hash_session_token(raw_token)
    session = db.query(UserSession).filter(UserSession.token_hash == token_hash).first()
    if session and session.revoked_at is None:
        session.revoked_at = utc_now()
