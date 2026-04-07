from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.models import UserPreference


def user_allows_gemini_health_data(db: Session, user_id: int) -> bool:
    row = (
        db.execute(select(UserPreference).where(UserPreference.user_id == user_id))
        .scalars()
        .first()
    )
    return bool(row and row.allow_gemini_health_insights)
