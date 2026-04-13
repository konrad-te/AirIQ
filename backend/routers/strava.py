from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlencode

import requests
from backend.database import get_db
from backend.models import GarminTrainingActivity, User, UserStravaIntegration
from backend.routers.training import _apply_activity_fields
from backend.schemas.integrations import (
    StravaConnectUrlResponseSchema,
    StravaStatusResponseSchema,
    StravaSyncResponseSchema,
)
from backend.security import get_current_user, reserve_next_id
from backend.services.credential_encryption import (
    CredentialEncryptionError,
    decrypt_credential,
    encrypt_credential,
)
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from sqlalchemy import func, inspect, select
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/integrations/strava", tags=["integrations"])
callback_alias_router = APIRouter(prefix="/api/strava", tags=["integrations"])
logger = logging.getLogger(__name__)

_AUTHORIZE_URL = "https://www.strava.com/oauth/authorize"
_TOKEN_URL = "https://www.strava.com/oauth/token"
_ACTIVITIES_URL = "https://www.strava.com/api/v3/athlete/activities"


def _require_env(name: str) -> str:
    value = (os.getenv(name) or "").strip()
    if value:
        return value
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=f"Strava integration is not configured (missing {name}).",
    )


def _strava_client_id() -> str:
    return _require_env("STRAVA_CLIENT_ID")


def _strava_client_secret() -> str:
    return _require_env("STRAVA_CLIENT_SECRET")


def _strava_redirect_uri() -> str:
    return _require_env("STRAVA_REDIRECT_URI")


def _strava_scopes() -> str:
    return (os.getenv("STRAVA_SCOPES") or "activity:read_all").strip() or "activity:read_all"


def _frontend_base_url() -> str:
    return (os.getenv("FRONTEND_BASE_URL") or "http://localhost:5173").rstrip("/")


def _ensure_strava_schema_ready(db: Session) -> None:
    bind = db.get_bind()
    if bind is None or not inspect(bind).has_table("user_strava_integrations"):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Strava integration is not ready yet because the required database migration "
                "has not been applied."
            ),
        )


def _state_secret() -> str:
    return (os.getenv("STRAVA_STATE_SECRET") or _strava_client_secret()).strip()


def _b64_url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64_url_decode(raw: str) -> bytes:
    padding = "=" * (-len(raw) % 4)
    return base64.urlsafe_b64decode((raw + padding).encode("ascii"))


def _encode_state(*, user_id: int) -> str:
    payload = {
        "u": int(user_id),
        "e": int((datetime.now(UTC) + timedelta(minutes=15)).timestamp()),
        "n": secrets.token_urlsafe(8),
    }
    encoded = _b64_url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signature = hmac.new(
        _state_secret().encode("utf-8"),
        encoded.encode("ascii"),
        hashlib.sha256,
    ).hexdigest()
    return f"{encoded}.{signature}"


