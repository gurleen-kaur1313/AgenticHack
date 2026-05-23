"""ClickHouse wellness event store with graceful in-memory fallback.

Enabled when CLICKHOUSE_HOST is set in the environment. Otherwise all writes
go to an in-memory list so the rest of the pipeline keeps working without
a running ClickHouse instance.
"""
from __future__ import annotations

import os
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Optional

from dotenv import load_dotenv

from models import OrchestrationState

load_dotenv()


@dataclass
class WellnessEvent:
    timestamp: datetime
    session_id: str
    mood_score: int
    stress_score: int
    anxiety_score: int
    risk_level: str
    typing_speed: int
    deletion_frequency: int
    sleep_hours: int
    intervention_type: str
    monitoring_level: str
    emotional_volatility: float

    def to_row(self) -> list[Any]:
        return [
            self.timestamp,
            self.session_id,
            self.mood_score,
            self.stress_score,
            self.anxiety_score,
            self.risk_level,
            self.typing_speed,
            self.deletion_frequency,
            self.sleep_hours,
            self.intervention_type,
            self.monitoring_level,
            self.emotional_volatility,
        ]

    def to_dict(self) -> dict[str, Any]:
        return {
            "timestamp": self.timestamp.isoformat(),
            "session_id": self.session_id,
            "mood_score": self.mood_score,
            "stress_score": self.stress_score,
            "anxiety_score": self.anxiety_score,
            "risk_level": self.risk_level,
            "typing_speed": self.typing_speed,
            "deletion_frequency": self.deletion_frequency,
            "sleep_hours": self.sleep_hours,
            "intervention_type": self.intervention_type,
            "monitoring_level": self.monitoring_level,
            "emotional_volatility": self.emotional_volatility,
        }


WELLNESS_COLUMNS = [
    "timestamp",
    "session_id",
    "mood_score",
    "stress_score",
    "anxiety_score",
    "risk_level",
    "typing_speed",
    "deletion_frequency",
    "sleep_hours",
    "intervention_type",
    "monitoring_level",
    "emotional_volatility",
]


def event_from_state(state: OrchestrationState) -> WellnessEvent:
    emotion = state.emotion
    risk = state.risk
    intervention = state.intervention
    signal = state.signal
    checkin = state.checkin

    return WellnessEvent(
        timestamp=signal.client_timestamp,
        session_id=state.session_id,
        mood_score=emotion.mood_score if emotion else 0,
        stress_score=emotion.stress_score if emotion else 0,
        anxiety_score=emotion.anxiety_score if emotion else 0,
        risk_level=risk.risk_level if risk else "unknown",
        typing_speed=signal.typing_speed,
        deletion_frequency=signal.deletion_frequency,
        sleep_hours=checkin.sleep_hours if checkin else 0,
        intervention_type=intervention.intervention if intervention else "",
        monitoring_level=state.monitoring_level,
        emotional_volatility=float(emotion.emotional_volatility) if emotion else 0.0,
    )


@dataclass
class _MemoryStore:
    events: list[WellnessEvent] = field(default_factory=list)


