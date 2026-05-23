"""
Tests for RiskAgent.

Run from the mindmesh/ directory:
    python tests/test_risk.py

Requires OPENAI_API_KEY set in .env or environment.
"""

import asyncio
import sys
import os

# Allow running from the mindmesh/ directory directly
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime

from agents.risk import RiskAgent, check_crisis_language
from models import (
    BehavioralSignal,
    EmotionResult,
    OrchestrationState,
    WellnessCheckin,
)


def _make_state(
    journal_text: str,
    emotion: EmotionResult,
    *,
    session_id: str = "test",
    typing_speed: int = 100,
    pause_frequency: int = 5,
    deletion_frequency: int = 10,
    inactivity_duration_ms: int = 2000,
    burst_typing: bool = False,
    hour: int = 14,
    checkin: WellnessCheckin | None = None,
    history: list[dict] | None = None,
) -> OrchestrationState:
    return OrchestrationState(
        session_id=session_id,
        signal=BehavioralSignal(
            journal_text=journal_text,
            typing_speed=typing_speed,
            pause_frequency=pause_frequency,
            deletion_frequency=deletion_frequency,
            inactivity_duration_ms=inactivity_duration_ms,
            burst_typing=burst_typing,
            client_timestamp=datetime(2026, 5, 23, hour, 0, 0),
        ),
        emotion=emotion,
        checkin=checkin,
        history=history or [],
    )


# ---------------------------------------------------------------------------
# Test 1 — Low risk: calm, positive entry
# ---------------------------------------------------------------------------
async def test_low_risk():
    agent = RiskAgent()
    state = _make_state(
        journal_text="Had a productive day. Feeling good and relaxed.",
        emotion=EmotionResult(
            mood="positive",
            mood_score=75,
            stress_score=20,
            anxiety_score=15,
            emotional_volatility=0.1,
        ),
        checkin=WellnessCheckin(sleep_hours=8, stress_level=2, mood_score=8, energy_level=8),
        hour=15,
    )

    result = await agent.run(state)

    assert result.risk is not None
    assert result.risk.risk_level == "low", (
        f"Expected 'low' risk, got '{result.risk.risk_level}'"
    )
    assert result.risk.escalation_triggered is False, "No escalation expected for low risk"
    assert result.monitoring_level == "NORMAL", (
        f"Expected NORMAL monitoring, got '{result.monitoring_level}'"
    )
    print(f"PASS [low_risk]: {result.risk}")


# ---------------------------------------------------------------------------
# Test 2 — Moderate risk: elevated stress, no crisis
# ---------------------------------------------------------------------------
async def test_moderate_risk():
    agent = RiskAgent()
    state = _make_state(
        journal_text="Work has been really stressful. Feeling overwhelmed by deadlines.",
        emotion=EmotionResult(
            mood="negative",
            mood_score=38,
            stress_score=65,
            anxiety_score=55,
            emotional_volatility=0.4,
        ),
        checkin=WellnessCheckin(sleep_hours=6, stress_level=7, mood_score=4, energy_level=4),
        typing_speed=130,
        deletion_frequency=18,
        hour=22,
    )

    result = await agent.run(state)

    assert result.risk is not None
    assert result.risk.risk_level in ("moderate", "high"), (
        f"Expected 'moderate' or 'high' risk, got '{result.risk.risk_level}'"
    )
    assert result.monitoring_level in ("ELEVATED", "HIGH_ATTENTION"), (
        f"Expected ELEVATED monitoring, got '{result.monitoring_level}'"
    )
    print(f"PASS [moderate_risk]: {result.risk}")


# ---------------------------------------------------------------------------
# Test 3 — High risk: shared benchmark scenario from the guide
# ---------------------------------------------------------------------------
async def test_high_risk():
    agent = RiskAgent()
    state = _make_state(
        journal_text="I haven't slept in 3 days and I can't handle this anymore",
        emotion=EmotionResult(
            mood="negative",
            mood_score=15,
            stress_score=91,
            anxiety_score=88,
            emotional_volatility=0.78,
        ),
        checkin=WellnessCheckin(sleep_hours=3, stress_level=9, mood_score=2, energy_level=2),
        typing_speed=182,
        pause_frequency=3,
        deletion_frequency=41,
        burst_typing=True,
        hour=3,
    )

    result = await agent.run(state)

    assert result.risk is not None
    assert result.risk.risk_level in ("high", "critical"), (
        f"Expected 'high' or 'critical' risk, got '{result.risk.risk_level}'"
    )
    assert result.risk.escalation_triggered is True, "Escalation must be triggered for high risk"
    assert result.monitoring_level in ("HIGH_ATTENTION", "CRITICAL"), (
        f"Expected HIGH_ATTENTION or CRITICAL monitoring, got '{result.monitoring_level}'"
    )
    print(f"PASS [high_risk]: {result.risk}")


