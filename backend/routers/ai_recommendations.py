from __future__ import annotations

import json
import os
from datetime import datetime

try:
    from google import genai
    from google.genai import types as genai_types
except ModuleNotFoundError:
    genai = None
    genai_types = None
from backend.database import get_db
from backend.security import get_current_user
from backend.models import User
from backend.schemas.ai import SleepInsightExplanationSchema, SleepInsightResponseSchema, TrainingInsightResponseSchema
from backend.services.sleep_insights import build_sleep_insight
from backend.services.training_insights import build_training_insight
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

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


class _SleepInsightExplanationResponse(BaseModel):
    headline: str
    summary: str
    action_items: list[str]
    training_note: str | None = None
    caveats: list[str]


def _can_access_sleep_insight(user: User) -> bool:
    return user.role == "admin" or getattr(user, "plan", "free") == "plus"


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


def _build_sleep_insight_prompt(insight: dict[str, object]) -> str:
    explanation = insight.get("explanation") if isinstance(insight.get("explanation"), dict) else {}
    findings = insight.get("findings") if isinstance(insight.get("findings"), list) else []
    actions = insight.get("actions") if isinstance(insight.get("actions"), list) else []
    training_context = insight.get("training_context") if isinstance(insight.get("training_context"), dict) else {}
    data_quality = insight.get("data_quality") if isinstance(insight.get("data_quality"), dict) else {}
    compact_payload = {
        "date": insight.get("date"),
        "sleep": insight.get("sleep"),
        "sleep_quality": insight.get("sleep_quality"),
        "indoor": insight.get("indoor"),
        "outdoor": insight.get("outdoor"),
        "training_context": training_context,
        "data_quality": data_quality,
        "findings": findings,
        "actions": actions,
        "rule_based_explanation": explanation,
    }
    return (
        "You are explaining a single-night sleep insight for AirIQ.\n"
        "The backend has already computed the findings. Do not invent new analysis and do not overstate causation.\n"
        "Treat training only as supporting context, not as the main cause unless the structured findings explicitly say so.\n"
        "If indoor coverage is limited, say so clearly. If demo seed data is present, mention that this is demo-style data.\n"
        "When the structured findings mention sleep duration or stage balance, explain the typical adult target range in plain language.\n"
        "When the structured findings mention recent-night comparisons, preserve that comparison instead of replacing it with a vague statement.\n"
        "Return valid JSON with exactly these keys:\n"
        '- \"headline\": one short sentence\n'
        '- \"summary\": 2-4 clear sentences in plain language\n'
        '- \"action_items\": an array of up to 3 short action strings\n'
        '- \"training_note\": a short optional sentence or null\n'
        '- \"caveats\": an array of 1-3 careful caveat strings\n\n'
        f"Structured analysis:\n{json.dumps(compact_payload, default=str, ensure_ascii=True)}"
    )


def _generate_sleep_insight_explanation(insight: dict[str, object]) -> SleepInsightExplanationSchema | None:
    if genai is None or genai_types is None:
        return None
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        return None

    client = genai.Client(api_key=api_key)
    try:
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=_build_sleep_insight_prompt(insight),
            config=genai_types.GenerateContentConfig(response_mime_type="application/json"),
        )
        payload = json.loads(response.text)
        parsed = _SleepInsightExplanationResponse.model_validate(payload)
        return SleepInsightExplanationSchema(
            source="gemini",
            headline=parsed.headline,
            summary=parsed.summary,
            action_items=parsed.action_items,
            training_note=parsed.training_note,
            caveats=parsed.caveats,
        )
    except Exception:
        return None


