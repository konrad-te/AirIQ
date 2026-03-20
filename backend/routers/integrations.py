from __future__ import annotations

import base64
import os
from datetime import UTC, datetime, timedelta
from typing import Any

import requests
from backend.database import get_db
from backend.models import IndoorSensorReading, User, UserQingpingIntegration
from backend.schemas.integrations import (
    QingpingConnectResponseSchema,
    QingpingConnectSchema,
    QingpingDevicesResponseSchema,
    QingpingDeviceSchema,
    QingpingLatestReadingResponseSchema,
    QingpingSelectDeviceSchema,
    QingpingStatusResponseSchema,
)
from backend.security import get_current_user
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/integrations", tags=["integrations"])


def _qingping_token_url() -> str:
    return os.getenv(
        "QINGPING_TOKEN_URL",
        "https://oauth.cleargrass.com/oauth2/token",
    )


def _qingping_scope() -> str:
    return os.getenv("QINGPING_SCOPE", "device_full_access").strip() or "device_full_access"


def _qingping_devices_url() -> str:
    return os.getenv(
        "QINGPING_DEVICES_URL",
        "https://apis.cleargrass.com/v1/apis/devices",
    )


def _qingping_device_data_url(device_id: str) -> str:
    template = os.getenv(
        "QINGPING_DEVICE_DATA_URL_TEMPLATE",
        "https://apis.cleargrass.com/v1/apis/devices/{device_id}/data",
    )
    return template.format(device_id=device_id)


def _qingping_timeout_seconds() -> int:
    raw = os.getenv("QINGPING_TIMEOUT_SECONDS", "20").strip()
    try:
        return max(5, int(raw))
    except ValueError:
        return 20


