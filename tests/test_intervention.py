import asyncio
import json
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "mindmesh"))

from agents.intervention import InterventionAgent
import agents.intervention as intervention_module
from models import BehavioralSignal, EmotionResult, OrchestrationState, RiskResult


async def fake_llm_call(system_prompt: str, user_prompt: str) -> str:
    if "Risk level: high" in user_prompt:
        return json.dumps(
            {
                "intervention": "grounding_exercise",
                "workflow": ["grounding_exercise", "sleep_recovery"],
                "duration": "19 minutes",
                "follow_up": "scheduled",
                "priority": "immediate",
            }
        )

    return json.dumps(
        {
            "intervention": "journaling_prompt",
            "workflow": ["journaling_prompt"],
            "duration": "8 minutes",
            "follow_up": "scheduled",
            "priority": "suggested",
        }
    )


intervention_module.llm_call = fake_llm_call


def build_state(risk_level: str, flags: list[str]) -> OrchestrationState:
    return OrchestrationState(
        session_id="test",
        signal=BehavioralSignal(
            journal_text="Everything feels overwhelming",
            typing_speed=182,
            pause_frequency=3,
            deletion_frequency=41,
            inactivity_duration_ms=800,
            burst_typing=True,
            client_timestamp=datetime(2026, 5, 23, 3, 12, 0),
        ),
        emotion=EmotionResult(
            mood="negative",
            mood_score=15,
            stress_score=91,
            anxiety_score=88,
            emotional_volatility=0.78,
        ),
        risk=RiskResult(
            risk_level=risk_level,
            escalation_triggered=risk_level in {"high", "critical"},
            confidence=0.84,
            flags=flags,
        ),
    )


async def test_moderate_intervention() -> None:
    agent = InterventionAgent()
    state = build_state("moderate", ["burnout_risk"])

    result = await agent.run(state)

    assert result.intervention is not None
    assert result.intervention.priority == "suggested"
    assert len(result.intervention.workflow) <= 3
    print("PASS moderate:", result.intervention)


async def test_high_risk_intervention() -> None:
    agent = InterventionAgent()
    state = build_state("high", ["burnout_risk", "sleep_deprivation"])

    result = await agent.run(state)

    assert result.intervention is not None
    assert result.intervention.priority == "immediate"
    assert "sleep_recovery" in result.intervention.workflow
    print("PASS high:", result.intervention)


async def test_crisis_returns_resources() -> None:
    agent = InterventionAgent()
    state = build_state("critical", ["crisis_language", "emotional_overload"])
    state.signal.journal_text = "I want to end it all"

    result = await agent.run(state)

    assert result.intervention is not None
    assert result.intervention.intervention == "crisis_resources"
    assert "988" in result.intervention.workflow[0]
    print("PASS crisis: safety gate works")


async def main() -> None:
    await test_moderate_intervention()
    await test_high_risk_intervention()
    await test_crisis_returns_resources()


if __name__ == "__main__":
    asyncio.run(main())
