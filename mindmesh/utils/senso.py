"""Senso behavioral signal enrichment client with a no-op fallback.

Enabled when SENSO_API_KEY is set. When disabled, `enrich` simply derives
heuristic enrichment from the raw signal so the orchestrator never crashes.
"""
from __future__ import annotations

import os
from dataclasses import asdict, dataclass

from dotenv import load_dotenv

from models import BehavioralSignal

load_dotenv()

_API_KEY = os.getenv("SENSO_API_KEY")
_BASE_URL = os.getenv("SENSO_BASE_URL", "https://api.senso.ai/v1")
_ENABLED = bool(_API_KEY)

_httpx = None
if _ENABLED:
    try:
        import httpx  # type: ignore

        _httpx = httpx
        print(f"[senso] enabled (base={_BASE_URL})")
    except Exception as exc:
        print(f"[senso] disabled (httpx unavailable: {exc})")
        _ENABLED = False


@dataclass
class EnrichedBehavior:
    cadence: str
    fluctuation_score: float
    sleep_consistency: str
    raw: dict


def is_enabled() -> bool:
    return _ENABLED


def _heuristic_enrichment(signal: BehavioralSignal) -> EnrichedBehavior:
    if signal.typing_speed > 160:
        cadence = "agitated"
    elif signal.typing_speed < 60:
        cadence = "fatigued"
    else:
        cadence = "steady"

    fluctuation = min(
        1.0,
        (signal.deletion_frequency / 50)
        + (signal.pause_frequency / 20)
        + (0.2 if signal.burst_typing else 0.0),
    )

    hour = signal.client_timestamp.hour
    if hour < 5 or hour > 23:
        sleep_consistency = "disrupted"
    elif hour < 7:
        sleep_consistency = "early"
    else:
        sleep_consistency = "normal"

    return EnrichedBehavior(
        cadence=cadence,
        fluctuation_score=round(fluctuation, 2),
        sleep_consistency=sleep_consistency,
        raw={"source": "heuristic"},
    )


class SensoClient:
    """Wraps Senso's REST API; falls back to a local heuristic when disabled."""

    def __init__(self) -> None:
        self._client = None
        if _ENABLED and _httpx is not None:
            self._client = _httpx.AsyncClient(
                base_url=_BASE_URL,
                headers={"Authorization": f"Bearer {_API_KEY}"},
                timeout=4.0,
            )

    async def enrich(self, signal: BehavioralSignal) -> EnrichedBehavior:
        if not _ENABLED or self._client is None:
            return _heuristic_enrichment(signal)

        try:
            response = await self._client.post(
                "/behavior/ingest",
                json={
                    "typing_speed": signal.typing_speed,
                    "pause_frequency": signal.pause_frequency,
                    "deletion_frequency": signal.deletion_frequency,
                    "inactivity_duration_ms": signal.inactivity_duration_ms,
                    "burst_typing": signal.burst_typing,
                    "client_timestamp": signal.client_timestamp.isoformat(),
                },
            )
            response.raise_for_status()
            data = response.json()
            return EnrichedBehavior(
                cadence=data.get("cadence", "unknown"),
                fluctuation_score=float(data.get("fluctuation_score", 0.0)),
                sleep_consistency=data.get("sleep_consistency", "unknown"),
                raw=data,
            )
        except Exception as exc:
            print(f"[senso] enrich failed, using heuristic ({exc})")
            return _heuristic_enrichment(signal)

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()


senso_client = SensoClient()


def enrichment_to_dict(enrichment: EnrichedBehavior) -> dict:
    return asdict(enrichment)
