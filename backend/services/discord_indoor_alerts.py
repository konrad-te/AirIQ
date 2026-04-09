from __future__ import annotations

import hashlib
import logging
from datetime import UTC, datetime, timedelta

import requests
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.database import SessionLocal
from backend.main import get_air_quality_data
from backend.models import SavedLocation, User, UserPreference, UserQingpingIntegration
from backend.routers.integrations import sync_qingping_integration
from backend.services.credential_encryption import decrypt_credential
from backend.services.discord_outlook_digest import DISCORD_WEBHOOK_PREFIXES, _truncate_discord_content
from backend.services.recommendation_config import get_recommendation_config

logger = logging.getLogger(__name__)

COOLDOWN = timedelta(hours=6)


def _high_indoor_air_suggestions(suggestions: list[dict]) -> list[dict]:
    out: list[dict] = []
    for s in suggestions:
        if s.get("priority") != "high":
            continue
        fam = s.get("family") or s.get("category")
        sid = s.get("id")
        if fam == "ventilation":
            out.append(s)
        elif fam == "indoor_air":
            out.append(s)
        elif sid in ("indoor_temp_too_hot", "indoor_temp_too_cold"):
            out.append(s)
    return out


def _signature(alerts: list[dict]) -> str:
    parts = sorted(f"{a.get('id', '')}|{a.get('title', '')}" for a in alerts)
    raw = "||".join(parts).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _format_message(alerts: list[dict]) -> str:
    lines = ["**Indoor air — high priority**", ""]
    for a in alerts:
        title = a.get("title") or "Alert"
        lines.append(f"**{title}**")
        rec = a.get("recommendation") or a.get("primary_reason") or ""
        if rec:
            lines.append(rec)
        lines.append("")
    return "\n".join(lines).strip()


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


def run_discord_indoor_alerts() -> None:
    now_utc = datetime.now(UTC)
    db = SessionLocal()
    try:
        prefs = (
            db.execute(
                select(UserPreference)
                .join(User, User.id == UserPreference.user_id)
                .where(
                    UserPreference.discord_indoor_alerts_enabled.is_(True),
                    UserPreference.discord_outlook_webhook_encrypted.isnot(None),
                    User.is_active.is_(True),
                    User.deactivated_at.is_(None),
                )
            )
            .scalars()
            .all()
        )

        for pref in prefs:
            enc = pref.discord_outlook_webhook_encrypted
            if not enc or not str(enc).strip():
                continue

            integration = (
                db.execute(
                    select(UserQingpingIntegration).where(
                        UserQingpingIntegration.user_id == pref.user_id,
                        UserQingpingIntegration.status == "connected",
                        UserQingpingIntegration.selected_device_id.is_not(None),
                    )
                )
                .scalars()
                .first()
            )
            if integration is None:
                continue

            try:
                normalized = sync_qingping_integration(db=db, integration=integration)
            except HTTPException as exc:
                logger.info(
                    "discord indoor: qingping sync HTTP user_id=%s detail=%s",
                    pref.user_id,
                    exc.detail,
                )
                continue
            except Exception:
                logger.exception("discord indoor: qingping sync failed user_id=%s", pref.user_id)
                continue

            indoor_data = normalized.model_dump()
            loc = _first_saved_location(db, pref.user_id)
            if not loc:
                continue

            try:
                outdoor_data = get_air_quality_data(float(loc.lat), float(loc.lon))
            except Exception:
                logger.exception(
                    "discord indoor: outdoor data failed user_id=%s", pref.user_id
                )
                continue

            try:
                from backend.app import _build_dashboard_suggestions_payload
            except Exception:
                logger.exception("discord indoor: failed to import suggestion builder")
                continue

            settings = get_recommendation_config(db)
            payload = _build_dashboard_suggestions_payload(
                settings=settings,
                outdoor_data=outdoor_data,
                indoor_data=indoor_data,
            )
            alerts = _high_indoor_air_suggestions(payload.get("suggestions") or [])
            if not alerts:
                continue

            sig = _signature(alerts)
            last_hash = pref.discord_indoor_last_alert_hash
            last_at = pref.discord_indoor_last_alert_at
            if last_hash == sig and last_at is not None:
                la = last_at if last_at.tzinfo else last_at.replace(tzinfo=UTC)
                if now_utc - la < COOLDOWN:
                    continue

            try:
                webhook = decrypt_credential(str(enc).strip())
            except Exception:
                logger.exception("discord indoor: decrypt webhook user_id=%s", pref.user_id)
                continue

            if not any(webhook.startswith(p) for p in DISCORD_WEBHOOK_PREFIXES):
                continue

            body = _format_message(alerts)
            try:
                r = requests.post(
                    webhook,
                    json={"content": _truncate_discord_content(body)},
                    timeout=20,
                )
                if r.status_code >= 400:
                    logger.warning(
                        "discord indoor: webhook HTTP %s user_id=%s",
                        r.status_code,
                        pref.user_id,
                    )
                    continue
            except requests.RequestException:
                logger.exception("discord indoor: post failed user_id=%s", pref.user_id)
                continue

            pref.discord_indoor_last_alert_hash = sig
            pref.discord_indoor_last_alert_at = now_utc
            db.commit()
    finally:
        db.close()
