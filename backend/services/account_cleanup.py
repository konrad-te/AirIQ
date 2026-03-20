"""
Permanently remove user accounts that have been deactivated for 30+ days.

Household ownership rules:
- If another admin exists in the household → transfer ownership to them.
- If only regular members/viewers remain → delete the household and its members.
- If no other members exist → delete the household.

Feedback entries are kept with user_id set to NULL (shown as "Deleted user").
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from backend.models import (
    Feedback,
    Household,
    HouseholdMember,
    User,
    UserPreference,
    UserSession,
)

log = logging.getLogger(__name__)

RETENTION_DAYS = 30


def cleanup_deactivated_accounts(db: Session) -> int:
    cutoff = datetime.now(UTC) - timedelta(days=RETENTION_DAYS)

    expired_users = (
        db.execute(
            select(User).where(
                User.is_active.is_(False),
                User.deactivated_at.isnot(None),
                User.deactivated_at <= cutoff,
            )
        )
        .scalars()
        .all()
    )

    if not expired_users:
        return 0

    removed = 0
    for user in expired_users:
        try:
            _cleanup_single_user(db, user)
            removed += 1
        except Exception:
            log.exception("Failed to clean up user %s (id=%d)", user.email, user.id)
            db.rollback()

    return removed


def _cleanup_single_user(db: Session, user: User) -> None:
    user_id = user.id

    # ── Handle owned households ───────────────────────────────────────────
    owned_households = (
        db.execute(select(Household).where(Household.owner_user_id == user_id))
        .scalars()
        .all()
    )

    for household in owned_households:
        _handle_owned_household(db, household, user_id)

    # ── Remove memberships where user is just a member (not owner) ────────
    db.execute(
        delete(HouseholdMember).where(HouseholdMember.user_id == user_id)
    )

    # ── Nullify feedback (keep entries, show as "Deleted user") ───────────
    db.execute(
        update(Feedback).where(Feedback.user_id == user_id).values(user_id=None)
    )

    # ── Delete sessions and preferences ───────────────────────────────────
    db.execute(delete(UserSession).where(UserSession.user_id == user_id))
    db.execute(delete(UserPreference).where(UserPreference.user_id == user_id))

    # ── Delete the user ───────────────────────────────────────────────────
    db.delete(user)
    db.commit()

    log.info("Permanently removed user %s (id=%d)", user.email, user_id)


def _handle_owned_household(
    db: Session, household: Household, departing_user_id: int
) -> None:
    # Find other active members, ordered by role weight (admin first)
    other_members = (
        db.execute(
            select(HouseholdMember)
            .where(
                HouseholdMember.household_id == household.id,
                HouseholdMember.user_id != departing_user_id,
                HouseholdMember.is_active.is_(True),
            )
            .order_by(
                # admin sorts before member/viewer
                HouseholdMember.role.asc()
            )
        )
        .scalars()
        .all()
    )

    # Try to find an admin to promote
    new_owner = next((m for m in other_members if m.role == "admin"), None)

    if new_owner:
        # Transfer ownership
        household.owner_user_id = new_owner.user_id
        new_owner.role = "owner"
        log.info(
            "Transferred household %s (id=%d) ownership to user id=%d",
            household.slug,
            household.id,
            new_owner.user_id,
        )
    else:
        # No admin available — delete the household and all its members
        db.execute(
            delete(HouseholdMember).where(
                HouseholdMember.household_id == household.id
            )
        )
        db.delete(household)
        log.info(
            "Deleted household %s (id=%d) — no eligible successor",
            household.slug,
            household.id,
        )
