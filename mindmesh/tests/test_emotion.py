"""
Tests for EmotionAgent.

Run from the mindmesh/ directory:
    python tests/test_emotion.py

Requires OPENAI_API_KEY set in .env or environment.
"""

import asyncio
import sys
import os

# Allow running from the mindmesh/ directory directly
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime

from agents.emotion import EmotionAgent
from models import BehavioralSignal, OrchestrationState, WellnessCheckin


# ---------------------------------------------------------------------------
# Test 1 — High stress / crisis scenario (the shared benchmark from the guide)
# ---------------------------------------------------------------------------
async def test_high_stress():
    """3AM entry, fast+erratic typing, burnout language → high stress, negative mood."""
    agent = EmotionAgent()
    state = OrchestrationState(
        session_id="test-high-stress",
        signal=BehavioralSignal(
            journal_text="I haven't slept in 3 days and I can't handle this anymore",
            typing_speed=182,
            pause_frequency=3,
            deletion_frequency=41,
            inactivity_duration_ms=800,
            burst_typing=True,
            client_timestamp=datetime(2026, 5, 23, 3, 12, 0),
        ),
        checkin=WellnessCheckin(
            sleep_hours=3,
            stress_level=9,
            mood_score=2,
            energy_level=2,
        ),
    )

    result = await agent.run(state)

    assert result.emotion is not None, "EmotionResult should be set"
    assert result.emotion.mood == "negative", (
        f"Expected 'negative' mood, got '{result.emotion.mood}'"
    )
    assert result.emotion.stress_score >= 70, (
        f"Expected stress_score >= 70, got {result.emotion.stress_score}"
    )
    assert result.emotion.anxiety_score >= 60, (
        f"Expected anxiety_score >= 60, got {result.emotion.anxiety_score}"
    )
    print(f"PASS [high_stress]: {result.emotion}")


# ---------------------------------------------------------------------------
# Test 2 — Neutral / moderate scenario
# ---------------------------------------------------------------------------
async def test_neutral_workday():
    """Mid-afternoon normal work entry → neutral or mild negative, moderate scores."""
    agent = EmotionAgent()
    state = OrchestrationState(
        session_id="test-neutral",
        signal=BehavioralSignal(
            journal_text="Busy day at work. Had a few meetings, finished a report. "
                         "Feeling a bit tired but overall okay.",
            typing_speed=95,
            pause_frequency=5,
            deletion_frequency=12,
            inactivity_duration_ms=3000,
            burst_typing=False,
            client_timestamp=datetime(2026, 5, 23, 16, 30, 0),
        ),
    )

    result = await agent.run(state)

    assert result.emotion is not None
    assert result.emotion.mood in ("neutral", "negative"), (
        f"Expected 'neutral' or mild 'negative', got '{result.emotion.mood}'"
    )
    assert result.emotion.stress_score <= 65, (
        f"Expected stress_score <= 65, got {result.emotion.stress_score}"
    )
    print(f"PASS [neutral_workday]: {result.emotion}")


# ---------------------------------------------------------------------------
# Test 3 — Positive / low stress scenario
# ---------------------------------------------------------------------------
async def test_positive_mood():
    """Evening after a good day → positive mood, low stress and anxiety."""
    agent = EmotionAgent()
    state = OrchestrationState(
        session_id="test-positive",
        signal=BehavioralSignal(
            journal_text="Had an amazing day! Finished the project, went for a run, "
                         "and caught up with old friends over dinner. Feeling really grateful.",
            typing_speed=110,
            pause_frequency=2,
            deletion_frequency=5,
            inactivity_duration_ms=1500,
            burst_typing=False,
            client_timestamp=datetime(2026, 5, 23, 21, 0, 0),
        ),
        checkin=WellnessCheckin(
            sleep_hours=8,
            stress_level=2,
            mood_score=9,
            energy_level=8,
        ),
    )

    result = await agent.run(state)

    assert result.emotion is not None
    assert result.emotion.mood == "positive", (
        f"Expected 'positive' mood, got '{result.emotion.mood}'"
    )
    assert result.emotion.stress_score <= 40, (
        f"Expected stress_score <= 40, got {result.emotion.stress_score}"
    )
    assert result.emotion.mood_score >= 60, (
        f"Expected mood_score >= 60, got {result.emotion.mood_score}"
    )
    print(f"PASS [positive_mood]: {result.emotion}")


# ---------------------------------------------------------------------------
# Test 4 — Panic / burst typing scenario
# ---------------------------------------------------------------------------
async def test_acute_anxiety():
    """Late-night rapid entry with high deletion rate → high anxiety, high volatility."""
    agent = EmotionAgent()
    state = OrchestrationState(
        session_id="test-anxiety",
        signal=BehavioralSignal(
            journal_text="I can't focus. Everything is spinning. I keep making mistakes "
                         "and I don't know what to do. My heart is racing.",
            typing_speed=195,
            pause_frequency=1,
            deletion_frequency=55,
            inactivity_duration_ms=200,
            burst_typing=True,
            client_timestamp=datetime(2026, 5, 23, 1, 45, 0),
        ),
    )

    result = await agent.run(state)

    assert result.emotion is not None
    assert result.emotion.mood == "negative"
    assert result.emotion.anxiety_score >= 70, (
        f"Expected anxiety_score >= 70, got {result.emotion.anxiety_score}"
    )
    assert result.emotion.emotional_volatility >= 0.5, (
        f"Expected emotional_volatility >= 0.5, got {result.emotion.emotional_volatility}"
    )
    print(f"PASS [acute_anxiety]: {result.emotion}")


# ---------------------------------------------------------------------------
# Test 5 — History-aware scenario (previous stress in context)
# ---------------------------------------------------------------------------
async def test_with_history():
    """Agent should factor in rising stress history when it's provided."""
    agent = EmotionAgent()
    state = OrchestrationState(
        session_id="test-history",
        signal=BehavioralSignal(
            journal_text="Still not sleeping well. The pressure keeps building.",
            typing_speed=140,
            pause_frequency=6,
            deletion_frequency=22,
            inactivity_duration_ms=4000,
            burst_typing=False,
            client_timestamp=datetime(2026, 5, 23, 2, 30, 0),
        ),
        history=[
            {"stress_score": 65, "risk_level": "moderate"},
            {"stress_score": 72, "risk_level": "moderate"},
            {"stress_score": 80, "risk_level": "high"},
        ],
    )

    result = await agent.run(state)

    assert result.emotion is not None
    assert result.emotion.mood in ("negative", "neutral")
    assert result.emotion.stress_score >= 60, (
        f"Expected stress_score >= 60 given rising history, got {result.emotion.stress_score}"
    )
    print(f"PASS [with_history]: {result.emotion}")


if __name__ == "__main__":
    print("=" * 60)
    print("Running EmotionAgent tests...")
    print("=" * 60)

    tests = [
        test_high_stress,
        test_neutral_workday,
        test_positive_mood,
        test_acute_anxiety,
        test_with_history,
    ]

    passed = 0
    failed = 0
    for test_fn in tests:
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
