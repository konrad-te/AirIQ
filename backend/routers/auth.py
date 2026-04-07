from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from backend.database import get_db
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
from backend.models import EmailToken, Household, HouseholdMember, SavedLocation, User, UserPreference, UserSession
from backend.schemas.auth import (
    DeleteAccountSchema,
    ForgotPasswordSchema,
    PasswordChangeSchema,
    ResetPasswordSchema,
    SavedLocationCreateSchema,
    SavedLocationOutSchema,
    TokenSchema,
    UserRegisterResponseSchema,
    UserOutSchema,
    UserPreferenceOutSchema,
    UserPreferenceUpdateSchema,
    UserRegisterSchema,
    UserUpdateSchema,
)
from backend.security import (
    create_database_token,
    create_email_token,
    get_current_token,
    get_current_user,
    hash_password,
    reserve_next_id,
    verify_email_token,
    verify_password,
)
from backend.services.email_service import send_activation_email, send_password_reset_email
from sqlalchemy import func, select
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


def serialize_registered_user(
    user: User,
    *,
    reactivated: bool = False,
    welcome_message: str | None = None,
) -> dict:
    payload = UserOutSchema.model_validate(user).model_dump()
    payload["reactivated"] = reactivated
    payload["welcome_message"] = welcome_message
    return payload


@router.post(
    "/user/create",
    response_model=UserRegisterResponseSchema,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("5/minute")
def register_user(
    request: Request,
    user: UserRegisterSchema,
    db: Session = Depends(get_db),
) -> dict:
    normalised_email = user.email.strip().lower()
    hashed_password = hash_password(user.password)

    # Check for deactivated account eligible for reactivation
    existing = (
        db.execute(select(User).where(User.email == normalised_email))
        .scalars()
        .first()
    )

    if existing and not existing.is_active:
        existing.is_active = True
        existing.password_hash = hashed_password
        existing.deactivated_at = None
        existing.email_verified = False
        if user.display_name:
            existing.display_name = user.display_name.strip()
        raw_token = create_email_token(existing.id, "activation", db)
        db.commit()
        db.refresh(existing)
        send_activation_email(existing.email, raw_token, existing.display_name)
        return serialize_registered_user(
            existing,
            reactivated=True,
            welcome_message=f"Welcome back{', ' + existing.display_name if existing.display_name else ''}!",
        )

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User already exists",
        )

    try:
        new_user_id = reserve_next_id(db, "users")
        new_user = User(
            id=new_user_id,
            email=normalised_email,
            display_name=user.display_name.strip() if user.display_name else None,
            password_hash=hashed_password,
        )
        db.add(new_user)
        db.flush()

        db.add(
            UserPreference(
                id=reserve_next_id(db, "user_preferences"),
                user_id=new_user.id,
            )
        )

        household = Household(
            id=reserve_next_id(db, "households"),
            owner_user_id=new_user.id,
            name=build_default_household_name(new_user),
            slug=build_default_household_slug(new_user),
        )
        db.add(household)
        db.flush()

        db.add(
            HouseholdMember(
                id=reserve_next_id(db, "household_members"),
                household_id=household.id,
                user_id=new_user.id,
                role="owner",
                is_active=True,
            )
        )

        raw_token = create_email_token(new_user.id, "activation", db)
        db.commit()
        db.refresh(new_user)
        send_activation_email(new_user.email, raw_token, new_user.display_name)
        return serialize_registered_user(new_user)

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User already exists",
        )


