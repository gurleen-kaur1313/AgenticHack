import asyncio
import json
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "mindmesh"))

from agents.reflection import ReflectionAgent
import agents.reflection as reflection_module
from models import (
    BehavioralSignal,
    EmotionResult,
    InterventionResult,
    OrchestrationState,
    RiskResult,
)


async def fake_llm_call(system_prompt: str, user_prompt: str) -> str:
    if "first session" in user_prompt.lower():
        return json.dumps(
            {
                "insight": "This baseline reading shows stress at 65/100 and anxiety at 58/100; compare the next session after logging sleep.",
                "trend_change": "baseline established",
                "period": "0d",
                "recommendations": [
                    "Complete one more check-in after the next work block",
                    "Log sleep hours before the next reflection",
                ],
            }
        )

    return json.dumps(
        {
            "insight": "Stress has moved down from recent high readings while mood is improving; repeat the reset routine before late-night work.",
            "trend_change": "-18% stress improvement over 7 days",
            "period": "7d",
            "recommendations": [
                "Run the selected intervention before the next focused work block",
                "Track whether 7+ hours of sleep keeps stress below 75/100",
            ],
        }
    )


reflection_module.llm_call = fake_llm_call


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