def _parse_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _parse_iso_datetime(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _pick_first(source: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in source and source[key] not in (None, ""):
            return source[key]
    return None


def _string_or_none(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    if isinstance(value, (int, float, bool)):
        return str(value)
    if isinstance(value, dict):
        nested = _pick_first(
            value,
            "name",
            "display_name",
            "displayName",
            "model",
            "code",
            "id",
        )
        return _string_or_none(nested)
    return None


def _extract_devices(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if not isinstance(payload, dict):
        return []

    if isinstance(payload.get("devices"), list):
        return [item for item in payload["devices"] if isinstance(item, dict)]

    for key in ("devices", "data", "result", "list", "items"):
        value = payload.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
        if isinstance(value, dict):
            nested = _extract_devices(value)
            if nested:
                return nested

    return []


def _normalize_device_payload(
    raw_device: dict[str, Any],
    selected_device_id: str | None,
) -> QingpingDeviceSchema:
    info = raw_device.get("info") if isinstance(raw_device.get("info"), dict) else {}
    profile = info.get("profile") if isinstance(info.get("profile"), dict) else {}
    merged = {**info, **raw_device}

    device_id = str(
        _pick_first(merged, "id", "device_id", "deviceId", "uuid", "mac")
        or _pick_first(profile, "ble.mac", "production.sn")
        or ""
    )
    device_name = str(
        _pick_first(
            merged,
            "name",
            "device_name",
            "deviceName",
            "nick_name",
            "nickname",
        )
        or "Unnamed device"
    )

    return QingpingDeviceSchema(
        device_id=device_id,
        device_name=device_name,
        product_name=_string_or_none(_pick_first(merged, "product_name", "productName", "product")),
        serial_number=_string_or_none(_pick_first(merged, "serial_number", "serialNumber", "sn") or _pick_first(profile, "production.sn")),
        wifi_mac=_string_or_none(_pick_first(merged, "wifi_mac", "wifiMac", "mac") or _pick_first(profile, "ble.mac")),
        firmware_version=_string_or_none(_pick_first(merged, "firmware_version", "firmwareVersion", "version")),
        is_selected=device_id == selected_device_id,
    )


def _normalize_reading_payload(
    integration: UserQingpingIntegration,
    payload: Any,
) -> tuple[QingpingLatestReadingResponseSchema, dict[str, Any]]:
    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Qingping device data response had an unexpected shape.",
        )

    devices = _extract_devices(payload)
    selected = next(
        (
            device
            for device in devices
            if _normalize_device_payload(
                raw_device=device,
                selected_device_id=integration.selected_device_id,
            ).device_id
            == integration.selected_device_id
        ),
        None,
    )

    if selected is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Selected Qingping device was not found in the latest device list.",
        )

    info = selected.get("info") if isinstance(selected.get("info"), dict) else {}
    raw_data = selected.get("data") if isinstance(selected.get("data"), dict) else {}
    timestamp_value = raw_data.get("timestamp")
    if isinstance(timestamp_value, dict):
        timestamp_value = timestamp_value.get("value")
    updated_at = (
        datetime.fromtimestamp(int(timestamp_value), tz=UTC)
        if isinstance(timestamp_value, (int, float, str)) and str(timestamp_value).strip()
        else None
    )

    def reading_value(key: str) -> Any:
        value = raw_data.get(key)
        if isinstance(value, dict):
            return value.get("value")
        return value

    normalized = QingpingLatestReadingResponseSchema(
        ok=True,
        provider="qingping",
        message="Latest Qingping reading available.",
        device_id=integration.selected_device_id,
        device_name=integration.selected_device_name,
        product_name=integration.selected_product_name,
        serial_number=integration.selected_serial_number,
        wifi_mac=integration.selected_wifi_mac,
        updated_at=updated_at,
        temperature_c=reading_value("temperature"),
        humidity_pct=reading_value("humidity"),
        pm2_5_ug_m3=reading_value("pm25"),
        pm10_ug_m3=reading_value("pm10"),
        co2_ppm=reading_value("co2"),
        battery_pct=reading_value("battery"),
    )
    return normalized, selected


def _persist_indoor_sensor_reading(
    db: Session,
    user_id: int,
    integration: UserQingpingIntegration,
    normalized: QingpingLatestReadingResponseSchema,
    raw_payload: dict[str, Any],
) -> None:
    if normalized.updated_at is None or not integration.selected_device_id:
        return

    existing = (
        db.execute(
            select(IndoorSensorReading).where(
                IndoorSensorReading.user_id == user_id,
                IndoorSensorReading.provider == "qingping",
                IndoorSensorReading.provider_device_key == integration.selected_device_id,
                IndoorSensorReading.recorded_at == normalized.updated_at,
            )
        )
        .scalars()
        .first()
    )

    if existing is not None:
        existing.temperature_c = normalized.temperature_c
        existing.humidity_pct = normalized.humidity_pct
        existing.pm25_ug_m3 = normalized.pm2_5_ug_m3
        existing.pm10_ug_m3 = normalized.pm10_ug_m3
        existing.co2_ppm = normalized.co2_ppm
        existing.battery_pct = normalized.battery_pct
        existing.raw_payload_json = raw_payload
        db.commit()
        return

    db.add(
        IndoorSensorReading(
            user_id=user_id,
            provider="qingping",
            provider_device_key=integration.selected_device_id,
            source_type="indoor_sensor",
            device_name=normalized.device_name,
            product_name=normalized.product_name,
            serial_number=normalized.serial_number,
            wifi_mac=normalized.wifi_mac,
            recorded_at=normalized.updated_at,
            temperature_c=normalized.temperature_c,
            humidity_pct=normalized.humidity_pct,
            pm25_ug_m3=normalized.pm2_5_ug_m3,
            pm10_ug_m3=normalized.pm10_ug_m3,
            co2_ppm=normalized.co2_ppm,
            battery_pct=normalized.battery_pct,
            raw_payload_json=raw_payload,
        )
    )
    db.commit()


def exchange_qingping_token(app_key: str, app_secret: str) -> dict[str, Any]:
    token_url = _qingping_token_url()
    basic_token = base64.b64encode(f"{app_key}:{app_secret}".encode("ascii")).decode("ascii")
    headers = {
        "Authorization": f"Basic {basic_token}",
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
    }
    body = {
        "grant_type": "client_credentials",
        "scope": _qingping_scope(),
    }

    last_error: requests.RequestException | None = None
    for _ in range(2):
        try:
            response = requests.post(
                token_url,
                headers=headers,
                data=body,
                timeout=_qingping_timeout_seconds(),
            )
            break
        except requests.RequestException as exc:
            last_error = exc
            response = None
    else:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not reach Qingping token service: {last_error}",
        ) from last_error

    if response is None:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not reach Qingping token service.",
        )

    if response.status_code >= 400:
        detail = "Qingping rejected the provided credentials."
        try:
            payload = response.json()
            if isinstance(payload, dict):
                detail = payload.get("error_description") or payload.get("error") or detail
        except ValueError:
            pass

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=detail,
        )

    try:
        payload = response.json()
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Qingping token service returned invalid JSON.",
        ) from exc

    access_token = payload.get("access_token")
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Qingping token response did not include an access token.",
        )

    return payload


