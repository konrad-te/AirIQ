from __future__ import annotations

from decimal import Decimal

from backend.models import AppSetting
from sqlalchemy import select
from sqlalchemy.orm import Session

RECOMMENDATION_CONFIG_DEFAULTS: dict[str, float] = {
    "indoor_pm25_high_threshold": 40.0,
    "indoor_humidity_low_threshold": 30.0,
    "indoor_humidity_ideal_min": 40.0,
    "indoor_humidity_ideal_max": 60.0,
    "indoor_humidity_high_threshold": 60.0,
    "sleep_temp_ideal_min": 16.0,
    "sleep_temp_ideal_max": 20.0,
}


def get_recommendation_config(db: Session) -> dict[str, float]:
    existing_rows = db.execute(
        select(AppSetting).where(
            AppSetting.key.in_(tuple(RECOMMENDATION_CONFIG_DEFAULTS.keys()))
        )
    ).scalars().all()

    by_key = {row.key: float(row.value_numeric) for row in existing_rows}
    missing_keys = [
        key
        for key in RECOMMENDATION_CONFIG_DEFAULTS
        if key not in by_key
    ]

    if missing_keys:
        for key in missing_keys:
            db.add(
                AppSetting(
                    key=key,
                    value_numeric=Decimal(str(RECOMMENDATION_CONFIG_DEFAULTS[key])),
                )
            )
        db.commit()

        existing_rows = db.execute(
            select(AppSetting).where(
                AppSetting.key.in_(tuple(RECOMMENDATION_CONFIG_DEFAULTS.keys()))
            )
        ).scalars().all()
        by_key = {row.key: float(row.value_numeric) for row in existing_rows}

    return {
        key: by_key.get(key, default_value)
        for key, default_value in RECOMMENDATION_CONFIG_DEFAULTS.items()
    }


def update_recommendation_config(
    db: Session,
    updates: dict[str, float],
) -> dict[str, float]:
    current = get_recommendation_config(db)
    if not updates:
        return current

    rows = db.execute(
        select(AppSetting).where(AppSetting.key.in_(tuple(updates.keys())))
    ).scalars().all()
    by_key = {row.key: row for row in rows}

    for key, value in updates.items():
        if key not in RECOMMENDATION_CONFIG_DEFAULTS:
            continue

        row = by_key.get(key)
        if row is None:
            row = AppSetting(
                key=key,
                value_numeric=Decimal(str(value)),
            )
            db.add(row)
            by_key[key] = row
        else:
            row.value_numeric = Decimal(str(value))

    db.commit()
    return get_recommendation_config(db)
