from agents.base import BaseAgent
from models import EmotionResult, OrchestrationState


class EmotionAgent(BaseAgent):
    """Stub emotion agent — replace with LLM-backed implementation (Person 2)."""

    name = "emotion"

    async def run(self, state: OrchestrationState) -> OrchestrationState:
        state.emotion = EmotionResult(
            mood="negative",
            mood_score=25,
            stress_score=85,
            anxiety_score=78,
            emotional_volatility=0.7,
        )
        self.log(f"Stub result: stress={state.emotion.stress_score}")
        return state
