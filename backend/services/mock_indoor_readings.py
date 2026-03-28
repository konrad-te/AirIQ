"""Generate and remove synthetic indoor sensor readings for QA (same table as real Qingping data)."""

from __future__ import annotations

import math
import random
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from backend.models import IndoorSensorReading, UserQingpingIntegration

MOCK_SOURCE_TYPE = "mock_indoor"
MOCK_PROVIDER = "qingping"


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def delete_mock_indoor_readings(db: Session, *, user_id: int, device_id: str) -> int:
    result = db.execute(
        delete(IndoorSensorReading).where(
            IndoorSensorReading.user_id == user_id,
            IndoorSensorReading.provider == MOCK_PROVIDER,
            IndoorSensorReading.provider_device_key == device_id,
            IndoorSensorReading.source_type == MOCK_SOURCE_TYPE,
        )
    )
    db.commit()
    return int(result.rowcount or 0)


def seed_mock_indoor_readings(
    db: Session,
    *,
    user_id: int,
    device_id: str,
    device_name: str | None,
    months: int = 2,
    minute_step: int = 15,
) -> dict[str, Any]:
    """
    Insert synthetic readings for ~30*months days, marked with source_type=mock_indoor.
    Removes any previous mock rows for this user/device first.
    """
    if months < 1 or months > 6:
        raise ValueError("months must be between 1 and 6")
    if minute_step < 5 or minute_step > 60:
        raise ValueError("minute_step must be between 5 and 60")

    deleted = delete_mock_indoor_readings(db, user_id=user_id, device_id=device_id)

    now_utc = datetime.now(UTC)
    days = min(186, months * 31)
    start = now_utc - timedelta(days=days)
    aligned_minute = (start.minute // minute_step) * minute_step
    start = start.replace(minute=aligned_minute, second=0, microsecond=0)

    rng = random.Random()
    co2 = 820.0 + rng.uniform(-80, 80)
    temp_base = 21.5
    hum_base = 48.0

    rows: list[IndoorSensorReading] = []
    t = start
    step = timedelta(minutes=minute_step)
    idx = 0

    while t <= now_utc:
        day_phase = (t - start).total_seconds() / 86400.0
        diurnal = math.sin((day_phase % 1.0) * 2 * math.pi)
        weekly = math.sin(day_phase * 2 * math.pi / 7)

        temperature_c = _clamp(
            temp_base + 2.8 * weekly + 1.2 * diurnal + rng.uniform(-0.35, 0.35),
            17.5,
            28.5,
        )
        humidity_pct = _clamp(
            hum_base + 14 * math.cos(day_phase * 2 * math.pi / 5) + rng.uniform(-1.2, 1.2),
            28.0,
            72.0,
        )

        co2 += rng.uniform(-55, 55)
        co2 += 0.12 * (920 - co2)
        co2 = _clamp(co2, 420.0, 1950.0)

        pm25 = _clamp(6 + 10 * abs(math.sin(day_phase * 0.9)) + rng.uniform(-1.5, 2.5), 1.0, 95.0)
        pm10 = _clamp(pm25 * (1.35 + 0.15 * rng.random()) + rng.uniform(0, 3), 2.0, 120.0)

        battery_pct = _clamp(
            88 + 8 * math.sin(day_phase * 2 * math.pi / 21) + rng.uniform(-0.8, 0.8),
            55.0,
            100.0,
        )

        payload: dict[str, Any] = {
            "mock": True,
            "generator": "airiq_mock_indoor_v1",
            "series_index": idx,
        }

        rows.append(
            IndoorSensorReading(
                user_id=user_id,
                provider=MOCK_PROVIDER,
                provider_device_key=device_id,
                source_type=MOCK_SOURCE_TYPE,
                device_name=device_name,
                product_name="Mock sensor (test data)",
                serial_number=None,
                wifi_mac=None,
                recorded_at=t,
                temperature_c=round(temperature_c, 2),
                humidity_pct=round(humidity_pct, 2),
                pm25_ug_m3=round(pm25, 2),
                pm10_ug_m3=round(pm10, 2),
                co2_ppm=round(co2, 2),
                battery_pct=round(battery_pct, 2),
                raw_payload_json=payload,
            )
        )
        t += step
        idx += 1

    batch_size = 400
    for i in range(0, len(rows), batch_size):
        chunk = rows[i : i + batch_size]
        db.add_all(chunk)
        db.commit()

    return {
        "deleted_previous_mock": deleted,
        "inserted": len(rows),
        "from": start.isoformat(),
        "to": now_utc.isoformat(),
        "minute_step": minute_step,
    }


def get_user_qingping_device(db: Session, user_id: int) -> tuple[str, str | None] | None:
    integration = (
        db.execute(
            select(UserQingpingIntegration).where(UserQingpingIntegration.user_id == user_id)
        )
        .scalars()
        .first()
    )
    if integration is None or not integration.selected_device_id:
        return None
    return integration.selected_device_id, integration.selected_device_name
