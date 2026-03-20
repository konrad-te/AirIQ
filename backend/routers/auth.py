from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from backend.database import get_db
from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from backend.models import Household, HouseholdMember, User, UserPreference, UserSession
from backend.schemas.auth import (
    PasswordChangeSchema,
    TokenSchema,
    UserOutSchema,
    UserPreferenceOutSchema,
    UserPreferenceUpdateSchema,
    UserRegisterSchema,
    UserUpdateSchema,
)
from backend.security import (
    create_database_token,
    get_current_token,
    get_current_user,
    hash_password,
    verify_password,
)
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/auth", tags=["auth"])


def build_default_household_name(user: User) -> str:
    if user.display_name:
        return f"{user.display_name}'s Home"
    local = user.email.split("@")[0]
    return f"{local}'s Home"


def build_default_household_slug(user: User) -> str:
    local = user.email.split("@")[0].strip().lower()
    safe = "".join(ch if ch.isalnum() or ch == "-" else "-" for ch in local)
    safe = "-".join(part for part in safe.split("-") if part)[:120] or "home"
    return f"{safe}-{user.id}"


@router.post(
    "/user/create", response_model=UserOutSchema, status_code=status.HTTP_201_CREATED
)
def register_user(
    user: UserRegisterSchema,
    db: Session = Depends(get_db),
) -> User:
    hashed_password = hash_password(user.password)

    try:
        new_user = User(
            email=user.email.strip().lower(),
            display_name=user.display_name.strip() if user.display_name else None,
            password_hash=hashed_password,
        )
        db.add(new_user)
        db.flush()

        db.add(UserPreference(user_id=new_user.id))

        household = Household(
            owner_user_id=new_user.id,
            name=build_default_household_name(new_user),
            slug=build_default_household_slug(new_user),
        )
        db.add(household)
        db.flush()

        db.add(
            HouseholdMember(
                household_id=household.id,
                user_id=new_user.id,
                role="owner",
                is_active=True,
            )
        )

        db.commit()
        db.refresh(new_user)
        return new_user

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User already exists",
        )


@router.post("/token", response_model=TokenSchema)
def login(
    response: Response,
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: Session = Depends(get_db),
) -> TokenSchema:
    user = (
        db.execute(select(User).where(User.email == form_data.username.strip().lower()))
        .scalars()
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User does not exist",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is inactive",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user.last_login_at = datetime.now(UTC)
    access_token = create_database_token(user_id=user.id, db=db)

    return {
        "access_token": access_token,
        "token_type": "bearer",
    }


@router.delete("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    current_token: UserSession = Depends(get_current_token),
    db: Session = Depends(get_db),
) -> Response:
    current_token.revoked_at = datetime.now(UTC)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=UserOutSchema)
def read_users_me(
    current_user: User = Depends(get_current_user),
) -> User:
    return current_user


@router.get("/sessions")
def list_my_sessions(
    current_token: UserSession = Depends(get_current_token),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    sessions = (
        db.execute(
            select(UserSession)
            .where(UserSession.user_id == current_user.id)
            .order_by(UserSession.created_at.desc())
        )
        .scalars()
        .all()
    )

    return {
        "count": len(sessions),
        "sessions": [
            {
                "id": s.id,
                "created_at": s.created_at,
                "expires_at": s.expires_at,
                "last_used_at": s.last_used_at,
                "revoked_at": s.revoked_at,
                "user_agent": s.user_agent,
                "ip_address": s.ip_address,
                "is_active": s.revoked_at is None,
                "is_current": s.id == current_token.id,
            }
            for s in sessions
        ],
    }


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_session(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    session = (
        db.execute(
            select(UserSession).where(
                UserSession.id == session_id,
                UserSession.user_id == current_user.id,
            )
        )
        .scalars()
        .first()
    )

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session.revoked_at = datetime.now(UTC)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/sessions", status_code=status.HTTP_204_NO_CONTENT)
def revoke_other_sessions(
    current_token: UserSession = Depends(get_current_token),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    now = datetime.now(UTC)

    sessions = (
        db.execute(
            select(UserSession).where(
                UserSession.user_id == current_user.id,
                UserSession.id != current_token.id,
                UserSession.revoked_at.is_(None),
            )
        )
        .scalars()
        .all()
    )

    for session in sessions:
        session.revoked_at = now

    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Account deletion ─────────────────────────────────────────────────────────

@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    current_token: UserSession = Depends(get_current_token),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    now = datetime.now(UTC)
    sessions = (
        db.execute(
            select(UserSession).where(
                UserSession.user_id == current_user.id,
                UserSession.revoked_at.is_(None),
            )
        )
        .scalars()
        .all()
    )
    for session in sessions:
        session.revoked_at = now

    current_user.is_active = False
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Profile ──────────────────────────────────────────────────────────────────

@router.patch("/me", response_model=UserOutSchema)
def update_profile(
    update: UserUpdateSchema,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    if update.display_name is not None:
        stripped = update.display_name.strip()
        current_user.display_name = stripped if stripped else None
    if update.email is not None:
        normalised = update.email.strip().lower()
        if normalised == current_user.email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="New email must be different from the current email.",
            )
        existing = db.execute(select(User).where(User.email == normalised)).scalars().first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="That email is already in use.",
            )
        current_user.email = normalised
    db.commit()
    db.refresh(current_user)
    return current_user


# ── Preferences ───────────────────────────────────────────────────────────────

@router.get("/preferences", response_model=UserPreferenceOutSchema)
def get_preferences(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserPreference:
    pref = (
        db.execute(select(UserPreference).where(UserPreference.user_id == current_user.id))
        .scalars()
        .first()
    )
    if not pref:
        pref = UserPreference(user_id=current_user.id)
        db.add(pref)
        db.commit()
        db.refresh(pref)
    return pref


@router.patch("/preferences", response_model=UserPreferenceOutSchema)
def update_preferences(
    update: UserPreferenceUpdateSchema,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserPreference:
    pref = (
        db.execute(select(UserPreference).where(UserPreference.user_id == current_user.id))
        .scalars()
        .first()
    )
    if not pref:
        pref = UserPreference(user_id=current_user.id)
        db.add(pref)
        db.flush()

    set_fields = update.model_fields_set
    if "theme" in set_fields and update.theme is not None:
        pref.theme = update.theme
    if "language_code" in set_fields:
        pref.language_code = update.language_code
    if "timezone" in set_fields:
        pref.timezone = update.timezone

    db.commit()
    db.refresh(pref)
    return pref


# ── Password ──────────────────────────────────────────────────────────────────

@router.patch("/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    data: PasswordChangeSchema,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    if not verify_password(data.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect.",
        )
    if verify_password(data.new_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from the current password.",
        )
    current_user.password_hash = hash_password(data.new_password)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
