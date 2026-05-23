"""Synthetic wellness event generator for analytics development.

Run:
    python seed_data.py --session demo-001 --days 7

Writes events through `WellnessDBClient`, which routes to ClickHouse if
configured and otherwise to the in-memory store.
"""
from __future__ import annotations

import argparse
import random
from datetime import datetime, timedelta

from utils.db_client import WellnessEvent, db_client

INTERVENTIONS = [
    "",
    "box_breathing",
    "five_senses_grounding",
    "box_breathing_grounding",
    "sleep_recovery_reflection",
]


def _risk_for(stress: int) -> str:
    if stress >= 80:
        return "critical" if random.random() < 0.15 else "high"
    if stress >= 60:
        return "moderate"
    return "low"


def _monitoring_for(risk: str) -> str:
    return {
        "low": "NORMAL",
        "moderate": "ELEVATED",
        "high": "HIGH_ATTENTION",
        "critical": "CRITICAL",
    }[risk]


def _intervention_for(risk: str) -> str:
    if risk in ("high", "critical"):
        return random.choice(INTERVENTIONS[1:])
    if risk == "moderate":
        return random.choice([""] + INTERVENTIONS[1:3])
    return ""


def generate_events(session_id: str, days: int, events_per_day: int) -> list[WellnessEvent]:
    events: list[WellnessEvent] = []
    now = datetime.now()
    start = now - timedelta(days=days)

    for day in range(days):
        sleep_hours = random.randint(3, 9)
        is_good_day = random.random() < 0.25
        for slot in range(events_per_day):
            ts = start + timedelta(days=day, hours=24 * slot / events_per_day)
            hour = ts.hour

            base_stress = 35 + (45 if hour < 5 or hour > 22 else 0)
            sleep_penalty = max(0, (6 - sleep_hours) * 8)
            noise = random.randint(-12, 12)
            stress = max(5, min(99, base_stress + sleep_penalty + noise - (20 if is_good_day else 0)))
            anxiety = max(5, min(99, stress + random.randint(-12, 8)))
            mood = max(5, min(99, 110 - stress + random.randint(-10, 10)))
            risk = _risk_for(stress)
            monitoring = _monitoring_for(risk)
            intervention = _intervention_for(risk)

            events.append(
                WellnessEvent(
                    timestamp=ts,
                    session_id=session_id,
                    mood_score=mood,
                    stress_score=stress,
                    anxiety_score=anxiety,
                    risk_level=risk,
                    typing_speed=random.randint(60, 200),
                    deletion_frequency=random.randint(5, 50),
                    sleep_hours=sleep_hours,
                    intervention_type=intervention,
                    monitoring_level=monitoring,
                    emotional_volatility=round(min(1.0, stress / 100 + random.uniform(-0.1, 0.1)), 2),
                )
            )

    return events


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate synthetic wellness events")
    parser.add_argument("--session", default="demo-001")
    parser.add_argument("--days", type=int, default=7)
    parser.add_argument("--per-day", type=int, default=24)
    args = parser.parse_args()

    events = generate_events(args.session, args.days, args.per_day)
    db_client.write_events_bulk(events)

    print(
        f"Generated {len(events)} events for session={args.session} "
        f"(clickhouse={'enabled' if db_client.enabled else 'memory-only'})"
    )
    sample = events[0]
    print(f"Sample: {sample.to_dict()}")


if __name__ == "__main__":
    main()
