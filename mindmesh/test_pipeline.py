import asyncio
from datetime import datetime

from models import BehavioralSignal, WellnessCheckin
from orchestrator.graph import pipeline


async def test() -> None:
    state = {
        "session_id": "test-001",
        "signal": BehavioralSignal(
            journal_text="I haven't slept in 3 days and I can't handle this anymore",
            typing_speed=182,
            pause_frequency=3,
            deletion_frequency=41,
            inactivity_duration_ms=800,
            burst_typing=True,
            client_timestamp=datetime.now(),
        ),
        "checkin": WellnessCheckin(
            sleep_hours=3,
            stress_level=9,
            mood_score=2,
            energy_level=2,
        ),
        "monitoring_level": "NORMAL",
        "history": [],
    }

    result = await pipeline.ainvoke(state)
    emotion = result["emotion"]
    risk = result["risk"]
    intervention = result.get("intervention")
    reflection = result["reflection"]

    print("\n=== PIPELINE RESULT ===")
    print(f"Emotion: stress={emotion['stress_score']}, anxiety={emotion['anxiety_score']}")
    print(f"Risk: {risk['risk_level']}, escalation={risk['escalation_triggered']}")
    if intervention:
        print(f"Intervention: {intervention['intervention']}")
    print(f"Insight: {reflection['insight']}")
    print(f"Monitoring: {result['monitoring_level']}")


if __name__ == "__main__":
    asyncio.run(test())
