from __future__ import annotations

import json
import os

try:
    from google import genai
    from google.genai import types as genai_types
except ModuleNotFoundError:
    genai = None
    genai_types = None
from backend.security import get_current_user
from backend.models import User
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

router = APIRouter(prefix="/api/ai", tags=["ai"])

GEMINI_MODEL = "gemini-2.5-flash"


class OutdoorData(BaseModel):
    aqi: float | None = None
    aqi_label: str | None = None
    pm25: float | None = None
    pm10: float | None = None
    temperature: float | None = None
    humidity: float | None = None
    location: str | None = None


class IndoorData(BaseModel):
    pm25: float | None = None
    pm10: float | None = None
    co2: float | None = None
    temperature: float | None = None
    humidity: float | None = None


class RecommendationRequest(BaseModel):
    outdoor: OutdoorData
    indoor: IndoorData | None = None


class RecommendationResponse(BaseModel):
    ok: bool
    outdoor: list[str]
    indoor: list[str]


def _build_prompt(outdoor: OutdoorData, indoor: IndoorData | None) -> str:
    location_line = f"Location: {outdoor.location}" if outdoor.location else ""

    outdoor_lines = []
    if outdoor.aqi is not None:
        outdoor_lines.append(f"- AQI: {outdoor.aqi} ({outdoor.aqi_label or ''})")
    if outdoor.pm25 is not None:
        outdoor_lines.append(f"- PM2.5: {outdoor.pm25} µg/m³  [EU annual guideline: 10 µg/m³ | WHO 24h: 15 µg/m³]")
    if outdoor.pm10 is not None:
        outdoor_lines.append(f"- PM10: {outdoor.pm10} µg/m³  [EU annual guideline: 20 µg/m³ | WHO 24h: 45 µg/m³]")
    if outdoor.temperature is not None:
        outdoor_lines.append(f"- Temperature: {outdoor.temperature}°C")
    if outdoor.humidity is not None:
        outdoor_lines.append(f"- Humidity: {outdoor.humidity}%")

    indoor_lines = []
    if indoor:
        if indoor.pm25 is not None:
            indoor_lines.append(f"- PM2.5: {indoor.pm25} µg/m³  [WHO indoor guideline: <10 µg/m³]")
        if indoor.pm10 is not None:
            indoor_lines.append(f"- PM10: {indoor.pm10} µg/m³  [WHO indoor guideline: <20 µg/m³]")
        if indoor.co2 is not None:
            indoor_lines.append(f"- CO2: {indoor.co2} ppm  [Good: <1000 ppm | Moderate: 1000-2000 ppm | Poor: >2000 ppm]")
        if indoor.temperature is not None:
            indoor_lines.append(f"- Temperature: {indoor.temperature}°C  [EU comfort range: 18-24°C]")
        if indoor.humidity is not None:
            indoor_lines.append(f"- Humidity: {indoor.humidity}%  [Healthy range: 40-60%]")

    indoor_section = (
        "\nIndoor sensor readings:\n" + "\n".join(indoor_lines)
        if indoor_lines
        else "\nNo indoor sensor data available."
    )

    return f"""You are an air quality health advisor using EU/WHO air quality guidelines.

{location_line}

Outdoor air quality:
{chr(10).join(outdoor_lines) if outdoor_lines else "No outdoor data available."}
{indoor_section}

Return a JSON object with exactly two keys:
- "outdoor": an array of 2-4 short action strings. Each string is one clear recommended action. Cover: whether it is safe to exercise outdoors, recommended workout intensity vs EU/WHO limits, and any precautions. Reference the actual values.
- "indoor": an array of 2-4 short action strings. Each string is one clear recommended action. Cover: whether to open windows (compare outdoor vs indoor air quality), CO2 ventilation action if relevant, and sleep quality advice based on temperature, humidity and CO2. Reference the actual values.

Each string must start with an action verb (e.g. "Open windows...", "Avoid...", "Keep...", "Consider..."). Do not nest arrays. Respond with only the JSON object — no markdown, no extra text.
"""


@router.post("/recommendation", response_model=RecommendationResponse)
def get_ai_recommendation(
    body: RecommendationRequest,
    current_user: User = Depends(get_current_user),
) -> RecommendationResponse:
    if genai is None or genai_types is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI recommendations are unavailable because google-genai is not installed.",
        )

    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI recommendations are not configured (missing GOOGLE_API_KEY).",
        )

    client = genai.Client(api_key=api_key)
    prompt = _build_prompt(body.outdoor, body.indoor)

    try:
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=genai_types.GenerateContentConfig(
                response_mime_type="application/json",
            ),
        )
        data = json.loads(response.text)

        def _to_list(value: object) -> list[str]:
            if isinstance(value, list):
                return [str(item).strip() for item in value if str(item).strip()]
            return [str(value).strip()] if value else []

        return RecommendationResponse(
            ok=True,
            outdoor=_to_list(data.get("outdoor")),
            indoor=_to_list(data.get("indoor")),
        )
    except (json.JSONDecodeError, KeyError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Gemini returned unexpected format: {exc}",
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Gemini API error: {exc}",
        ) from exc