def _get_integration_or_404(db: Session, user_id: int) -> UserQingpingIntegration:
    integration = (
        db.execute(
            select(UserQingpingIntegration).where(
                UserQingpingIntegration.user_id == user_id
            )
        )
        .scalars()
        .first()
    )

    if integration is None:
        raise HTTPException(status_code=404, detail="Qingping integration not connected.")

    return integration


def _refresh_qingping_token_if_needed(
    db: Session,
    integration: UserQingpingIntegration,
) -> UserQingpingIntegration:
    now = datetime.now(UTC)
    expires_at = integration.token_expires_at

    if (
        integration.access_token
        and expires_at is not None
        and expires_at > now + timedelta(minutes=2)
    ):
        return integration

    payload = exchange_qingping_token(
        app_key=integration.app_key,
        app_secret=integration.app_secret,
    )

    expires_in = _parse_int(payload.get("expires_in"))
    integration.access_token = payload["access_token"]
    integration.token_expires_at = (
        now + timedelta(seconds=expires_in) if expires_in is not None else None
    )
    integration.status = "connected"
    integration.last_validated_at = now
    db.commit()
    db.refresh(integration)
    return integration


def _qingping_get(
    integration: UserQingpingIntegration,
    url: str,
    params: dict[str, Any] | None = None,
) -> Any:
    headers = {
        "Authorization": f"Bearer {integration.access_token}",
        "Accept": "application/json",
    }

    try:
        response = requests.get(
            url,
            headers=headers,
            params=params,
            timeout=_qingping_timeout_seconds(),
        )
    except requests.RequestException as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not reach Qingping API: {exc}",
        ) from exc

    if response.status_code >= 400:
        detail = "Qingping API request failed."
        try:
            payload = response.json()
            if isinstance(payload, dict):
                detail = (
                    payload.get("message")
                    or payload.get("error_description")
                    or payload.get("error")
                    or detail
                )
        except ValueError:
            pass

        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=detail,
        )

    try:
        return response.json()
    except ValueError as exc:
        if response.text:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Qingping API returned non-JSON response: {response.text[:200]}",
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Qingping API returned invalid JSON.",
        ) from exc


