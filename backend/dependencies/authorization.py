from __future__ import annotations

from collections.abc import Callable
from typing import Annotated

from database import get_db
from fastapi import Depends, HTTPException, Path, status
from models import Household, HouseholdMember, User
from security import get_current_user
from sqlalchemy import select
from sqlalchemy.orm import Session


def get_household_membership(
    household_id: Annotated[int, Path()],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> HouseholdMember:
    membership = (
        db.execute(
            select(HouseholdMember).where(
                HouseholdMember.household_id == household_id,
                HouseholdMember.user_id == current_user.id,
                HouseholdMember.is_active.is_(True),
            )
        )
        .scalars()
        .first()
    )

    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not an active member of this household.",
        )

    return membership


def require_household_role(*allowed_roles: str) -> Callable:
    allowed = set(allowed_roles)

    def dependency(
        membership: Annotated[HouseholdMember, Depends(get_household_membership)],
    ) -> HouseholdMember:
        if membership.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action.",
            )
        return membership

    return dependency


def get_current_household(
    household_id: int = Path(...),
    membership: HouseholdMember = Depends(get_household_membership),
    db: Session = Depends(get_db),
) -> Household:
    household = (
        db.execute(select(Household).where(Household.id == membership.household_id))
        .scalars()
        .first()
    )

    if not household:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Household not found.",
        )

    return household
