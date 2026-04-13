from __future__ import annotations

import logging
import os
import shutil
from datetime import UTC, datetime, timedelta

import requests
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.database import SessionLocal
from backend.models import (
    CityPoint,
    Feedback,
    GlobeAqCache,
    SuggestionFeedback,
    User,
    UserSession,
)

logger = logging.getLogger(__name__)

WEBHOOK_URL = os.getenv("DISCORD_WEBHOOK_URL")


def _status_color(ok: bool) -> int:
    return 0x2ECC71 if ok else 0xE74C3C


def _format_bytes(value: int) -> str:
    units = ["B", "KB", "MB", "GB", "TB"]
    size = float(value)
    for unit in units:
        if size < 1024 or unit == units[-1]:
            if unit == "B":
                return f"{int(size)} {unit}"
            return f"{size:.1f} {unit}"
        size /= 1024


def _get_disk_usage_snapshot(path: str = "/") -> dict[str, int]:
    total, used, free = shutil.disk_usage(path)
    return {
        "total": total,
        "used": used,
        "free": free,
    }


def _get_database_size_bytes(db: Session) -> int | None:
    try:
        return db.execute(
            select(func.pg_database_size(func.current_database()))
        ).scalar_one()
    except Exception:
        logger.exception("Failed to read Postgres database size for Discord monitor")
        return None


def build_status_embed(db: Session) -> dict:
    now = datetime.now(UTC)
    online_threshold = now - timedelta(minutes=15)

    total_users = db.execute(select(func.count(User.id))).scalar_one()
    online_users = db.execute(
        select(func.count(func.distinct(UserSession.user_id))).where(
            UserSession.revoked_at.is_(None),
            UserSession.expires_at >= now,
            UserSession.last_used_at >= online_threshold,
        )
    ).scalar_one()

    total_cities = db.execute(
        select(func.count(CityPoint.id)).where(CityPoint.is_active.is_(True))
    ).scalar_one()
    globe_fresh = db.execute(
        select(func.count(GlobeAqCache.city_point_id)).where(
            GlobeAqCache.stale.is_(False)
        )
    ).scalar_one()
    globe_stale = db.execute(
        select(func.count(GlobeAqCache.city_point_id)).where(
            GlobeAqCache.stale.is_(True)
        )
    ).scalar_one()
    coverage_pct = round(globe_fresh / total_cities * 100, 1) if total_cities else 0

    total_feedback = db.execute(select(func.count(Feedback.id))).scalar_one()
    unread_feedback = db.execute(
        select(func.count(Feedback.id)).where(Feedback.is_read.is_(False))
    ).scalar_one()
    total_suggestion_feedback = db.execute(
        select(func.count(SuggestionFeedback.id))
    ).scalar_one()
    unread_suggestion_feedback = db.execute(
        select(func.count(SuggestionFeedback.id)).where(
            SuggestionFeedback.is_reviewed.is_(False)
        )
    ).scalar_one()

    disk_usage = _get_disk_usage_snapshot("/")
    database_size_bytes = _get_database_size_bytes(db)
    overall_ok = globe_stale == 0 or coverage_pct >= 80

    storage_value = (
        f"Server disk free: **{_format_bytes(disk_usage['free'])}** / "
        f"{_format_bytes(disk_usage['total'])}\n"
        f"Database used: **{_format_bytes(database_size_bytes)}**"
        if database_size_bytes is not None
        else (
            f"Server disk free: **{_format_bytes(disk_usage['free'])}** / "
            f"{_format_bytes(disk_usage['total'])}\n"
            "Database used: unavailable"
        )
    )

    return {
        "title": "AirIQ - Server Status",
        "color": _status_color(overall_ok),
        "timestamp": now.isoformat(),
        "fields": [
            {
                "name": "Users",
                "value": f"Total: **{total_users}** | Online (15m): **{online_users}**",
                "inline": False,
            },
            {
                "name": "Feedback Inbox",
                "value": (
                    f"Product feedback: **{total_feedback}** total | **{unread_feedback}** unread\n"
                    f"Suggestion feedback: **{total_suggestion_feedback}** total | "
                    f"**{unread_suggestion_feedback}** unreviewed"
                ),
                "inline": False,
            },
            {
                "name": "Storage",
                "value": storage_value,
                "inline": False,
            },
        ],
        "footer": {"text": "AirIQ Monitor"},
    }


def send_discord_status() -> None:
    if not WEBHOOK_URL:
        logger.warning("DISCORD_WEBHOOK_URL not set - skipping status report")
        return

    db = SessionLocal()
    try:
        embed = build_status_embed(db)
        payload = {"embeds": [embed]}
        resp = requests.post(WEBHOOK_URL, json=payload, timeout=10)
        resp.raise_for_status()
        logger.info("Discord status report sent (HTTP %s)", resp.status_code)
    except Exception:
        logger.exception("Failed to send Discord status report")
    finally:
        db.close()