def _decode_state(state: str) -> int:
    if "." not in state:
        raise HTTPException(status_code=400, detail="Invalid Strava state payload.")
    encoded, provided_signature = state.split(".", 1)
    expected_signature = hmac.new(
        _state_secret().encode("utf-8"),
        encoded.encode("ascii"),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(provided_signature, expected_signature):
        raise HTTPException(status_code=400, detail="Invalid Strava state signature.")
    try:
        payload = json.loads(_b64_url_decode(encoded).decode("utf-8"))
        user_id = int(payload["u"])
        expires_at = int(payload["e"])
    except (KeyError, ValueError, TypeError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=400, detail="Invalid Strava state payload.") from exc
    if expires_at < int(datetime.now(UTC).timestamp()):
        raise HTTPException(status_code=400, detail="Strava authorization state expired.")
    return user_id


def _redirect_to_training(*, result: str, message: str | None = None) -> RedirectResponse:
    query = {"training_source": "strava", "strava": result}
    if message:
        query["message"] = message
    return RedirectResponse(url=f"{_frontend_base_url()}/training?{urlencode(query)}", status_code=302)


def _parse_iso_datetime(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _to_optional_float(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _seconds_to_minutes(value: Any) -> float | None:
    raw = _to_optional_float(value)
    if raw is None:
        return None
    return round(raw / 60.0, 2)


def _meters_to_km(value: Any) -> float | None:
    raw = _to_optional_float(value)
    if raw is None:
        return None
    return round(raw / 1000.0, 2)


def _location_name(row: dict[str, Any]) -> str | None:
    parts = [
        str(row.get("location_city") or "").strip(),
        str(row.get("location_state") or "").strip(),
        str(row.get("location_country") or "").strip(),
    ]
    joined = ", ".join(part for part in parts if part)
    return joined or None


def _normalize_strava_calories(row: dict[str, Any]) -> float | None:
    calories = _to_optional_float(row.get("calories"))
    if calories is not None:
        return calories

    # Strava ride summaries often include mechanical work in kilojoules without a calories field.
    # In practice, cycling apps commonly use kilojoules as a close kcal proxy for display.
    kilojoules = _to_optional_float(row.get("kilojoules"))
    if kilojoules is not None:
        return round(kilojoules, 1)
    return None


def _normalize_strava_activity(row: dict[str, Any]) -> dict[str, Any] | None:
    activity_id = row.get("id")
    if activity_id in (None, ""):
        return None
    try:
        normalized_activity_id = int(activity_id)
    except (TypeError, ValueError):
        return None

    return {
        "provider": "strava",
        "activity_id": normalized_activity_id,
        "external_uuid": str(row.get("external_id") or "").strip() or None,
        "source_file_name": None,
        "name": str(row.get("name") or "Untitled activity"),
        "activity_type": str(row.get("type") or "").strip() or None,
        "sport_type": str(row.get("sport_type") or "").strip() or None,
        "location_name": _location_name(row),
        "start_time_gmt": _parse_iso_datetime(row.get("start_date")),
        "start_time_local": _parse_iso_datetime(row.get("start_date_local")),
        "duration_minutes": _seconds_to_minutes(row.get("elapsed_time")),
        "elapsed_duration_minutes": _seconds_to_minutes(row.get("elapsed_time")),
        "moving_duration_minutes": _seconds_to_minutes(row.get("moving_time")),
        "calories": _normalize_strava_calories(row),
        "average_heart_rate": _to_optional_float(row.get("average_heartrate")),
        "max_heart_rate": _to_optional_float(row.get("max_heartrate")),
        "min_heart_rate": None,
        "distance_km": _meters_to_km(row.get("distance")),
        "raw_payload_json": row,
    }


def _plain_tokens(integration: UserStravaIntegration) -> tuple[str, str]:
    try:
        return (
            decrypt_credential(integration.access_token),
            decrypt_credential(integration.refresh_token),
        )
    except CredentialEncryptionError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Strava credentials cannot be read because FIELD_ENCRYPTION_KEY is not set on the "
                "server. Configure it before using Strava sync."
            ),
        ) from exc


def _store_token_payload(
    *,
    db: Session,
    integration: UserStravaIntegration | None,
    user_id: int,
    payload: dict[str, Any],
) -> UserStravaIntegration:
    athlete = payload.get("athlete") if isinstance(payload.get("athlete"), dict) else {}
    athlete_name = " ".join(
        part
        for part in (
            str(athlete.get("firstname") or "").strip(),
            str(athlete.get("lastname") or "").strip(),
        )
        if part
    ) or (str(athlete.get("username") or "").strip() or None)

    token_expires_at = None
    expires_at_raw = payload.get("expires_at")
    if expires_at_raw not in (None, ""):
        try:
            token_expires_at = datetime.fromtimestamp(int(expires_at_raw), tz=UTC)
        except (TypeError, ValueError, OSError):
            token_expires_at = None

    encrypted_access_token = encrypt_credential(str(payload["access_token"]))
    encrypted_refresh_token = encrypt_credential(str(payload["refresh_token"]))

    if integration is None:
        integration = UserStravaIntegration(
            id=reserve_next_id(db, "user_strava_integrations"),
            user_id=user_id,
        )
        db.add(integration)

    integration.provider = "strava"
    integration.athlete_id = int(athlete["id"]) if athlete.get("id") not in (None, "") else None
    integration.athlete_username = str(athlete.get("username") or "").strip() or None
    integration.athlete_name = athlete_name
    integration.scope = str(payload.get("scope") or _strava_scopes()).strip() or None
    integration.access_token = encrypted_access_token
    integration.refresh_token = encrypted_refresh_token
    integration.token_expires_at = token_expires_at
    integration.status = "connected"
    return integration


def _exchange_strava_code(code: str) -> dict[str, Any]:
    try:
        response = requests.post(
            _TOKEN_URL,
            data={
                "client_id": _strava_client_id(),
                "client_secret": _strava_client_secret(),
                "code": code,
                "grant_type": "authorization_code",
            },
            timeout=20,
        )
    except requests.RequestException as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not reach Strava OAuth: {exc}",
        ) from exc

    payload = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
    if not response.ok:
        detail = payload.get("message") if isinstance(payload, dict) else None
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=detail or "Strava OAuth token exchange failed.",
        )
    if not isinstance(payload, dict) or not payload.get("access_token") or not payload.get("refresh_token"):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Strava OAuth returned an unexpected response.",
        )
    return payload


