from models import (
    BehavioralSignal,
    EmotionResult,
    InterventionResult,
    OrchestrationState,
    ReflectionResult,
    RiskResult,
    WellnessCheckin,
)


def to_orchestration_state(state: dict) -> OrchestrationState:
    """Normalize LangGraph dict state into OrchestrationState."""
    signal = state["signal"]
    if isinstance(signal, dict):
        signal = BehavioralSignal(**signal)

    checkin = state.get("checkin")
    if isinstance(checkin, dict):
        checkin = WellnessCheckin(**checkin)

    emotion = state.get("emotion")
    if isinstance(emotion, dict):
        emotion = EmotionResult(**emotion)

    risk = state.get("risk")
    if isinstance(risk, dict):
        risk = RiskResult(**risk)

    intervention = state.get("intervention")
    if isinstance(intervention, dict):
        intervention = InterventionResult(**intervention)

    reflection = state.get("reflection")
    if isinstance(reflection, dict):
        reflection = ReflectionResult(**reflection)

    return OrchestrationState(
        session_id=state["session_id"],
        signal=signal,
        checkin=checkin,
        monitoring_level=state.get("monitoring_level", "NORMAL"),
        emotion=emotion,
        risk=risk,
        intervention=intervention,
        reflection=reflection,
        history=state.get("history", []),
    )


def from_orchestration_state(state: OrchestrationState) -> dict:
    """Serialize OrchestrationState for LangGraph."""
    return state.model_dump()
