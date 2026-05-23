from agents.base import BaseAgent
from models import OrchestrationState, ReflectionResult


class ReflectionAgent(BaseAgent):
    """Stub reflection agent — replace with LLM-backed implementation (Person 3)."""

    name = "reflection"

    async def run(self, state: OrchestrationState) -> OrchestrationState:
        state.reflection = ReflectionResult(
            insight=(
                "Sleep deprivation appears strongly correlated with elevated stress "
                "and anxiety scores across recent sessions."
            ),
            trend_change="+22% stress increase over 7d",
            period="7d",
            recommendations=[
                "Prioritize a 7-hour sleep window tonight",
                "Schedule a 10-minute wind-down before bed",
                "Re-check stress levels after 48 hours of improved sleep",
            ],
        )
        self.log("Stub result: reflection insight generated")
        return state
