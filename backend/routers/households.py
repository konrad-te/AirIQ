from __future__ import annotations

from backend.database import get_db
from backend.dependencies.authorization import (
    get_current_household,
    get_household_membership,
    require_household_role,
)
from fastapi import APIRouter, Depends, HTTPException, status
from backend.models import Household, HouseholdMember, User
from pydantic import BaseModel, EmailStr, Field
from backend.security import get_current_user
from sqlalchemy import select
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/households", tags=["households"])


class HouseholdUpdateSchema(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class HouseholdAddMemberSchema(BaseModel):
    email: EmailStr
    role: str = Field(pattern="^(admin|member|viewer)$")


class HouseholdUpdateMemberRoleSchema(BaseModel):
    role: str = Field(pattern="^(admin|member|viewer)$")


@router.get("/{household_id}")
def get_household(
    household: Household = Depends(get_current_household),
    membership: HouseholdMember = Depends(get_household_membership),
) -> dict:
    return {
        "id": household.id,
        "name": household.name,
        "slug": household.slug,
        "owner_user_id": household.owner_user_id,
        "created_at": household.created_at,
        "updated_at": household.updated_at,
        "my_role": membership.role,
    }


@router.get("/{household_id}/members")
def get_household_members(
    household: Household = Depends(get_current_household),
    membership: HouseholdMember = Depends(get_household_membership),
    db: Session = Depends(get_db),
) -> dict:
    rows = db.execute(
        select(HouseholdMember, User)
        .join(User, User.id == HouseholdMember.user_id)
        .where(HouseholdMember.household_id == household.id)
        .order_by(HouseholdMember.id.asc())
    ).all()

    members = []
    for member_row, user in rows:
        members.append(
            {
                "membership_id": member_row.id,
                "user_id": user.id,
                "email": user.email,
                "display_name": user.display_name,
                "role": member_row.role,
                "is_active": member_row.is_active,
                "joined_at": member_row.created_at,
            }
        )

    return {
        "household": {
            "id": household.id,
            "name": household.name,
            "slug": household.slug,
        },
        "members": members,
    }


@router.patch("/{household_id}")
def update_household(
    payload: HouseholdUpdateSchema,
    household: Household = Depends(get_current_household),
    membership: HouseholdMember = Depends(require_household_role("owner", "admin")),
    db: Session = Depends(get_db),
) -> dict:
    household.name = payload.name.strip()
    db.add(household)
    db.commit()
    db.refresh(household)

    return {
        "id": household.id,
        "name": household.name,
        "slug": household.slug,
        "owner_user_id": household.owner_user_id,
        "updated_at": household.updated_at,
        "my_role": membership.role,
    }


@router.get("/me/list")
def list_my_households(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    rows = db.execute(
        select(HouseholdMember, Household)
        .join(Household, Household.id == HouseholdMember.household_id)
        .where(
            HouseholdMember.user_id == current_user.id,
            HouseholdMember.is_active.is_(True),
            Household.is_active.is_(True),
        )
        .order_by(Household.created_at.asc())
    ).all()

    households = []
    for membership, household in rows:
        households.append(
            {
                "id": household.id,
                "slug": household.slug,
                "name": household.name,
                "timezone": household.timezone,
                "country_code": household.country_code,
                "owner_user_id": household.owner_user_id,
                "my_role": membership.role,
                "joined_at": membership.joined_at,
                "created_at": household.created_at,
                "updated_at": household.updated_at,
            }
        )

    return {
        "user_id": current_user.id,
        "households": households,
    }


@router.post("/{household_id}/members", status_code=201)
def add_household_member(
    payload: HouseholdAddMemberSchema,
    household: Household = Depends(get_current_household),
    membership: HouseholdMember = Depends(require_household_role("owner", "admin")),
    db: Session = Depends(get_db),
) -> dict:
    target_user = (
        db.execute(select(User).where(User.email == payload.email.strip().lower()))
        .scalars()
        .first()
    )

    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    existing_membership = (
        db.execute(
            select(HouseholdMember).where(
                HouseholdMember.household_id == household.id,
                HouseholdMember.user_id == target_user.id,
            )
        )
        .scalars()
        .first()
    )

    if existing_membership and existing_membership.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is already an active member of this household.",
        )

    if existing_membership and not existing_membership.is_active:
        existing_membership.role = payload.role
        existing_membership.is_active = True
        db.add(existing_membership)
        db.commit()
        db.refresh(existing_membership)

        return {
            "message": "Household membership reactivated.",
            "household_id": household.id,
            "user_id": target_user.id,
            "email": target_user.email,
            "role": existing_membership.role,
            "is_active": existing_membership.is_active,
        }

    new_membership = HouseholdMember(
        household_id=household.id,
        user_id=target_user.id,
        role=payload.role,
        is_active=True,
    )
    db.add(new_membership)
    db.commit()
    db.refresh(new_membership)

    return {
        "message": "Household member added.",
        "household_id": household.id,
        "user_id": target_user.id,
        "email": target_user.email,
        "role": new_membership.role,
        "is_active": new_membership.is_active,
    }


@router.patch("/{household_id}/members/{member_id}")
def update_household_member_role(
    member_id: int,
    payload: HouseholdUpdateMemberRoleSchema,
    household: Household = Depends(get_current_household),
    acting_membership: HouseholdMember = Depends(
        require_household_role("owner", "admin")
    ),
    db: Session = Depends(get_db),
) -> dict:
    target_membership = (
        db.execute(
            select(HouseholdMember).where(
                HouseholdMember.id == member_id,
                HouseholdMember.household_id == household.id,
                HouseholdMember.is_active.is_(True),
            )
        )
        .scalars()
        .first()
    )

    if not target_membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Household member not found.",
        )

    if target_membership.user_id == household.owner_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Owner role cannot be changed through this endpoint.",
        )

    if acting_membership.role == "admin" and target_membership.role == "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admins cannot modify other admins.",
        )

    if acting_membership.role == "admin" and payload.role == "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admins cannot promote members to admin.",
        )

    target_membership.role = payload.role
    db.add(target_membership)
    db.commit()
    db.refresh(target_membership)

    target_user = (
        db.execute(select(User).where(User.id == target_membership.user_id))
        .scalars()
        .first()
    )

    return {
        "message": "Household member role updated.",
        "household_id": household.id,
        "member_id": target_membership.id,
        "user_id": target_membership.user_id,
        "email": target_user.email if target_user else None,
        "role": target_membership.role,
        "is_active": target_membership.is_active,
    }


