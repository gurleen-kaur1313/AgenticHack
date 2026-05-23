from agents.base import BaseAgent
from models import InterventionResult, OrchestrationState


class InterventionAgent(BaseAgent):
    """Stub intervention agent — replace with LLM-backed implementation (Person 3)."""

    name = "intervention"

    async def run(self, state: OrchestrationState) -> OrchestrationState:
        state.intervention = InterventionResult(
            intervention="box_breathing_grounding",
            workflow=[
                "box_breathing_4_4_4_4",
                "five_senses_grounding",
                "hydration_reminder",
            ],
            duration="2 minutes",
            follow_up="scheduled",
            priority="immediate",
        )
        self.log(f"Stub result: intervention={state.intervention.intervention}")
        return state
