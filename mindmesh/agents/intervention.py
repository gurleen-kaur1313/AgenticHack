from pathlib import Path
from typing import Any

from agents.base import BaseAgent
from models import InterventionResult, OrchestrationState
from utils.llm import llm_call, parse_json_response


CRISIS_RESPONSE = InterventionResult(
    intervention="crisis_resources",
    workflow=[
        "988 Suicide & Crisis Lifeline: call or text 988",
        "Crisis Text Line: text HOME to 741741",
        "Please reach out to a trusted person or professional",
    ],
    duration="immediate",
    follow_up="scheduled",
    priority="immediate",
)


class InterventionAgent(BaseAgent):
    """Plans actionable wellness interventions from emotion and risk results."""

    name = "intervention"

    def __init__(self) -> None:
        prompt_path = Path(__file__).resolve().parents[1] / "prompts" / "intervention.txt"
        self.system_prompt = prompt_path.read_text()

    async def run(self, state: OrchestrationState) -> OrchestrationState:
        if state.risk is None:
            raise ValueError("InterventionAgent requires state.risk to be populated")
        if state.emotion is None:
            raise ValueError("InterventionAgent requires state.emotion to be populated")

        self.log(f"Planning intervention for risk={state.risk.risk_level}")

        # SAFETY GATE: hard-coded, never bypassed by the model.
        if state.risk.risk_level == "critical" or "crisis_language" in state.risk.flags:
            self.log("CRISIS detected — returning professional resources")
            state.intervention = CRISIS_RESPONSE
            return state

        user_prompt = self._build_user_prompt(state)

        try:
            raw = await llm_call(self.system_prompt, user_prompt)
            parsed = parse_json_response(raw)
        except Exception as exc:
            self.log(f"LLM unavailable, using deterministic planner fallback: {exc}")
            parsed = self._fallback_plan(state)

        state.intervention = self._normalize_result(parsed, state)
        self.log(
            f"Result: {state.intervention.intervention}, "
            f"priority={state.intervention.priority}"
        )
        return state

    def _build_user_prompt(self, state: OrchestrationState) -> str:
        assert state.risk is not None
        assert state.emotion is not None

        user_prompt = f"""RISK ASSESSMENT:
Risk level: {state.risk.risk_level}
Flags: {', '.join(state.risk.flags)}
Confidence: {state.risk.confidence}

EMOTIONAL STATE:
Stress: {state.emotion.stress_score}/100
Anxiety: {state.emotion.anxiety_score}/100
Mood: {state.emotion.mood} ({state.emotion.mood_score}/100)
Volatility: {state.emotion.emotional_volatility}

CONTEXT:
Time of day: {state.signal.client_timestamp}"""

        if state.checkin:
            user_prompt += f"""
Sleep hours: {state.checkin.sleep_hours}
Energy level: {state.checkin.energy_level}/10"""

        return user_prompt

    def _fallback_plan(self, state: OrchestrationState) -> dict[str, Any]:
        assert state.risk is not None
        assert state.emotion is not None

        flags = set(state.risk.flags)
        workflow: list[str] = []

        if "panic_indicators" in flags or state.emotion.anxiety_score >= 85:
            workflow.append("box_breathing")
        if "emotional_overload" in flags or "burnout_risk" in flags or state.emotion.stress_score >= 80:
            workflow.append("grounding_exercise")
        if "negative_thought_spiral" in flags or "catastrophizing" in flags:
            workflow.append("cbt_reframing")
        if "sleep_deprivation" in flags:
            workflow.append("sleep_recovery")
        if not workflow:
            workflow.append("journaling_prompt" if state.risk.risk_level == "moderate" else "mindfulness_prompt")

        workflow = self._dedupe(workflow)[:3]
        primary = workflow[0]
        priority = self._priority_for_risk(state.risk.risk_level)
        follow_up = "scheduled" if priority in {"immediate", "suggested"} else "none"

        return {
            "intervention": primary,
            "workflow": workflow,
            "duration": self._estimate_duration(workflow),
            "follow_up": follow_up,
            "priority": priority,
        }

    def _normalize_result(self, parsed: dict[str, Any], state: OrchestrationState) -> InterventionResult:
        assert state.risk is not None

        workflow = parsed.get("workflow") or [parsed.get("intervention") or "mindfulness_prompt"]
        workflow = [str(step) for step in workflow if step]

        flags = set(state.risk.flags)
        if "panic_indicators" in flags and (not workflow or workflow[0] != "box_breathing"):
            workflow = ["box_breathing", *[step for step in workflow if step != "box_breathing"]]
        if "sleep_deprivation" in flags and "sleep_recovery" not in workflow:
            workflow.append("sleep_recovery")

        workflow = self._dedupe(workflow)[:3]
        if not workflow:
            workflow = ["mindfulness_prompt"]

        priority = str(parsed.get("priority") or self._priority_for_risk(state.risk.risk_level))
        if priority not in {"immediate", "suggested", "optional"}:
            priority = self._priority_for_risk(state.risk.risk_level)

        follow_up = str(parsed.get("follow_up") or ("scheduled" if priority != "optional" else "none"))
        if follow_up not in {"scheduled", "none"}:
            follow_up = "scheduled" if priority != "optional" else "none"

        return InterventionResult(
            intervention=str(parsed.get("intervention") or workflow[0]),
            workflow=workflow,
            duration=str(parsed.get("duration") or self._estimate_duration(workflow)),
            follow_up=follow_up,
            priority=priority,
        )

    @staticmethod
    def _priority_for_risk(risk_level: str) -> str:
        if risk_level == "high":
            return "immediate"
        if risk_level == "moderate":
            return "suggested"
        return "optional"

    @staticmethod
    def _dedupe(items: list[str]) -> list[str]:
        seen: set[str] = set()
        deduped: list[str] = []
        for item in items:
            if item not in seen:
                seen.add(item)
                deduped.append(item)
        return deduped

    @staticmethod
    def _estimate_duration(workflow: list[str]) -> str:
        minutes_by_step = {
            "box_breathing": 3,
            "grounding_exercise": 4,
            "cbt_reframing": 7,
            "journaling_prompt": 8,
            "sleep_recovery": 15,
            "mindfulness_prompt": 4,
        }
        total = sum(minutes_by_step.get(step, 5) for step in workflow)
        return f"{total} minutes"