def _refresh_strava_token_if_needed(
    *,
    db: Session,
    integration: UserStravaIntegration,
) -> UserStravaIntegration:
    now = datetime.now(UTC)
    if integration.token_expires_at and integration.token_expires_at > now + timedelta(minutes=5):
        return integration

    _, refresh_token = _plain_tokens(integration)
    try:
        response = requests.post(
            _TOKEN_URL,
            data={
                "client_id": _strava_client_id(),
                "client_secret": _strava_client_secret(),
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
            },
            timeout=20,
        )
    except requests.RequestException as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not refresh Strava token: {exc}",
        ) from exc

    payload = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
    if not response.ok or not isinstance(payload, dict):
        detail = payload.get("message") if isinstance(payload, dict) else None
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=detail or "Strava token refresh failed.",
        )

    _store_token_payload(db=db, integration=integration, user_id=integration.user_id, payload=payload)
    db.commit()
    db.refresh(integration)
    return integration


def _get_integration_or_none(db: Session, *, user_id: int) -> UserStravaIntegration | None:
    return (
        db.execute(select(UserStravaIntegration).where(UserStravaIntegration.user_id == user_id))
        .scalars()
        .first()
    )


@router.get("/status", response_model=StravaStatusResponseSchema)
def get_strava_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StravaStatusResponseSchema:
    _ensure_strava_schema_ready(db)
    integration = _get_integration_or_none(db, user_id=current_user.id)
    configured = bool((os.getenv("STRAVA_CLIENT_ID") or "").strip() and (os.getenv("STRAVA_CLIENT_SECRET") or "").strip())
    if integration is None:
        return StravaStatusResponseSchema(
            ok=True,
            provider="strava",
            is_configured=configured,
            is_connected=False,
        )
    return StravaStatusResponseSchema(
        ok=True,
        provider=integration.provider,
        is_configured=configured,
        is_connected=integration.status == "connected",
        athlete_id=integration.athlete_id,
        athlete_username=integration.athlete_username,
        athlete_name=integration.athlete_name,
        scope=integration.scope,
        token_expires_at=integration.token_expires_at,
        last_synced_at=integration.last_synced_at,
    )