class WellnessDBClient:
    """ClickHouse-backed event store with an in-memory fallback."""

    def __init__(self) -> None:
        self._memory = _MemoryStore()
        self._client = None
        self._enabled = False
        self._table = "wellness_events"
        self._configure()

    def _configure(self) -> None:
        host = os.getenv("CLICKHOUSE_HOST")
        if not host:
            return
        try:
            import clickhouse_connect  # type: ignore

            self._client = clickhouse_connect.get_client(
                host=host,
                port=int(os.getenv("CLICKHOUSE_PORT", "8123")),
                username=os.getenv("CLICKHOUSE_USER", "default"),
                password=os.getenv("CLICKHOUSE_PASSWORD", ""),
                database=os.getenv("CLICKHOUSE_DATABASE", "default"),
                secure=os.getenv("CLICKHOUSE_SECURE", "false").lower() == "true",
            )
            self._enabled = True
            print(f"[clickhouse] connected to {host}")
        except Exception as exc:
            print(f"[clickhouse] disabled ({exc.__class__.__name__}: {exc})")
            self._client = None
            self._enabled = False

    @property
    def enabled(self) -> bool:
        return self._enabled

    def init_schema(self) -> None:
        if not self._enabled or not self._client:
            return
        try:
            with open(os.path.join(os.path.dirname(__file__), "..", "sql", "schema.sql")) as f:
                for stmt in f.read().split(";"):
                    stmt = stmt.strip()
                    if stmt and not stmt.startswith("--"):
                        self._client.command(stmt)
        except Exception as exc:
            print(f"[clickhouse] schema init failed: {exc}")

    def write_event(self, event: WellnessEvent) -> None:
        self._memory.events.append(event)
        if self._enabled and self._client:
            try:
                self._client.insert(self._table, [event.to_row()], column_names=WELLNESS_COLUMNS)
            except Exception as exc:
                print(f"[clickhouse] write_event failed: {exc}")

    def write_events_bulk(self, events: list[WellnessEvent]) -> None:
        self._memory.events.extend(events)
        if self._enabled and self._client and events:
            try:
                rows = [event.to_row() for event in events]
                self._client.insert(self._table, rows, column_names=WELLNESS_COLUMNS)
            except Exception as exc:
                print(f"[clickhouse] bulk insert failed: {exc}")

    def get_history(self, session_id: str, limit: int = 50) -> list[WellnessEvent]:
        if self._enabled and self._client:
            try:
                result = self._client.query(
                    """
                    SELECT timestamp, session_id, mood_score, stress_score, anxiety_score,
                           risk_level, typing_speed, deletion_frequency, sleep_hours,
                           intervention_type, monitoring_level, emotional_volatility
                    FROM wellness_events
                    WHERE session_id = {session_id:String}
                    ORDER BY timestamp DESC
                    LIMIT {limit:UInt32}
                    """,
                    parameters={"session_id": session_id, "limit": limit},
                )
                return [WellnessEvent(*row) for row in result.result_rows]
            except Exception as exc:
                print(f"[clickhouse] get_history failed: {exc}")

        return [
            event
            for event in sorted(self._memory.events, key=lambda e: e.timestamp, reverse=True)
            if event.session_id == session_id
        ][:limit]

    def get_timeline(self, session_id: str, period: str = "24h") -> list[dict[str, Any]]:
        since = _period_to_datetime(period)
        events = [
            event
            for event in self._memory.events
            if event.session_id == session_id and event.timestamp >= since
        ]

        if self._enabled and self._client:
            try:
                interval = _period_to_interval(period)
                result = self._client.query(
                    f"""
                    SELECT timestamp, stress_score, anxiety_score, mood_score
                    FROM wellness_events
                    WHERE session_id = {{session_id:String}}
                      AND timestamp > now() - INTERVAL {interval}
                    ORDER BY timestamp
                    """,
                    parameters={"session_id": session_id},
                )
                return [
                    {
                        "timestamp": ts.isoformat() if hasattr(ts, "isoformat") else str(ts),
                        "stress": stress,
                        "anxiety": anxiety,
                        "mood": mood,
                    }
                    for (ts, stress, anxiety, mood) in result.result_rows
                ]
            except Exception as exc:
                print(f"[clickhouse] get_timeline failed: {exc}")

        events.sort(key=lambda e: e.timestamp)
        return [
            {
                "timestamp": event.timestamp.isoformat(),
                "stress": event.stress_score,
                "anxiety": event.anxiety_score,
                "mood": event.mood_score,
            }
            for event in events
        ]

    def get_correlation(self, session_id: str) -> list[dict[str, Any]]:
        events = [event for event in self._memory.events if event.session_id == session_id]

        if self._enabled and self._client:
            try:
                result = self._client.query(
                    """
                    SELECT sleep_hours, avg(stress_score) AS avg_stress
                    FROM wellness_events
                    WHERE session_id = {session_id:String}
                    GROUP BY sleep_hours
                    ORDER BY sleep_hours
                    """,
                    parameters={"session_id": session_id},
                )
                return [
                    {"sleep_hours": int(sleep), "avg_stress": float(stress)}
                    for (sleep, stress) in result.result_rows
                ]
            except Exception as exc:
                print(f"[clickhouse] get_correlation failed: {exc}")

        buckets: dict[int, list[int]] = {}
        for event in events:
            buckets.setdefault(event.sleep_hours, []).append(event.stress_score)
        return [
            {
                "sleep_hours": sleep,
                "avg_stress": sum(scores) / len(scores) if scores else 0,
            }
            for sleep, scores in sorted(buckets.items())
        ]

    def get_intervention_history(self, session_id: str) -> list[dict[str, Any]]:
        events = [
            event
            for event in self._memory.events
            if event.session_id == session_id and event.intervention_type
        ]

        if self._enabled and self._client:
            try:
                result = self._client.query(
                    """
                    SELECT timestamp, intervention_type, risk_level, stress_score
                    FROM wellness_events
                    WHERE session_id = {session_id:String}
                      AND intervention_type != ''
                    ORDER BY timestamp DESC
                    """,
                    parameters={"session_id": session_id},
                )
                return [
                    {
                        "timestamp": ts.isoformat() if hasattr(ts, "isoformat") else str(ts),
                        "intervention_type": intervention,
                        "risk_level": risk,
                        "stress_score": stress,
                    }
                    for (ts, intervention, risk, stress) in result.result_rows
                ]
            except Exception as exc:
                print(f"[clickhouse] get_intervention_history failed: {exc}")

        events.sort(key=lambda e: e.timestamp, reverse=True)
        return [
            {
                "timestamp": event.timestamp.isoformat(),
                "intervention_type": event.intervention_type,
                "risk_level": event.risk_level,
                "stress_score": event.stress_score,
            }
            for event in events
        ]

    def get_summary(self, session_id: str) -> dict[str, Any]:
        events = [event for event in self._memory.events if event.session_id == session_id]
        if not events:
            return {
                "total_sessions": 0,
                "avg_stress": 0,
                "avg_anxiety": 0,
                "avg_mood": 0,
                "most_common_risk": "unknown",
                "most_deployed_intervention": "",
                "trend_direction": "stable",
            }

        avg_stress = sum(e.stress_score for e in events) / len(events)
        avg_anxiety = sum(e.anxiety_score for e in events) / len(events)
        avg_mood = sum(e.mood_score for e in events) / len(events)
        risk_counter = Counter(e.risk_level for e in events)
        intervention_counter = Counter(e.intervention_type for e in events if e.intervention_type)

        sorted_events = sorted(events, key=lambda e: e.timestamp)
        first_half = sorted_events[: len(sorted_events) // 2 or 1]
        second_half = sorted_events[len(sorted_events) // 2 :]
        first_avg = sum(e.stress_score for e in first_half) / len(first_half)
        second_avg = sum(e.stress_score for e in second_half) / len(second_half)
        delta = second_avg - first_avg
        if delta > 5:
            trend = "declining"  # rising stress = declining wellness
        elif delta < -5:
            trend = "improving"
        else:
            trend = "stable"

        return {
            "total_sessions": len(events),
            "avg_stress": round(avg_stress, 1),
            "avg_anxiety": round(avg_anxiety, 1),
            "avg_mood": round(avg_mood, 1),
            "most_common_risk": risk_counter.most_common(1)[0][0],
            "most_deployed_intervention": (
                intervention_counter.most_common(1)[0][0] if intervention_counter else ""
            ),
            "trend_direction": trend,
        }


def _period_to_datetime(period: str) -> datetime:
    now = datetime.now()
    mapping = {
        "1h": timedelta(hours=1),
        "6h": timedelta(hours=6),
        "24h": timedelta(hours=24),
        "7d": timedelta(days=7),
        "30d": timedelta(days=30),
    }
    return now - mapping.get(period, timedelta(hours=24))


def _period_to_interval(period: str) -> str:
    mapping = {
        "1h": "1 HOUR",
        "6h": "6 HOUR",
        "24h": "1 DAY",
        "7d": "7 DAY",
        "30d": "30 DAY",
    }
    return mapping.get(period, "1 DAY")


db_client = WellnessDBClient()