def _build_training_insight_prompt(insight: dict[str, object]) -> str:
    explanation = insight.get("explanation") if isinstance(insight.get("explanation"), dict) else {}
    findings = insight.get("findings") if isinstance(insight.get("findings"), list) else []
    actions = insight.get("actions") if isinstance(insight.get("actions"), list) else []
    compact_payload = {
        "date": insight.get("date"),
        "day": insight.get("day"),
        "recent_baseline": insight.get("recent_baseline"),
        "data_quality": insight.get("data_quality"),
        "findings": findings,
        "actions": actions,
        "rule_based_explanation": explanation,
    }
    return (
        "You are explaining a single-day training insight for AirIQ.\n"
        "The backend has already computed the findings. Do not invent new physiology or certainty that is not in the structured analysis.\n"
        "Keep the language practical, clear, and presentation-friendly.\n"
        "When the structured findings mention recent-baseline comparisons, preserve them rather than replacing them with vague coaching language.\n"
        "Return valid JSON with exactly these keys:\n"
        '- \"headline\": one short sentence\n'
        '- \"summary\": 2-4 clear sentences in plain language\n'
        '- \"action_items\": an array of up to 3 short action strings\n'
        '- \"training_note\": a short optional sentence or null\n'
        '- \"caveats\": an array of 1-3 careful caveat strings\n\n'
        f"Structured analysis:\n{json.dumps(compact_payload, default=str, ensure_ascii=True)}"
    )


def _generate_training_insight_explanation(insight: dict[str, object]) -> SleepInsightExplanationSchema | None:
    if genai is None or genai_types is None:
        return None
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        return None

    client = genai.Client(api_key=api_key)
    try:
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=_build_training_insight_prompt(insight),
            config=genai_types.GenerateContentConfig(response_mime_type="application/json"),
        )
        payload = json.loads(response.text)
        parsed = _SleepInsightExplanationResponse.model_validate(payload)
        return SleepInsightExplanationSchema(
            source="gemini",
            headline=parsed.headline,
            summary=parsed.summary,
            action_items=parsed.action_items,
            training_note=parsed.training_note,
            caveats=parsed.caveats,
        )
    except Exception:
        return None


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


@router.get("/sleep-insight", response_model=SleepInsightResponseSchema)
def get_sleep_insight(
    target_date: str = Query(..., alias="date"),
    lat: float | None = Query(None, ge=-90, le=90),
    lon: float | None = Query(None, ge=-180, le=180),
    include_ai: bool = Query(True),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SleepInsightResponseSchema:
    if not _can_access_sleep_insight(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="AI sleep insight is available on the Plus plan or for admins.",
        )

    try:
        parsed_date = datetime.strptime(target_date, "%Y-%m-%d").date()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Date must use YYYY-MM-DD format.") from exc

    try:
        insight = build_sleep_insight(
            db,
            current_user=current_user,
            target_date=parsed_date,
            lat=lat,
            lon=lon,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if include_ai:
        ai_explanation = _generate_sleep_insight_explanation(insight)
        if ai_explanation is not None:
            insight["explanation"] = ai_explanation.model_dump()

    return SleepInsightResponseSchema.model_validate(insight)


@router.get("/training-insight", response_model=TrainingInsightResponseSchema)
def get_training_insight(
    target_date: str = Query(..., alias="date"),
    window: str = Query("day"),
    include_ai: bool = Query(True),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TrainingInsightResponseSchema:
    if not _can_access_sleep_insight(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="AI training insight is available on the Plus plan or for admins.",
        )
    if window not in {"day", "7d"}:
        raise HTTPException(status_code=400, detail="Training insight window must be 'day' or '7d'.")

    try:
        parsed_date = datetime.strptime(target_date, "%Y-%m-%d").date()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Date must use YYYY-MM-DD format.") from exc

    try:
        insight = build_training_insight(
            db,
            current_user=current_user,
            target_date=parsed_date,
            window_mode="7d" if window == "7d" else "day",
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if include_ai:
        ai_explanation = _generate_training_insight_explanation(insight)
        if ai_explanation is not None:
            insight["explanation"] = ai_explanation.model_dump()

    return TrainingInsightResponseSchema.model_validate(insight)
