import os

from agents.base import BaseAgent
from models import EmotionResult, OrchestrationState
from utils.llm import llm_call, parse_json_response


class EmotionAgent(BaseAgent):
    """Analyzes emotional state from journal text and behavioral signals."""

    name = "emotion"

    def __init__(self) -> None:
        prompt_path = os.path.join(os.path.dirname(__file__), "..", "prompts", "emotion.txt")
        with open(prompt_path) as f:
            self.system_prompt = f.read()

    async def run(self, state: OrchestrationState) -> OrchestrationState:
        self.log("Analyzing emotional state...")

        signal = state.signal
        user_prompt = f"""JOURNAL ENTRY:
{signal.journal_text}

BEHAVIORAL SIGNALS:
- Typing speed: {signal.typing_speed} chars/min
- Pause frequency: {signal.pause_frequency}
- Deletion frequency: {signal.deletion_frequency}
- Inactivity duration: {signal.inactivity_duration_ms}ms
- Burst typing: {signal.burst_typing}
- Entry time: {signal.client_timestamp.strftime('%I:%M %p')}"""

        if state.checkin:
            user_prompt += f"""

WELLNESS CHECK-IN:
- Sleep: {state.checkin.sleep_hours}h
- Stress: {state.checkin.stress_level}/10
- Mood: {state.checkin.mood_score}/10
- Energy: {state.checkin.energy_level}/10"""

        if state.history:
            recent = state.history[-3:]
            scores = [str(h.get("stress_score", "?")) for h in recent]
            user_prompt += f"""

RECENT HISTORY:
- Last stress scores: {', '.join(scores)}"""

        raw = await llm_call(self.system_prompt, user_prompt)
        parsed = parse_json_response(raw)

        state.emotion = EmotionResult(**parsed)
        self.log(
            f"Result: mood={state.emotion.mood}, "
            f"stress={state.emotion.stress_score}, "
            f"anxiety={state.emotion.anxiety_score}"
        )
        return state