@router.post("/token", response_model=TokenSchema)
@limiter.limit("10/minute")
def login(
    request: Request,
    response: Response,
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: Session = Depends(get_db),
) -> TokenSchema:
    user = (
        db.execute(select(User).where(User.email == form_data.username.strip().lower()))
        .scalars()
        .first()
    )

    if not user or not user.is_active or not verify_password(
        form_data.password, user.password_hash
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
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
@limiter.limit("3/minute")
def delete_account(
    request: Request,
    data: DeleteAccountSchema,
    current_token: UserSession = Depends(get_current_token),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    if not verify_password(data.password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect password.",
        )

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
    current_user.deactivated_at = now
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Profile ──────────────────────────────────────────────────────────────────

@router.patch("/me", response_model=UserOutSchema)
@limiter.limit("10/minute")
def update_profile(
    request: Request,
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
    if update.plan is not None:
        current_user.plan = update.plan
    if update.profile_image_data is not None:
        stripped_image = update.profile_image_data.strip()
        current_user.profile_image_data = stripped_image if stripped_image else None
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
    if "allow_gemini_health_insights" in set_fields:
        pref.allow_gemini_health_insights = bool(update.allow_gemini_health_insights)

    db.commit()
    db.refresh(pref)
    return pref


# ── Password ──────────────────────────────────────────────────────────────────

@router.patch("/password", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("5/minute")
def change_password(
    request: Request,
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


# ── Email verification & Password reset ──────────────────────────────────────

@router.post("/forgot-password")
@limiter.limit("3/minute")
def forgot_password(
    request: Request,
    data: ForgotPasswordSchema,
    db: Session = Depends(get_db),
) -> dict:
    """Always returns 200 to prevent email enumeration."""
    user = (
        db.execute(select(User).where(User.email == data.email.strip().lower(), User.is_active.is_(True)))
        .scalars()
        .first()
    )
    if user:
        raw_token = create_email_token(user.id, "password_reset", db)
        db.commit()
        send_password_reset_email(user.email, raw_token, user.display_name)
    return {"detail": "If an account with that email exists, a reset link has been sent."}


@router.post("/reset-password")
@limiter.limit("5/minute")
def reset_password(
    request: Request,
    data: ResetPasswordSchema,
    db: Session = Depends(get_db),
) -> dict:
    tok = verify_email_token(data.token, "password_reset", db)
    user = db.get(User, tok.user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Account not found.")

    user.password_hash = hash_password(data.new_password)

    # Revoke all active sessions so the user must log in with the new password
    now = datetime.now(UTC)
    sessions = (
        db.execute(
            select(UserSession).where(
                UserSession.user_id == user.id,
                UserSession.revoked_at.is_(None),
            )
        )
        .scalars()
        .all()
    )
    for s in sessions:
        s.revoked_at = now

    db.commit()
    return {"detail": "Password has been reset. You can now log in with your new password."}


@router.get("/activate")
@limiter.limit("10/minute")
def activate_email(
    request: Request,
    token: str,
    db: Session = Depends(get_db),
) -> dict:
    tok = verify_email_token(token, "activation", db)
    user = db.get(User, tok.user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Account not found.")

    user.email_verified = True
    db.commit()
    return {"detail": "Email verified successfully."}


@router.post("/resend-activation")
@limiter.limit("3/minute")
def resend_activation(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    if current_user.email_verified:
        return {"detail": "Email is already verified."}

    raw_token = create_email_token(current_user.id, "activation", db)
    db.commit()
    send_activation_email(current_user.email, raw_token, current_user.display_name)
    return {"detail": "Verification email sent."}


# ── Saved Locations ───────────────────────────────────────────────────────────

@router.get("/locations", response_model=list[SavedLocationOutSchema])
def list_saved_locations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[SavedLocation]:
    return (
        db.execute(
            select(SavedLocation)
            .where(SavedLocation.user_id == current_user.id)
            .order_by(SavedLocation.sort_order, SavedLocation.created_at)
        )
        .scalars()
        .all()
    )


@router.post("/locations", response_model=SavedLocationOutSchema, status_code=status.HTTP_201_CREATED)
def add_saved_location(
    data: SavedLocationCreateSchema,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SavedLocation:
    existing = (
        db.execute(
            select(SavedLocation).where(
                SavedLocation.user_id == current_user.id,
                SavedLocation.label == data.label,
            )
        )
        .scalars()
        .first()
    )
    if existing:
        return existing

    count = db.execute(
        select(func.count()).select_from(SavedLocation).where(SavedLocation.user_id == current_user.id)
    ).scalar_one()

    loc = SavedLocation(
        user_id=current_user.id,
        label=data.label,
        lat=data.lat,
        lon=data.lon,
        sort_order=count,
    )
    db.add(loc)
    db.commit()
    db.refresh(loc)
    return loc


@router.delete("/locations/{location_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_saved_location(
    location_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    loc = (
        db.execute(
            select(SavedLocation).where(
                SavedLocation.id == location_id,
                SavedLocation.user_id == current_user.id,
            )
        )
        .scalars()
        .first()
    )
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")
    db.delete(loc)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
