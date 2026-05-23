from models import OrchestrationState


def should_intervene(state: dict) -> str:
    risk = state.get("risk")
    if not risk:
        return "skip"
    risk_level = risk["risk_level"] if isinstance(risk, dict) else risk.risk_level
    if risk_level in ("moderate", "high", "critical"):
        return "intervene"
    return "skip"


def update_monitoring_level(state: OrchestrationState) -> OrchestrationState:
    if not state.risk:
        return state

    risk_level = state.risk.risk_level
    if risk_level == "critical":
        state.monitoring_level = "CRITICAL"
    elif risk_level == "high":
        state.monitoring_level = "HIGH_ATTENTION"
    elif risk_level == "moderate":
        state.monitoring_level = "ELEVATED"
    else:
        state.monitoring_level = "NORMAL"
    return state
