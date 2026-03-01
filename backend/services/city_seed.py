from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Any

import requests
from sqlalchemy import select
from sqlalchemy.orm import Session

from models import CityPoint


RESTCOUNTRIES_URL = "https://restcountries.com/v3.1/all?fields=name,cca2,capital,capitalInfo"
GEONAMES_DATASET_URL = (
    "https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/"
    "geonames-all-cities-with-a-population-1000/records"
)


@dataclass
class SeedResult:
    total_input_points: int
    inserted: int
    updated: int
    deactivated: int


def _safe_int(value: Any) -> int | None:
    try:
        if value is None:
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def _fetch_country_metadata(timeout: int = 30) -> tuple[dict[str, dict], dict[str, list[dict]]]:
    res = requests.get(RESTCOUNTRIES_URL, timeout=timeout)
    res.raise_for_status()
    countries = res.json()

    by_code: dict[str, dict] = {}
    buckets: dict[str, list[dict]] = defaultdict(list)

    for country in countries:
        code = country.get("cca2")
        if not code:
            continue

        capital_name = None
        if isinstance(country.get("capital"), list) and country["capital"]:
            capital_name = country["capital"][0]

        capital_coords = None
        latlng = country.get("capitalInfo", {}).get("latlng")
        if isinstance(latlng, list) and len(latlng) == 2:
            capital_coords = (float(latlng[1]), float(latlng[0]))  # lon, lat

        by_code[code] = {
            "country_code": code,
            "country_name": country.get("name", {}).get("common") or code,
            "capital_name": capital_name,
            "capital_coords": capital_coords,
        }

    return by_code, buckets


def _collect_major_cities(
    country_meta_by_code: dict[str, dict],
    buckets: dict[str, list[dict]],
    per_country: int = 4,
    page_size: int = 100,
    max_pages: int = 180,
    timeout: int = 30,
) -> None:
    for page in range(max_pages):
        offset = page * page_size
        params = {
            "select": "name,country_code,population,coordinates",
            "order_by": "population desc",
            "limit": page_size,
            "offset": offset,
        }
        res = requests.get(GEONAMES_DATASET_URL, params=params, timeout=timeout)
        if not res.ok:
            break

        payload = res.json()
        rows = payload.get("results") or []
        if not rows:
            break

        for row in rows:
            code = row.get("country_code")
            country_meta = country_meta_by_code.get(code)
            if not country_meta:
                continue

            bucket = buckets[code]
            if len(bucket) >= per_country:
                continue

            city_name = row.get("name")
            coords = row.get("coordinates") or {}
            lon = coords.get("lon")
            lat = coords.get("lat")
            if not city_name or not isinstance(lon, (int, float)) or not isinstance(lat, (int, float)):
                continue

            city_name_lower = str(city_name).strip().lower()
            if any(item["city_name"].lower() == city_name_lower for item in bucket):
                continue

            bucket.append(
                {
                    "country_code": country_meta["country_code"],
                    "country_name": country_meta["country_name"],
                    "city_name": city_name.strip(),
                    "lat": float(lat),
                    "lon": float(lon),
                    "population": _safe_int(row.get("population")),
                    "is_capital": False,
                }
            )

        if all(len(buckets[code]) >= per_country for code in country_meta_by_code):
            break


def _fill_with_capitals(
    country_meta_by_code: dict[str, dict],
    buckets: dict[str, list[dict]],
    per_country: int = 4,
) -> None:
    for code, country_meta in country_meta_by_code.items():
        bucket = buckets[code]
        if len(bucket) >= per_country:
            continue

        capital_name = country_meta.get("capital_name")
        capital_coords = country_meta.get("capital_coords")
        if not capital_name or not capital_coords:
            continue

        capital_lower = capital_name.strip().lower()
        if not any(item["city_name"].lower() == capital_lower for item in bucket):
            bucket.append(
                {
                    "country_code": country_meta["country_code"],
                    "country_name": country_meta["country_name"],
                    "city_name": capital_name.strip(),
                    "lat": float(capital_coords[1]),
                    "lon": float(capital_coords[0]),
                    "population": None,
                    "is_capital": True,
                }
            )


def seed_city_points(db: Session, per_country: int = 4) -> SeedResult:
    country_meta_by_code, buckets = _fetch_country_metadata()
    _collect_major_cities(country_meta_by_code, buckets, per_country=per_country)
    _fill_with_capitals(country_meta_by_code, buckets, per_country=per_country)

    points = [point for bucket in buckets.values() for point in bucket]
    points_by_key = {
        (point["country_name"].lower(), point["city_name"].lower()): point for point in points
    }

    existing_rows = db.execute(select(CityPoint)).scalars().all()
    existing_by_key = {
        (row.country_name.lower(), row.city_name.lower()): row for row in existing_rows
    }

    inserted = 0
    updated = 0

    for key, point in points_by_key.items():
        existing = existing_by_key.get(key)
        if existing is None:
            db.add(
                CityPoint(
                    country_code=point["country_code"],
                    country_name=point["country_name"],
                    city_name=point["city_name"],
                    lat=point["lat"],
                    lon=point["lon"],
                    population=point["population"],
                    is_capital=point["is_capital"],
                    is_active=True,
                )
            )
            inserted += 1
            continue

        changed = False
        for field in ("country_code", "lat", "lon", "population", "is_capital"):
            new_value = point[field]
            if getattr(existing, field) != new_value:
                setattr(existing, field, new_value)
                changed = True

        if not existing.is_active:
            existing.is_active = True
            changed = True

        if changed:
            updated += 1

    incoming_keys = set(points_by_key.keys())
    deactivated = 0
    for key, existing in existing_by_key.items():
        if key not in incoming_keys and existing.is_active:
            existing.is_active = False
            deactivated += 1

    db.commit()

    return SeedResult(
        total_input_points=len(points_by_key),
        inserted=inserted,
        updated=updated,
        deactivated=deactivated,
    )
