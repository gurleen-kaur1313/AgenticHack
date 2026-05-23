from collections import Counter
from pathlib import Path
from statistics import mean
from typing import Any

from agents.base import BaseAgent
from models import OrchestrationState, ReflectionResult
from utils.llm import llm_call, parse_json_response


class ReflectionAgent(BaseAgent):
    """Generates a data-grounded behavioral insight from current and historical state."""

    name = "reflection"

    def __init__(self) -> None:
        prompt_path = Path(__file__).resolve().parents[1] / "prompts" / "reflection.txt"
        self.system_prompt = prompt_path.read_text()

    async def run(self, state: OrchestrationState) -> OrchestrationState:
        if state.emotion is None:
            raise ValueError("ReflectionAgent requires state.emotion to be populated")
        if state.risk is None:
            raise ValueError("ReflectionAgent requires state.risk to be populated")

        self.log("Generating behavioral reflection insight")
        user_prompt = self._build_user_prompt(state)

        try:
            raw = await llm_call(self.system_prompt, user_prompt)
            parsed = parse_json_response(raw)
        except Exception as exc:
            self.log(f"LLM unavailable, using deterministic reflection fallback: {exc}")
            parsed = self._fallback_reflection(state)

        state.reflection = ReflectionResult(**parsed)
        self.log("Result: reflection insight generated")
        return state

    def _build_user_prompt(self, state: OrchestrationState) -> str:
        assert state.emotion is not None
        assert state.risk is not None

        intervention = state.intervention.intervention if state.intervention else "none"
        sleep = f"{state.checkin.sleep_hours}h" if state.checkin else "not provided"
        history_section = self._format_history(state.history)
        trends = self._format_trends(state)

        return f"""CURRENT SESSION:
Stress: {state.emotion.stress_score} | Anxiety: {state.emotion.anxiety_score} | Mood: {state.emotion.mood_score}
Risk: {state.risk.risk_level} | Flags: {', '.join(state.risk.flags)}
Intervention deployed: {intervention}
Sleep: {sleep} | Time: {state.signal.client_timestamp}

{history_section}

{trends}"""

    def _format_history(self, history: list[dict]) -> str:
        if not history or len(history) < 2:
            return """HISTORICAL DATA:
This is the user's first session. No trend data available yet.
Provide an insight based on the current reading only.
Set trend_change to 'baseline established' and period to '0d'."""

        lines = ["HISTORICAL DATA:"]
        lines.append("Time              | Stress | Anxiety | Mood | Risk")
        lines.append("-" * 55)
        for item in history[-10:]:
            lines.append(
                f"{str(item.get('timestamp', '?')):18s} | "
                f"{item.get('stress_score', '?'):6} | "
                f"{item.get('anxiety_score', '?'):7} | "
                f"{item.get('mood_score', '?'):4} | "
                f"{item.get('risk_level', '?')}"
            )

        if len(history) >= 3:
            recent_stress = [self._to_number(item.get("stress_score")) for item in history[-3:]]
            recent_stress = [score for score in recent_stress if score is not None]
            if recent_stress:
                avg = sum(recent_stress) / len(recent_stress)
                current = recent_stress[-1]
                direction = "rising" if current > avg else "falling" if current < avg else "stable"
                lines.append(f"\nStress trend: {direction} (avg={avg:.0f}, current={current:.0f})")

        return "\n".join(lines)

    def _format_trends(self, state: OrchestrationState) -> str:
        assert state.emotion is not None

        if not state.history:
            return """TRENDS:
Stress: baseline -> current
Anxiety: baseline -> current
Mood: baseline -> current
Most common risk level: none yet
Most deployed intervention: none yet"""

        recent = state.history[-5:]
        avg_stress = self._average(recent, "stress_score")
        avg_anxiety = self._average(recent, "anxiety_score")
        avg_mood = self._average(recent, "mood_score")
        mode_risk = self._mode([str(item.get("risk_level")) for item in state.history if item.get("risk_level")])
        mode_intervention = self._mode(
            [str(item.get("intervention_type")) for item in state.history if item.get("intervention_type")]
        )

        return f"""TRENDS:
Stress: {self._format_avg(avg_stress)} -> {state.emotion.stress_score} ({self._direction(avg_stress, state.emotion.stress_score)})
Anxiety: {self._format_avg(avg_anxiety)} -> {state.emotion.anxiety_score} ({self._direction(avg_anxiety, state.emotion.anxiety_score)})
Mood: {self._format_avg(avg_mood)} -> {state.emotion.mood_score} ({self._direction(avg_mood, state.emotion.mood_score)})
Most common risk level: {mode_risk or 'unknown'}
Most deployed intervention: {mode_intervention or 'none'}"""

    def _fallback_reflection(self, state: OrchestrationState) -> dict[str, Any]:
        assert state.emotion is not None
        assert state.risk is not None

        if not state.history or len(state.history) < 2:
            sleep_context = (
                f" with {state.checkin.sleep_hours} hours of sleep"
                if state.checkin
                else ""
            )
            return {
                "insight": (
                    f"This session establishes a baseline: stress is {state.emotion.stress_score}/100, "
                    f"anxiety is {state.emotion.anxiety_score}/100, and mood is {state.emotion.mood_score}/100"
                    f"{sleep_context}. Use the next check-ins to compare whether sleep and typing patterns change these scores."
                ),
                "trend_change": "baseline established",
                "period": "0d",
                "recommendations": [
                    "Complete one more check-in after your next work block to establish a comparison point",
                    "Note sleep hours in the next session so stress changes can be compared against rest",
                ],
            }

        avg_stress = self._average(state.history[-5:], "stress_score")
        avg_anxiety = self._average(state.history[-5:], "anxiety_score")
        avg_mood = self._average(state.history[-5:], "mood_score")
        stress_change = self._percent_change(avg_stress, state.emotion.stress_score)
        anxiety_change = self._percent_change(avg_anxiety, state.emotion.anxiety_score)

        if stress_change is not None and abs(stress_change) >= abs(anxiety_change or 0):
            direction = "increase" if stress_change >= 0 else "decrease"
            trend_change = f"{stress_change:+.0f}% stress {direction} over recent sessions"
            insight = (
                f"Current stress is {state.emotion.stress_score}/100 versus a recent average of "
                f"{avg_stress:.0f}/100, while risk is {state.risk.risk_level}; use the deployed "
                "intervention before the next high-focus task to test whether the spike comes down."
            )
        else:
            anxiety_change = anxiety_change or 0
            direction = "increase" if anxiety_change >= 0 else "improvement"
            trend_change = f"{anxiety_change:+.0f}% anxiety {direction} over recent sessions"
            insight = (
                f"Current anxiety is {state.emotion.anxiety_score}/100 versus a recent average of "
                f"{avg_anxiety:.0f}/100, while mood is {state.emotion.mood_score}/100; a brief reset "
                "before continuing may help stabilize the session."
            )

        recommendations = [
            "Run the selected intervention now and re-check stress in 10 minutes",
            "Track sleep hours tonight to test whether tomorrow's stress returns toward baseline",
        ]
        if avg_mood is not None and state.emotion.mood_score > avg_mood:
            recommendations[1] = "Repeat the conditions from this session that coincided with improved mood"

        return {
            "insight": insight,
            "trend_change": trend_change,
            "period": "7d",
            "recommendations": recommendations,
        }

    @staticmethod
    def _to_number(value: Any) -> float | None:
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    def _average(self, history: list[dict], key: str) -> float | None:
        values = [self._to_number(item.get(key)) for item in history]
        values = [value for value in values if value is not None]
        return mean(values) if values else None

    @staticmethod
    def _mode(values: list[str]) -> str | None:
        if not values:
            return None
        return Counter(values).most_common(1)[0][0]

    @staticmethod
    def _format_avg(value: float | None) -> str:
        return "unknown" if value is None else f"{value:.0f}"

    @staticmethod
    def _direction(previous: float | None, current: int) -> str:
        if previous is None:
            return "baseline"
        if current > previous:
            return "rising"
        if current < previous:
            return "falling"
        return "stable"

    @staticmethod
    def _percent_change(previous: float | None, current: int) -> float | None:
        if previous is None or previous == 0:
            return None
        return ((current - previous) / previous) * 100