@router.delete("/{household_id}/members/{member_id}")
def remove_household_member(
    member_id: int,
    household: Household = Depends(get_current_household),
    acting_membership: HouseholdMember = Depends(
        require_household_role("owner", "admin")
    ),
    db: Session = Depends(get_db),
) -> dict:
    target_membership = (
        db.execute(
            select(HouseholdMember).where(
                HouseholdMember.id == member_id,
                HouseholdMember.household_id == household.id,
                HouseholdMember.is_active.is_(True),
            )
        )
        .scalars()
        .first()
    )

    if not target_membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Household member not found.",
        )

    if target_membership.user_id == household.owner_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Owner cannot be removed from the household.",
        )

    if target_membership.user_id == acting_membership.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Use a separate leave-household flow for self-removal.",
        )

    if acting_membership.role == "admin" and target_membership.role == "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admins cannot remove other admins.",
        )

    target_membership.is_active = False
    db.add(target_membership)
    db.commit()
    db.refresh(target_membership)

    target_user = (
        db.execute(select(User).where(User.id == target_membership.user_id))
        .scalars()
        .first()
    )

    return {
        "message": "Household member removed.",
        "household_id": household.id,
        "member_id": target_membership.id,
        "user_id": target_membership.user_id,
        "email": target_user.email if target_user else None,
        "role": target_membership.role,
        "is_active": target_membership.is_active,
    }


@router.get("/{household_id}/summary")
def get_household_summary(
    household: Household = Depends(get_current_household),
    membership: HouseholdMember = Depends(get_household_membership),
    db: Session = Depends(get_db),
) -> dict:
    rows = db.execute(
        select(HouseholdMember, User)
        .join(User, User.id == HouseholdMember.user_id)
        .where(
            HouseholdMember.household_id == household.id,
            HouseholdMember.is_active.is_(True),
        )
        .order_by(HouseholdMember.id.asc())
    ).all()

    members = []
    for member_row, user in rows:
        members.append(
            {
                "membership_id": member_row.id,
                "user_id": user.id,
                "email": user.email,
                "display_name": user.display_name,
                "role": member_row.role,
                "joined_at": member_row.created_at,
            }
        )

    role_counts = {
        "owner": 0,
        "admin": 0,
        "member": 0,
        "viewer": 0,
    }

    for member in members:
        if member["role"] in role_counts:
            role_counts[member["role"]] += 1

    return {
        "household": {
            "id": household.id,
            "name": household.name,
            "slug": household.slug,
            "timezone": household.timezone,
            "country_code": household.country_code,
            "owner_user_id": household.owner_user_id,
            "created_at": household.created_at,
            "updated_at": household.updated_at,
        },
        "current_user": {
            "user_id": membership.user_id,
            "role": membership.role,
        },
        "stats": {
            "active_member_count": len(members),
            "role_counts": role_counts,
        },
        "members": members,
    }