@router.get("/connect-url", response_model=StravaConnectUrlResponseSchema)
def get_strava_connect_url(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StravaConnectUrlResponseSchema:
    _ensure_strava_schema_ready(db)
    params = {
        "client_id": _strava_client_id(),
        "redirect_uri": _strava_redirect_uri(),
        "response_type": "code",
        "approval_prompt": "auto",
        "scope": _strava_scopes(),
        "state": _encode_state(user_id=current_user.id),
    }
    return StravaConnectUrlResponseSchema(
        ok=True,
        provider="strava",
        authorization_url=f"{_AUTHORIZE_URL}?{urlencode(params)}",
    )


def _handle_strava_callback(
    code: str | None = Query(None),
    scope: str | None = Query(None),
    state: str | None = Query(None),
    error: str | None = Query(None),
    db: Session = Depends(get_db),
) -> RedirectResponse:
    _ensure_strava_schema_ready(db)
    if error:
        return _redirect_to_training(result="error", message=error)
    if not code or not state:
        return _redirect_to_training(result="error", message="missing_callback_params")

    try:
        user_id = _decode_state(state)
        payload = _exchange_strava_code(code)
        if scope and not payload.get("scope"):
            payload["scope"] = scope
        integration = _get_integration_or_none(db, user_id=user_id)
        _store_token_payload(db=db, integration=integration, user_id=user_id, payload=payload)
        db.commit()
    except HTTPException as exc:
        logger.warning("Strava callback failed: %s", exc.detail)
        return _redirect_to_training(result="error", message=str(exc.detail))
    except CredentialEncryptionError as exc:
        db.rollback()
        logger.warning("Strava callback could not store encrypted credentials: %s", exc)
        return _redirect_to_training(result="error", message="missing_field_encryption_key")
    except Exception:
        db.rollback()
        logger.exception("Unexpected Strava callback failure")
        return _redirect_to_training(result="error", message="unexpected_callback_error")

    return _redirect_to_training(result="connected", message="connected")


@router.get("/callback")
def strava_callback(
    code: str | None = Query(None),
    scope: str | None = Query(None),
    state: str | None = Query(None),
    error: str | None = Query(None),
    db: Session = Depends(get_db),
) -> RedirectResponse:
    return _handle_strava_callback(
        code=code,
        scope=scope,
        state=state,
        error=error,
        db=db,
    )


@callback_alias_router.get("/callback")
def strava_callback_alias(
    code: str | None = Query(None),
    scope: str | None = Query(None),
    state: str | None = Query(None),
    error: str | None = Query(None),
    db: Session = Depends(get_db),
) -> RedirectResponse:
    return _handle_strava_callback(
        code=code,
        scope=scope,
        state=state,
        error=error,
        db=db,
    )


@router.post("/sync", response_model=StravaSyncResponseSchema)
def sync_strava_activities(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StravaSyncResponseSchema:
    _ensure_strava_schema_ready(db)
    integration = _get_integration_or_none(db, user_id=current_user.id)
    if integration is None or integration.status != "connected":
        raise HTTPException(status_code=404, detail="Connect Strava before syncing activities.")

    integration = _refresh_strava_token_if_needed(db=db, integration=integration)
    access_token, _ = _plain_tokens(integration)

    latest_known = db.execute(
        select(func.max(GarminTrainingActivity.start_time_gmt)).where(
            GarminTrainingActivity.user_id == current_user.id,
            GarminTrainingActivity.provider == "strava",
        )
    ).scalar_one_or_none()
    after_dt = latest_known - timedelta(days=1) if latest_known is not None else None

    fetched_total = 0
    imported_total = 0
    updated_total = 0
    skipped_total = 0
    page = 1

    while True:
        params: dict[str, Any] = {"page": page, "per_page": 100}
        if after_dt is not None:
            params["after"] = int(after_dt.timestamp())
        try:
            response = requests.get(
                _ACTIVITIES_URL,
                headers={"Authorization": f"Bearer {access_token}"},
                params=params,
                timeout=20,
            )
        except requests.RequestException as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Could not fetch Strava activities: {exc}",
            ) from exc

        if response.status_code == 401:
            integration = _refresh_strava_token_if_needed(db=db, integration=integration)
            access_token, _ = _plain_tokens(integration)
            continue
        if not response.ok:
            detail = None
            try:
                payload = response.json()
                if isinstance(payload, dict):
                    detail = payload.get("message")
            except ValueError:
                detail = None
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=detail or f"Strava activity sync failed with status {response.status_code}.",
            )

        rows = response.json()
        if not isinstance(rows, list) or not rows:
            break

        fetched_total += len(rows)
        normalized_rows = [
            normalized
            for row in rows
            if isinstance(row, dict)
            if (normalized := _normalize_strava_activity(row))
        ]
        if not normalized_rows:
            skipped_total += len(rows)
            page += 1
            continue

        activity_ids = [item["activity_id"] for item in normalized_rows]
        existing_rows = (
            db.execute(
                select(GarminTrainingActivity).where(
                    GarminTrainingActivity.user_id == current_user.id,
                    GarminTrainingActivity.provider == "strava",
                    GarminTrainingActivity.activity_id.in_(activity_ids),
                )
            )
            .scalars()
            .all()
        )
        existing_by_id = {item.activity_id: item for item in existing_rows}

        for normalized in normalized_rows:
            existing = existing_by_id.get(normalized["activity_id"])
            if existing is None:
                existing = GarminTrainingActivity(user_id=current_user.id)
                _apply_activity_fields(existing, normalized)
                db.add(existing)
                imported_total += 1
            else:
                _apply_activity_fields(existing, normalized)
                updated_total += 1

        skipped_total += max(0, len(rows) - len(normalized_rows))
        page += 1

    integration.last_synced_at = datetime.now(UTC)
    db.commit()
    db.refresh(integration)

    summary = [
        f"{imported_total} new" if imported_total else None,
        f"{updated_total} updated" if updated_total else None,
        f"{skipped_total} skipped" if skipped_total else None,
    ]
    message = ", ".join(part for part in summary if part) or "No activity changes found."
    return StravaSyncResponseSchema(
        ok=True,
        provider="strava",
        message=f"Strava sync finished: {message}.",
        fetched=fetched_total,
        imported=imported_total,
        updated=updated_total,
        skipped=skipped_total,
        last_synced_at=integration.last_synced_at,
    )
