from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from database import get_db
from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from models import Household, HouseholdMember, User, UserPreference, UserSession
from schemas.auth import TokenSchema, UserOutSchema, UserRegisterSchema
from security import (
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
        "access_token": access_token.token,
        "token_type": "bearer",
    }


@router.delete("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    current_token: UserSession = Depends(get_current_token),
    db: Session = Depends(get_db),
) -> Response:
    db.execute(delete(UserSession).where(UserSession.token == current_token.token))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=UserOutSchema)
def read_users_me(
    current_user: User = Depends(get_current_user),
) -> User:
    return current_user
