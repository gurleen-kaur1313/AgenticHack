from agents.base import BaseAgent
from models import OrchestrationState, RiskResult


class RiskAgent(BaseAgent):
    """Stub risk agent — replace with LLM-backed implementation (Person 2)."""

    name = "risk"

    async def run(self, state: OrchestrationState) -> OrchestrationState:
        state.risk = RiskResult(
            risk_level="high",
            escalation_triggered=True,
            confidence=0.88,
            flags=["burnout_risk", "sleep_deprivation"],
        )
        self.log(f"Stub result: risk={state.risk.risk_level}")
        return state
