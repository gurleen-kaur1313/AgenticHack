import asyncio
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "mindmesh"))

from agents.reflection import ReflectionAgent
from models import (
    BehavioralSignal,
    EmotionResult,
    InterventionResult,
    OrchestrationState,
    RiskResult,
)


def build_signal(text: str) -> BehavioralSignal:
    return BehavioralSignal(
        journal_text=text,
        typing_speed=120,
        pause_frequency=5,
        deletion_frequency=15,
        inactivity_duration_ms=2000,
        burst_typing=False,
        client_timestamp=datetime(2026, 5, 23, 22, 0, 0),
    )


async def test_reflection_with_history() -> None:
    agent = ReflectionAgent()
    state = OrchestrationState(
        session_id="test",
        signal=build_signal("Still feeling stressed but slightly better today"),
        emotion=EmotionResult(
            mood="negative",
            mood_score=35,
            stress_score=72,
            anxiety_score=60,
            emotional_volatility=0.45,
        ),
        risk=RiskResult(
            risk_level="moderate",
            escalation_triggered=False,
            confidence=0.7,
            flags=["burnout_risk"],
        ),
        intervention=InterventionResult(
            intervention="mindfulness_prompt",
            workflow=["mindfulness_prompt"],
            duration="5 minutes",
            follow_up="none",
            priority="suggested",
        ),
        history=[
            {
                "timestamp": "2026-05-21 03:00",
                "stress_score": 91,
                "anxiety_score": 88,
                "mood_score": 15,
                "risk_level": "high",
            },
            {
                "timestamp": "2026-05-22 01:30",
                "stress_score": 85,
                "anxiety_score": 80,
                "mood_score": 22,
                "risk_level": "high",
            },
            {
                "timestamp": "2026-05-22 23:00",
                "stress_score": 78,
                "anxiety_score": 68,
                "mood_score": 30,
                "risk_level": "moderate",
            },
        ],
    )

    result = await agent.run(state)

    assert result.reflection is not None
    assert len(result.reflection.insight) > 20
    assert len(result.reflection.recommendations) >= 1
    print("PASS history:", result.reflection)


async def test_reflection_first_session() -> None:
    agent = ReflectionAgent()
    state = OrchestrationState(
        session_id="test",
        signal=build_signal("First time using this, feeling anxious about a deadline"),
        emotion=EmotionResult(
            mood="negative",
            mood_score=40,
            stress_score=65,
            anxiety_score=58,
            emotional_volatility=0.3,
        ),
        risk=RiskResult(
            risk_level="moderate",
            escalation_triggered=False,
            confidence=0.6,
            flags=["burnout_risk"],
        ),
        history=[],
    )

    result = await agent.run(state)

    assert result.reflection is not None
    assert "baseline" in result.reflection.trend_change.lower()
    print("PASS first session:", result.reflection)


async def main() -> None:
    await test_reflection_with_history()
    await test_reflection_first_session()


if __name__ == "__main__":
    asyncio.run(main())