@router.post(
    "/qingping/connect",
    response_model=QingpingConnectResponseSchema,
)
def connect_qingping(
    body: QingpingConnectSchema,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> QingpingConnectResponseSchema:
    payload = exchange_qingping_token(
        app_key=body.app_key.strip(),
        app_secret=body.app_secret.strip(),
    )

    expires_in = _parse_int(payload.get("expires_in"))
    token_expires_at = (
        datetime.now(UTC) + timedelta(seconds=expires_in)
        if expires_in is not None
        else None
    )
    now = datetime.now(UTC)

    integration = (
        db.execute(
            select(UserQingpingIntegration).where(
                UserQingpingIntegration.user_id == current_user.id
            )
        )
        .scalars()
        .first()
    )

    if integration is None:
        integration = UserQingpingIntegration(
            user_id=current_user.id,
            provider="qingping",
            app_key=body.app_key.strip(),
            app_secret=body.app_secret.strip(),
            access_token=payload["access_token"],
            token_expires_at=token_expires_at,
            status="connected",
            last_validated_at=now,
        )
        db.add(integration)
    else:
        integration.app_key = body.app_key.strip()
        integration.app_secret = body.app_secret.strip()
        integration.access_token = payload["access_token"]
        integration.token_expires_at = token_expires_at
        integration.status = "connected"
        integration.last_validated_at = now

    db.commit()
    db.refresh(integration)

    return QingpingConnectResponseSchema(
        ok=True,
        integration_id=integration.id,
        provider=integration.provider,
        message="Qingping account connected successfully.",
        token_expires_at=integration.token_expires_at,
    )


@router.get(
    "/qingping/status",
    response_model=QingpingStatusResponseSchema,
)
def get_qingping_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> QingpingStatusResponseSchema:
    integration = (
        db.execute(
            select(UserQingpingIntegration).where(
                UserQingpingIntegration.user_id == current_user.id
            )
        )
        .scalars()
        .first()
    )

    if integration is None:
        return QingpingStatusResponseSchema(
            ok=True,
            provider="qingping",
            is_connected=False,
        )

    return QingpingStatusResponseSchema(
        ok=True,
        provider=integration.provider,
        is_connected=integration.status == "connected",
        selected_device_id=integration.selected_device_id,
        selected_device_name=integration.selected_device_name,
        selected_product_name=integration.selected_product_name,
        selected_serial_number=integration.selected_serial_number,
        selected_wifi_mac=integration.selected_wifi_mac,
        token_expires_at=integration.token_expires_at,
    )


@router.get(
    "/qingping/devices",
    response_model=QingpingDevicesResponseSchema,
)
def list_qingping_devices(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> QingpingDevicesResponseSchema:
    integration = _get_integration_or_404(db=db, user_id=current_user.id)
    integration = _refresh_qingping_token_if_needed(db=db, integration=integration)
    payload = _qingping_get(integration=integration, url=_qingping_devices_url())
    devices = [
        _normalize_device_payload(raw_device=device, selected_device_id=integration.selected_device_id)
        for device in _extract_devices(payload)
    ]

    return QingpingDevicesResponseSchema(
        ok=True,
        count=len(devices),
        devices=devices,
    )


@router.post("/qingping/select-device")
def select_qingping_device(
    body: QingpingSelectDeviceSchema,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    integration = _get_integration_or_404(db=db, user_id=current_user.id)
    integration = _refresh_qingping_token_if_needed(db=db, integration=integration)
    payload = _qingping_get(integration=integration, url=_qingping_devices_url())
    devices = _extract_devices(payload)

    selected = next(
        (
            device
            for device in devices
            if str(
                _pick_first(
                    {
                        **(device.get("info") if isinstance(device.get("info"), dict) else {}),
                        **device,
                    },
                    "id",
                    "device_id",
                    "deviceId",
                    "uuid",
                    "mac",
                )
                or _pick_first(
                    (
                        device.get("info", {}).get("profile", {})
                        if isinstance(device.get("info"), dict)
                        else {}
                    ),
                    "ble.mac",
                    "production.sn",
                )
                or ""
            )
            == body.device_id
        ),
        None,
    )

    if selected is None:
        raise HTTPException(status_code=404, detail="Qingping device not found.")

    integration.selected_device_id = body.device_id
    selected_info = selected.get("info") if isinstance(selected.get("info"), dict) else {}
    selected_merged = {**selected_info, **selected}

    integration.selected_device_name = str(
        _pick_first(selected_merged, "name", "device_name", "deviceName", "nickname") or "Unnamed device"
    )
    integration.selected_product_name = _string_or_none(
        _pick_first(selected_merged, "product_name", "productName", "product")
    )
    integration.selected_serial_number = _string_or_none(
        _pick_first(selected_merged, "serial_number", "serialNumber", "sn")
        or _pick_first(selected_info.get("profile", {}) if isinstance(selected_info.get("profile"), dict) else {}, "production.sn")
    )
    integration.selected_wifi_mac = _string_or_none(
        _pick_first(selected_merged, "wifi_mac", "wifiMac", "mac")
        or _pick_first(selected_info.get("profile", {}) if isinstance(selected_info.get("profile"), dict) else {}, "ble.mac")
    )
    integration.last_synced_at = datetime.now(UTC)
    db.commit()
    db.refresh(integration)

    return {
        "ok": True,
        "device_id": integration.selected_device_id,
        "device_name": integration.selected_device_name,
        "product_name": integration.selected_product_name,
        "serial_number": integration.selected_serial_number,
        "wifi_mac": integration.selected_wifi_mac,
        "message": "Qingping device selected successfully.",
    }


@router.get(
    "/qingping/latest-reading",
    response_model=QingpingLatestReadingResponseSchema,
)
def get_qingping_latest_reading(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> QingpingLatestReadingResponseSchema:
    integration = _get_integration_or_404(db=db, user_id=current_user.id)

    if not integration.selected_device_id:
        raise HTTPException(status_code=404, detail="No Qingping device has been selected yet.")

    integration = _refresh_qingping_token_if_needed(db=db, integration=integration)
    payload = _qingping_get(
        integration=integration,
        url=_qingping_devices_url(),
    )

    integration.last_synced_at = datetime.now(UTC)
    db.commit()
    db.refresh(integration)

    normalized, raw_selected_payload = _normalize_reading_payload(
        integration=integration,
        payload=payload,
    )
    _persist_indoor_sensor_reading(
        db=db,
        user_id=current_user.id,
        integration=integration,
        normalized=normalized,
        raw_payload=raw_selected_payload,
    )
    return normalized