# ---------------------------------------------------------------------------
# Test 4 — Critical / crisis: hard-coded safety override must fire
# ---------------------------------------------------------------------------
async def test_critical_crisis_language():
    agent = RiskAgent()
    state = _make_state(
        journal_text="I can't go on anymore. I want to end it all. There's no point.",
        emotion=EmotionResult(
            mood="negative",
            mood_score=5,
            stress_score=95,
            anxiety_score=92,
            emotional_volatility=0.9,
        ),
        typing_speed=50,
        pause_frequency=15,
        deletion_frequency=5,
        inactivity_duration_ms=30000,
        hour=2,
    )

    result = await agent.run(state)

    assert result.risk is not None
    assert result.risk.risk_level == "critical", (
        f"Crisis language must force 'critical', got '{result.risk.risk_level}'"
    )
    assert result.risk.escalation_triggered is True, "Crisis must always trigger escalation"
    assert "crisis_language" in result.risk.flags, (
        f"'crisis_language' flag must be set, got {result.risk.flags}"
    )
    assert result.monitoring_level == "CRITICAL", (
        f"Expected CRITICAL monitoring, got '{result.monitoring_level}'"
    )
    print(f"PASS [critical_crisis]: {result.risk}")


# ---------------------------------------------------------------------------
# Test 5 — Hard-coded crisis override bypasses LLM (unit test for the detector)
# ---------------------------------------------------------------------------
def test_crisis_language_detector():
    assert check_crisis_language("I want to end it all") is True
    assert check_crisis_language("I want to kill myself") is True
    assert check_crisis_language("I can't go on anymore") is True
    assert check_crisis_language("Having a good day, everything is fine") is False
    assert check_crisis_language("I feel stressed about my presentation") is False
    assert check_crisis_language("Exhausted but okay") is False
    print("PASS [crisis_language_detector]: all phrase checks passed")


# ---------------------------------------------------------------------------
# Test 6 — Multiple flags force escalation even at moderate level
# ---------------------------------------------------------------------------
async def test_multi_flag_escalation():
    """3+ flags should trigger escalation regardless of overall risk level."""
    agent = RiskAgent()
    state = _make_state(
        journal_text="Barely slept, feeling anxious, typing fast, can't focus.",
        emotion=EmotionResult(
            mood="negative",
            mood_score=30,
            stress_score=72,
            anxiety_score=82,
            emotional_volatility=0.65,
        ),
        checkin=WellnessCheckin(sleep_hours=3, stress_level=8, mood_score=3, energy_level=2),
        typing_speed=175,
        deletion_frequency=45,
        burst_typing=True,
        hour=4,
    )

    result = await agent.run(state)

    assert result.risk is not None
    # With sleep_deprivation + panic_indicators + emotional_overload/burnout_risk,
    # escalation should be triggered
    assert result.risk.escalation_triggered is True, (
        f"Expected escalation with multiple flags, got escalation={result.risk.escalation_triggered}, "
        f"flags={result.risk.flags}"
    )
    print(f"PASS [multi_flag_escalation]: {result.risk}")


if __name__ == "__main__":
    print("=" * 60)
    print("Running RiskAgent tests...")
    print("=" * 60)

    # Synchronous test first (no LLM call)
    try:
        test_crisis_language_detector()
    except AssertionError as e:
        print(f"FAIL [crisis_language_detector]: {e}")

    async_tests = [
        test_low_risk,
        test_moderate_risk,
        test_high_risk,
        test_critical_crisis_language,
        test_multi_flag_escalation,
    ]

    passed = 0
    failed = 0
    for test_fn in async_tests:
        try:
            asyncio.run(test_fn())
            passed += 1
        except AssertionError as e:
            print(f"FAIL [{test_fn.__name__}]: {e}")
            failed += 1
        except Exception as e:
            print(f"ERROR [{test_fn.__name__}]: {e}")
            failed += 1

    print("=" * 60)
    print(f"Results: {passed} passed, {failed} failed")
    if failed:
        sys.exit(1)
