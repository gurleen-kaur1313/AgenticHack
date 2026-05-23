import os

from agents.base import BaseAgent
from models import OrchestrationState, RiskResult
from utils.llm import llm_call, parse_json_response

CRISIS_PHRASES = [
    "can't go on",
    "end it",
    "no point",
    "better off without me",
    "want to die",
    "kill myself",
    "self-harm",
    "hurt myself",
    "not worth living",
    "give up on everything",
    "end it all",
    "want to end",
    "don't want to be here",
    "rather be dead",
]

_MONITORING_MAP = {
    "critical": "CRITICAL",
    "high": "HIGH_ATTENTION",
    "moderate": "ELEVATED",
    "low": "NORMAL",
}


def check_crisis_language(text: str) -> bool:
    """Rule-based crisis language detector. Never delegated to the LLM."""
    text_lower = text.lower()
    return any(phrase in text_lower for phrase in CRISIS_PHRASES)


class RiskAgent(BaseAgent):
    """Classifies wellness risk level from emotion scores and behavioral signals."""

    name = "risk"

    def __init__(self) -> None:
        prompt_path = os.path.join(os.path.dirname(__file__), "..", "prompts", "risk.txt")
        with open(prompt_path) as f:
            self.system_prompt = f.read()

    async def run(self, state: OrchestrationState) -> OrchestrationState:
        self.log("Assessing risk level...")

        emotion = state.emotion
        signal = state.signal

        user_prompt = f"""EMOTIONAL ANALYSIS:
- Mood: {emotion.mood} (score: {emotion.mood_score}/100)
- Stress score: {emotion.stress_score}/100
- Anxiety score: {emotion.anxiety_score}/100
- Emotional volatility: {emotion.emotional_volatility:.2f}

BEHAVIORAL SIGNALS:
- Journal text: {signal.journal_text}
- Typing speed: {signal.typing_speed} chars/min
- Pause frequency: {signal.pause_frequency}
- Deletion frequency: {signal.deletion_frequency}
- Burst typing: {signal.burst_typing}
- Entry time: {signal.client_timestamp.strftime('%I:%M %p')}"""

        if state.checkin:
            user_prompt += f"""

WELLNESS CHECK-IN:
- Sleep: {state.checkin.sleep_hours}h
- Energy: {state.checkin.energy_level}/10"""

        if state.history:
            recent_risks = [h.get("risk_level", "?") for h in state.history[-5:]]
            user_prompt += f"""

RECENT RISK HISTORY:
- Last risk levels: {', '.join(recent_risks)}"""

        raw = await llm_call(self.system_prompt, user_prompt)
        parsed = parse_json_response(raw)

        risk_level: str = parsed.get("risk_level", "low")
        escalation: bool = parsed.get("escalation_triggered", False)
        confidence: float = float(parsed.get("confidence", 0.5))
        flags: list[str] = parsed.get("flags", [])

        # Hard-coded safety override — never trust LLM alone for crisis detection
        if check_crisis_language(signal.journal_text):
            if "crisis_language" not in flags:
                flags.append("crisis_language")
            risk_level = "critical"
            escalation = True
            self.log("CRISIS LANGUAGE detected — forcing critical risk")

        # Additional hard-coded escalation rules
        if len(flags) >= 3:
            escalation = True
        if risk_level in ("high", "critical"):
            escalation = True

        state.risk = RiskResult(
            risk_level=risk_level,
            escalation_triggered=escalation,
            confidence=confidence,
            flags=flags,
        )

        # Rule-based monitoring level update — not delegated to LLM
        state.monitoring_level = _MONITORING_MAP.get(risk_level, "NORMAL")

        self.log(
            f"Result: risk={state.risk.risk_level}, "
            f"escalation={state.risk.escalation_triggered}, "
            f"flags={state.risk.flags}, "
            f"monitoring={state.monitoring_level}"
        )
        return state
