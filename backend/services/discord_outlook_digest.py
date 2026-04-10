from __future__ import annotations

import logging
from datetime import UTC, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import requests
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.database import SessionLocal
from backend.main import get_air_quality_data
from backend.models import SavedLocation, User, UserPreference
from backend.services.credential_encryption import decrypt_credential
from backend.services.discord_webhook_url import is_valid_discord_incoming_webhook_url
from backend.services.outdoor_outlook_text import (
    build_discord_outlook_message,
    build_outdoor_outlook_paragraph_and_label,
)

logger = logging.getLogger(__name__)

# Match scheduled local time in a window before/after the chosen minute. Scheduler runs every
# 3 minutes; a tight "after only" window can miss the slot if a tick is slightly late.
DISPATCH_MINUTES_BEFORE = 2
DISPATCH_MINUTES_AFTER = 16


def _zone(tz_name: str | None) -> ZoneInfo:
    raw = (tz_name or "").strip() or "UTC"
    try:
        return ZoneInfo(raw)
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


def _truncate_discord_content(text: str, max_len: int = 1900) -> str:
    if len(text) <= max_len:
        return text
    return text[: max_len - 1] + "…"


def _local_calendar_date_str(pref: UserPreference, now_utc: datetime) -> str:
    tz = _zone(pref.timezone)
    local = now_utc.astimezone(tz)
    return f"{local.year:04d}-{local.month:02d}-{local.day:02d}"


def _minutes_since_local_midnight(local: datetime) -> int:
    return local.hour * 60 + local.minute


def _local_minute_matches_schedule(now_t: int, scheduled: int) -> bool:
    day_minutes = 24 * 60
    for delta in range(-DISPATCH_MINUTES_BEFORE, DISPATCH_MINUTES_AFTER + 1):
        if (scheduled + delta) % day_minutes == now_t:
            return True
    return False


def _should_send_now(pref: UserPreference, now_utc: datetime) -> bool:
    tz = _zone(pref.timezone)
    local = now_utc.astimezone(tz)
    sch_h = int(getattr(pref, "discord_outlook_local_hour", 7) or 7)
    sch_m = int(getattr(pref, "discord_outlook_local_minute", 0) or 0)
    scheduled = sch_h * 60 + sch_m
    now_t = _minutes_since_local_midnight(local)
    if not _local_minute_matches_schedule(now_t, scheduled):
        return False
    today_key = f"{local.year:04d}-{local.month:02d}-{local.day:02d}"
    if pref.discord_outlook_last_sent_on == today_key:
        return False
    return True


def _first_saved_location(db: Session, user_id: int) -> SavedLocation | None:
    return (
        db.execute(
            select(SavedLocation)
            .where(SavedLocation.user_id == user_id)
            .order_by(SavedLocation.sort_order.asc(), SavedLocation.id.asc())
        )
        .scalars()
        .first()
    )


def run_morning_discord_outlooks() -> None:
    now_utc = datetime.now(UTC)
    db = SessionLocal()
    try:
        prefs = (
            db.execute(
                select(UserPreference)
                .join(User, User.id == UserPreference.user_id)
                .where(
                    UserPreference.discord_morning_outlook_enabled.is_(True),
                    UserPreference.discord_outlook_webhook_encrypted.isnot(None),
                    User.is_active.is_(True),
                    User.deactivated_at.is_(None),
                )
            )
            .scalars()
            .all()
        )

        for pref in prefs:
            if not _should_send_now(pref, now_utc):
                continue

            enc = pref.discord_outlook_webhook_encrypted
            if not enc or not str(enc).strip():
                logger.warning("discord outlook: skip user_id=%s reason=empty_webhook_ciphertext", pref.user_id)
                continue

            try:
                webhook = decrypt_credential(str(enc).strip())
            except Exception:
                logger.exception("discord outlook: decrypt webhook user_id=%s", pref.user_id)
                continue

            if not is_valid_discord_incoming_webhook_url(webhook):
                logger.warning("discord outlook: invalid webhook URL user_id=%s", pref.user_id)
                continue

            loc = _first_saved_location(db, pref.user_id)
            if not loc:
                logger.warning(
                    "discord outlook: skip user_id=%s reason=no_saved_location "
                    "(add a location via Dashboard and save it to your list)",
                    pref.user_id,
                )
                continue

            try:
                air = get_air_quality_data(float(loc.lat), float(loc.lon))
            except Exception:
                logger.exception(
                    "discord outlook: air quality failed user_id=%s", pref.user_id
                )
                continue

            bundle = build_outdoor_outlook_paragraph_and_label(
                air, timezone_name=pref.timezone, now=now_utc
            )
            if not bundle:
                logger.warning(
                    "discord outlook: skip user_id=%s reason=no_forecast_paragraph "
                    "(forecast/current row missing for this location)",
                    pref.user_id,
                )
                continue

            paragraph, badge = bundle
            body = build_discord_outlook_message(
                location_label=loc.label,
                outlook_paragraph=paragraph,
                overall_label=badge,
            )
            payload = {"content": _truncate_discord_content(body)}
            tz = _zone(pref.timezone)
            local = now_utc.astimezone(tz)
            logger.info(
                "discord outlook: posting user_id=%s local=%s location=%s",
                pref.user_id,
                local.strftime("%Y-%m-%d %H:%M %Z"),
                loc.label,
            )

            try:
                r = requests.post(webhook, json=payload, timeout=20)
                if r.status_code >= 400:
                    logger.warning(
                        "discord outlook: webhook HTTP %s user_id=%s body=%s",
                        r.status_code,
                        pref.user_id,
                        (r.text or "")[:200],
                    )
                    continue
            except requests.RequestException:
                logger.exception("discord outlook: post failed user_id=%s", pref.user_id)
                continue

            pref.discord_outlook_last_sent_on = _local_calendar_date_str(pref, now_utc)
            db.commit()
    finally:
        db.close()
