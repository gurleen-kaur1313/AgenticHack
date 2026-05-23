# MindMesh — Core System Implementation Guide

## Split Strategy: 3 People, Build the Brain First

The core system has three natural layers that can be built simultaneously. UI and sponsor integrations come later — this guide is about getting the autonomous pipeline working end-to-end.

```
Person 1: Infrastructure & Orchestration
         (the skeleton everything plugs into)

Person 2: Emotion Analysis Agent + Risk Detection Agent
         (the sensing layer — understands what's happening)

Person 3: Intervention Planner Agent + Reflection Agent
         (the action layer — decides what to do about it)
```

---

## Pre-Work: 20 Minutes Together

Before splitting, agree on these contracts. Print them out or pin them in your group chat. Every piece of code references these shapes.

### Shared State Object

This is the single object that flows through the entire pipeline. Everyone reads from it, everyone writes to it.

```python
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class BehavioralSignal(BaseModel):
    journal_text: str
    typing_speed: int          # chars per minute
    pause_frequency: int       # pauses > 2s
    deletion_frequency: int    # backspace count
    inactivity_duration_ms: int
    burst_typing: bool
    client_timestamp: datetime

class WellnessCheckin(BaseModel):
    sleep_hours: int           # 0-12
    stress_level: int          # 1-10
    mood_score: int            # 1-10
    energy_level: int          # 1-10

class EmotionResult(BaseModel):
    mood: str                  # "negative" | "neutral" | "positive"
    mood_score: int            # 0-100
    stress_score: int          # 0-100
    anxiety_score: int         # 0-100
    emotional_volatility: float  # 0.0-1.0

class RiskResult(BaseModel):
    risk_level: str            # "low" | "moderate" | "high" | "critical"
    escalation_triggered: bool
    confidence: float          # 0.0-1.0
    flags: list[str]           # e.g. ["burnout_risk", "sleep_deprivation"]

class InterventionResult(BaseModel):
    intervention: str          # primary intervention name
    workflow: list[str]        # ordered list of steps
    duration: str              # e.g. "2 minutes"
    follow_up: str             # "scheduled" | "none"
    priority: str              # "immediate" | "suggested" | "optional"

class ReflectionResult(BaseModel):
    insight: str               # main insight text
    trend_change: str          # e.g. "+22% stress increase"
    period: str                # e.g. "7d"
    recommendations: list[str]

class OrchestrationState(BaseModel):
    session_id: str
    signal: BehavioralSignal
    checkin: Optional[WellnessCheckin] = None
    monitoring_level: str = "NORMAL"  # NORMAL | ELEVATED | HIGH_ATTENTION | CRITICAL
    emotion: Optional[EmotionResult] = None
    risk: Optional[RiskResult] = None
    intervention: Optional[InterventionResult] = None
    reflection: Optional[ReflectionResult] = None
    history: list[dict] = []   # rolling window of past events
```

### Project Structure

Agree on this folder layout so imports work across everyone's code:

```
mindmesh/
├── main.py                    # Person 1 owns
├── models.py                  # Shared — copy the contracts above
├── orchestrator/
│   ├── graph.py               # Person 1 owns
│   ├── state.py               # Person 1 owns
│   └── router.py              # Person 1 owns
├── agents/
│   ├── base.py                # Person 1 owns (base class)
│   ├── emotion.py             # Person 2 owns
│   ├── risk.py                # Person 2 owns
│   ├── intervention.py        # Person 3 owns
│   └── reflection.py          # Person 3 owns
├── prompts/
│   ├── emotion.txt            # Person 2 owns
│   ├── risk.txt               # Person 2 owns
│   ├── intervention.txt       # Person 3 owns
│   └── reflection.txt         # Person 3 owns
├── utils/
│   ├── llm.py                 # Person 1 owns (shared LLM caller)
│   └── history.py             # Person 1 owns (history management)
├── tests/
│   ├── test_emotion.py        # Person 2
│   ├── test_risk.py           # Person 2
│   ├── test_intervention.py   # Person 3
│   └── test_reflection.py     # Person 3
└── requirements.txt           # Person 1 sets up
```

### Test Input for Everyone

Everyone tests against this same scenario:

```python
TEST_SIGNAL = BehavioralSignal(
    journal_text="I haven't slept in 3 days and I can't handle this anymore",
    typing_speed=182,
    pause_frequency=3,
    deletion_frequency=41,
    inactivity_duration_ms=800,
    burst_typing=True,
    client_timestamp=datetime(2026, 5, 23, 3, 12, 0)
)

TEST_CHECKIN = WellnessCheckin(
    sleep_hours=3,
    stress_level=9,
    mood_score=2,
    energy_level=2
)
```

Expected flow for this input: high stress scores → high risk with escalation → immediate intervention (box breathing + grounding) → insight about sleep-stress correlation.

---

## Person 1 — Infrastructure, Orchestration & LLM Utility

### What You Own

You build the skeleton that Person 2 and Person 3 plug their agents into. You also provide the shared LLM calling utility so nobody has to deal with API boilerplate.

### Why You Go First

You should have the scaffold, the base agent class, and the LLM utility committed within the first 30-45 minutes. Person 2 and 3 depend on your base class and LLM caller to start writing real agent code. Until then, they can write their prompts and tests.

---

### Task 1.1 — Project Setup & Dependencies

```bash
mkdir mindmesh && cd mindmesh
python -m venv venv && source venv/bin/activate

pip install fastapi uvicorn websockets langchain langgraph \
    openai pydantic python-dotenv
```

Create `.env`:

```
OPENAI_API_KEY=sk-...
MODEL_NAME=gpt-4o
# Or for local: OLLAMA_BASE_URL=http://localhost:11434
```

Create `models.py` with the shared contracts above. Commit immediately — Person 2 and 3 need this file.

---

### Task 1.2 — Shared LLM Caller

Build `utils/llm.py` — a single function everyone's agents call. This keeps API key handling, model selection, and error handling in one place.

```
llm_call(system_prompt: str, user_prompt: str) -> str
        ↓
    Load model config from env
        ↓
    Call OpenAI API (or Ollama)
        ↓
    Return raw text response
        ↓
    On error: retry once, then raise with clear message
```

Implementation details:

```python
import openai
import os
import json
from dotenv import load_dotenv

load_dotenv()

client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
MODEL = os.getenv("MODEL_NAME", "gpt-4o")

async def llm_call(system_prompt: str, user_prompt: str) -> str:
    """Shared LLM caller. All agents use this."""
    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        temperature=0.3,
        response_format={"type": "json_object"}
    )
    return response.choices[0].message.content

def parse_json_response(raw: str) -> dict:
    """Safely parse LLM JSON output. Strips markdown fences if present."""
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1]  # remove first line
        cleaned = cleaned.rsplit("```", 1)[0]  # remove last fence
    return json.loads(cleaned)
```

Commit this early. Person 2 and 3 import `llm_call` and `parse_json_response` directly.

---

### Task 1.3 — Base Agent Class

Build `agents/base.py` — defines the interface every agent follows.

```python
from abc import ABC, abstractmethod
from models import OrchestrationState

class BaseAgent(ABC):
    """Base class for all MindMesh agents."""

    name: str = "base"

    @abstractmethod
    async def run(self, state: OrchestrationState) -> OrchestrationState:
        """
        Receive current state, do work, update state, return it.
        Each agent reads what it needs from state and writes
        its result back onto state.
        """
        pass

    def log(self, message: str):
        """Simple logging — replace with Datadog later."""
        print(f"[{self.name}] {message}")
```

The contract is simple: every agent gets the full state, does its thing, mutates the relevant field on state, and returns it.

---

### Task 1.4 — History Manager

Build `utils/history.py` — manages the rolling window of past events that agents (especially Risk and Reflection) reference for trend detection.

```
class HistoryManager:
    
    store: dict[session_id -> list of past OrchestrationState snapshots]
    max_window: 20 entries per session

    add_entry(session_id, state):
        → snapshot current scores + risk + timestamp
        → append to session's list
        → trim to max_window

    get_history(session_id, limit=10):
        → return last N entries for this session

    get_trend(session_id, field="stress_score", window=5):
        → return direction: "rising" | "falling" | "stable"
        → return percentage change
```

For the hackathon, this can be an in-memory dict. It doesn't need to persist — you'll add ClickHouse later.

---

### Task 1.5 — LangGraph Orchestrator

This is your main deliverable. Build `orchestrator/graph.py`.

**The pipeline:**

```
Signal arrives
      ↓
┌─────────────┐
│ ingest_node │  ← validates signal, loads history, sets initial state
└──────┬──────┘
       ↓
┌─────────────┐
│ emotion_node│  ← calls Person 2's EmotionAgent.run(state)
└──────┬──────┘
       ↓
┌─────────────┐
│  risk_node  │  ← calls Person 2's RiskAgent.run(state)
└──────┬──────┘
       ↓
┌─────────────┐
│ route_node  │  ← conditional: check risk_level
└──┬──────┬───┘
   ↓      ↓
 >= mod   low
   ↓      ↓
┌──────┐  │
│interv│  │  ← calls Person 3's InterventionAgent.run(state)
│_node │  │
└──┬───┘  │
   ↓      │
   ├──────┘
   ↓
┌──────────────┐
│reflect_node  │  ← calls Person 3's ReflectionAgent.run(state)
└──────┬───────┘
       ↓
┌──────────────┐
│ persist_node │  ← saves to history, (later: writes to ClickHouse)
└──────────────┘
```

**How to build this with LangGraph:**

```python
from langgraph.graph import StateGraph, END
from models import OrchestrationState

# Import agents (Person 2 and 3's code)
# Until they're ready, use stubs that return dummy data
from agents.emotion import EmotionAgent
from agents.risk import RiskAgent
from agents.intervention import InterventionAgent
from agents.reflection import ReflectionAgent

emotion_agent = EmotionAgent()
risk_agent = RiskAgent()
intervention_agent = InterventionAgent()
reflection_agent = ReflectionAgent()

async def ingest_node(state: dict) -> dict:
    # Validate incoming signal, load history
    # Return state with history attached
    ...

async def emotion_node(state: dict) -> dict:
    result = await emotion_agent.run(state)
    return result

async def risk_node(state: dict) -> dict:
    result = await risk_agent.run(state)
    return result

def should_intervene(state: dict) -> str:
    risk = state.get("risk")
    if risk and risk.risk_level in ("moderate", "high", "critical"):
        return "intervene"
    return "skip"

async def intervention_node(state: dict) -> dict:
    result = await intervention_agent.run(state)
    return result

async def reflection_node(state: dict) -> dict:
    result = await reflection_agent.run(state)
    return result

async def persist_node(state: dict) -> dict:
    # Save to history manager
    # Later: write to ClickHouse
    ...

# Build the graph
graph = StateGraph(dict)

graph.add_node("ingest", ingest_node)
graph.add_node("emotion", emotion_node)
graph.add_node("risk", risk_node)
graph.add_node("intervention", intervention_node)
graph.add_node("reflection", reflection_node)
graph.add_node("persist", persist_node)

graph.set_entry_point("ingest")
graph.add_edge("ingest", "emotion")
graph.add_edge("emotion", "risk")
graph.add_conditional_edges("risk", should_intervene, {
    "intervene": "intervention",
    "skip": "reflection"
})
graph.add_edge("intervention", "reflection")
graph.add_edge("reflection", "persist")
graph.add_edge("persist", END)

pipeline = graph.compile()
```

**Critical:** Build this with stub agents first. Each stub returns hardcoded data matching the contracts. This lets you test the full orchestration flow immediately. When Person 2 and 3 finish their agents, you swap stubs for real code — one import change each.

**Stub example:**

```python
class EmotionAgentStub(BaseAgent):
    name = "emotion_stub"

    async def run(self, state):
        state.emotion = EmotionResult(
            mood="negative",
            mood_score=25,
            stress_score=85,
            anxiety_score=78,
            emotional_volatility=0.7
        )
        self.log(f"Stub result: stress={state.emotion.stress_score}")
        return state
```

---

### Task 1.6 — FastAPI Entry Point with WebSocket

Build `main.py` — this is how the system receives input and streams results.

```python
from fastapi import FastAPI, WebSocket
import json, uuid

app = FastAPI(title="MindMesh")

@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await websocket.accept()
    try:
        while True:
            raw = await websocket.receive_text()
            data = json.loads(raw)

            # Build state from incoming signal
            state = {
                "session_id": session_id,
                "signal": BehavioralSignal(**data),
                "monitoring_level": "NORMAL",
                "history": history_manager.get_history(session_id)
            }

            # Run the pipeline
            result = await pipeline.ainvoke(state)

            # Stream back results
            await websocket.send_json({
                "emotion": result["emotion"].model_dump(),
                "risk": result["risk"].model_dump(),
                "intervention": result.get("intervention", {}).model_dump()
                    if result.get("intervention") else None,
                "reflection": result["reflection"].model_dump(),
                "monitoring_level": result["monitoring_level"]
            })
    except Exception as e:
        print(f"WS error: {e}")
        await websocket.close()

# Also add a simple REST endpoint for quick testing
@app.post("/analyze")
async def analyze(signal: BehavioralSignal):
    state = {
        "session_id": str(uuid.uuid4()),
        "signal": signal,
        "monitoring_level": "NORMAL",
        "history": []
    }
    result = await pipeline.ainvoke(state)
    return result
```

The `/analyze` POST endpoint is crucial for testing — Person 2 and 3 can test their agents through it without needing a WebSocket client.

---

### Task 1.7 — CLI Test Runner

Build a quick test script so anyone can run the full pipeline from the terminal:

```python
# test_pipeline.py
import asyncio
from main import pipeline
from models import BehavioralSignal
from datetime import datetime

async def test():
    state = {
        "session_id": "test-001",
        "signal": BehavioralSignal(
            journal_text="I haven't slept in 3 days and I can't handle this anymore",
            typing_speed=182,
            pause_frequency=3,
            deletion_frequency=41,
            inactivity_duration_ms=800,
            burst_typing=True,
            client_timestamp=datetime.now()
        ),
        "monitoring_level": "NORMAL",
        "history": []
    }

    result = await pipeline.ainvoke(state)

    print("\n=== PIPELINE RESULT ===")
    print(f"Emotion: stress={result['emotion'].stress_score}, "
          f"anxiety={result['emotion'].anxiety_score}")
    print(f"Risk: {result['risk'].risk_level}, "
          f"escalation={result['risk'].escalation_triggered}")
    if result.get("intervention"):
        print(f"Intervention: {result['intervention'].intervention}")
    print(f"Insight: {result['reflection'].insight}")
    print(f"Monitoring: {result['monitoring_level']}")

asyncio.run(test())
```

---

### Person 1 — Deliverables Checklist

- [ ] `models.py` with all shared contracts (commit in first 15 min)
- [ ] `utils/llm.py` with `llm_call` and `parse_json_response` (commit in first 30 min)
- [ ] `agents/base.py` with BaseAgent class (commit in first 30 min)
- [ ] `utils/history.py` with in-memory history manager
- [ ] Stub agents for all four (emotion, risk, intervention, reflection)
- [ ] LangGraph pipeline with conditional routing
- [ ] `main.py` with WebSocket + REST endpoints
- [ ] `test_pipeline.py` CLI test runner
- [ ] Full pipeline works end-to-end with stubs

---

## Person 2 — Emotion Analysis Agent + Risk Detection Agent

### What You Own

The sensing layer. Your two agents take raw signals and journal text, and produce structured assessments of what the user is feeling and whether they're at risk. Risk depends on Emotion's output, so build Emotion first.

### How You Work Independently

You don't need the orchestrator running to develop. Write your agents, test them with the shared test input, and verify they return the correct Pydantic models. When Person 1's pipeline is ready, your agents slot in with zero changes.

---

### Task 2.1 — Emotion Analysis Agent

Build `agents/emotion.py`.

**What this agent does:**

Takes journal text + behavioral signals + optional wellness check-in and produces a structured emotional assessment.

**The prompt (write in `prompts/emotion.txt`):**

```
You are a clinical-grade emotional signal analyzer for a wellness monitoring system.

Analyze the journal entry and behavioral signals below. Consider both the explicit
emotional content in the text AND the implicit signals from typing behavior.

BEHAVIORAL SIGNAL INTERPRETATION GUIDE:
- typing_speed > 160 chars/min: agitation, urgency, or manic energy
- typing_speed < 60 chars/min: fatigue, depression, or deep contemplation
- deletion_frequency > 30%: self-doubt, anxiety, difficulty articulating thoughts
- pause_frequency > 10: cognitive overwhelm, distraction, or emotional processing
- burst_typing = true: emotional outbursts, anger, or cathartic release
- inactivity_duration > 10000ms: disengagement, avoidance, or emotional shutdown
- client_timestamp between 12AM-5AM: sleep disruption, rumination, or crisis moment

WELLNESS CHECK-IN INTERPRETATION (if provided):
- sleep_hours < 4: severe deprivation — amplify stress/anxiety assessment
- stress_level > 7: self-reported high stress — weight this heavily
- mood_score < 3: significant low mood
- energy_level < 3: exhaustion — may indicate depression or burnout

Respond ONLY in valid JSON with this exact structure:
{
  "mood": "negative" | "neutral" | "positive",
  "mood_score": <0-100, where 0=severely negative, 50=neutral, 100=very positive>,
  "stress_score": <0-100, where 0=no stress, 100=extreme stress>,
  "anxiety_score": <0-100, where 0=no anxiety, 100=extreme anxiety>,
  "emotional_volatility": <0.0-1.0, how unstable/fluctuating the emotional state appears>
}
```

**Agent implementation flow:**

```
run(state) called with full OrchestrationState
        ↓
Extract from state:
  - state.signal.journal_text
  - state.signal.typing_speed, deletion_frequency, etc.
  - state.checkin (if present)
  - state.history (for context on previous mood)
        ↓
Build user_prompt:
  "JOURNAL ENTRY:
   {journal_text}

   BEHAVIORAL SIGNALS:
   - Typing speed: {typing_speed} chars/min
   - Pause frequency: {pause_frequency}
   - Deletion frequency: {deletion_frequency}
   - Inactivity duration: {inactivity_duration_ms}ms
   - Burst typing: {burst_typing}
   - Entry time: {client_timestamp}

   WELLNESS CHECK-IN: (if available)
   - Sleep: {sleep_hours}h | Stress: {stress_level}/10
   - Mood: {mood_score}/10 | Energy: {energy_level}/10

   RECENT HISTORY: (if available)
   - Previous stress scores: {last_3_stress_scores}
   - Trend: {rising/falling/stable}"
        ↓
Call llm_call(system_prompt, user_prompt)
        ↓
Parse JSON response → EmotionResult
        ↓
Set state.emotion = EmotionResult(...)
        ↓
Return state
```

**Implementation:**

```python
from agents.base import BaseAgent
from models import OrchestrationState, EmotionResult
from utils.llm import llm_call, parse_json_response

class EmotionAgent(BaseAgent):
    name = "emotion"

    def __init__(self):
        with open("prompts/emotion.txt") as f:
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
        self.log(f"Result: mood={state.emotion.mood}, "
                 f"stress={state.emotion.stress_score}, "
                 f"anxiety={state.emotion.anxiety_score}")
        return state
```

**Test independently:**

```python
# tests/test_emotion.py
import asyncio
from agents.emotion import EmotionAgent
from models import OrchestrationState, BehavioralSignal
from datetime import datetime

async def test_emotion():
    agent = EmotionAgent()
    state = OrchestrationState(
        session_id="test",
        signal=BehavioralSignal(
            journal_text="I haven't slept in 3 days and I can't handle this anymore",
            typing_speed=182, pause_frequency=3, deletion_frequency=41,
            inactivity_duration_ms=800, burst_typing=True,
            client_timestamp=datetime(2026, 5, 23, 3, 12, 0)
        )
    )
    result = await agent.run(state)
    assert result.emotion is not None
    assert result.emotion.stress_score > 70, "Expected high stress"
    assert result.emotion.mood == "negative", "Expected negative mood"
    print("PASS:", result.emotion)

asyncio.run(test_emotion())
```

---

### Task 2.2 — Risk Detection Agent

Build `agents/risk.py`.

**What this agent does:**

Takes the Emotion result + behavioral signals + history, classifies risk level, determines if escalation is needed, and flags specific risk categories.

**The prompt (write in `prompts/risk.txt`):**

```
You are a mental wellness risk classifier for an autonomous monitoring system.

Based on the emotional analysis and behavioral signals, classify the user's
current mental wellness risk level. You are NOT diagnosing. You are detecting
patterns that suggest the user may benefit from proactive wellness support.

RISK LEVEL DEFINITIONS:
- low: Normal emotional fluctuation. No intervention needed.
- moderate: Elevated stress or anxiety. Mild support suggested.
- high: Significant distress signals. Active intervention recommended.
- critical: Severe distress indicators. Immediate support and professional
  resources should be surfaced.

FLAG DEFINITIONS (include all that apply):
- burnout_risk: sustained high stress + low energy + extended work hours
- panic_indicators: very high anxiety (>80) + burst typing + high deletion rate
- emotional_overload: high volatility + extreme mood scores
- sleep_deprivation: sleep < 4 hours + late-night activity
- crisis_language: text contains expressions of hopelessness, inability to cope,
  or references to self-harm (NOTE: if this flag is present, risk_level MUST be "critical")

ESCALATION RULES:
- escalation_triggered = true if risk_level is "high" or "critical"
- escalation_triggered = true if 3+ flags are present regardless of risk_level
- escalation_triggered = true if risk has been "moderate" for 3+ consecutive readings

Respond ONLY in valid JSON:
{
  "risk_level": "low" | "moderate" | "high" | "critical",
  "escalation_triggered": true | false,
  "confidence": <0.0-1.0>,
  "flags": ["flag1", "flag2"]
}
```

**Agent implementation flow:**

```
run(state) called — state.emotion is already populated
        ↓
Extract:
  - state.emotion (stress_score, anxiety_score, mood, volatility)
  - state.signal (typing behavior, timestamp)
  - state.checkin (sleep, energy)
  - state.history (trend of past risk levels)
        ↓
Build user_prompt with all the data
        ↓
Call llm_call(system_prompt, user_prompt)
        ↓
Parse → RiskResult
        ↓
SAFETY CHECK (hard-coded, not LLM):
  if "crisis_language" in flags:
      → force risk_level = "critical"
      → force escalation_triggered = True
        ↓
UPDATE MONITORING LEVEL (rule-based):
  if risk_level == "critical":  state.monitoring_level = "CRITICAL"
  elif risk_level == "high":    state.monitoring_level = "HIGH_ATTENTION"
  elif risk_level == "moderate": state.monitoring_level = "ELEVATED"
  else:                          state.monitoring_level = "NORMAL"
        ↓
Set state.risk = RiskResult(...)
        ↓
Return state
```

**Critical safety implementation — hard-code this, don't leave it to the LLM:**

```python
# Hard-coded crisis check AFTER LLM returns
CRISIS_PHRASES = [
    "can't go on", "end it", "no point", "better off without me",
    "want to die", "kill myself", "self-harm", "hurt myself",
    "not worth living", "give up on everything"
]

def check_crisis_language(text: str) -> bool:
    """Rule-based check. Do NOT rely on LLM for this."""
    text_lower = text.lower()
    return any(phrase in text_lower for phrase in CRISIS_PHRASES)
```

If crisis is detected, the system should surface professional resources, not generate AI coping advice. Add this to the state so Person 3's Intervention Agent knows to show resources instead of exercises.

**Test independently:**

```python
# tests/test_risk.py
import asyncio
from agents.risk import RiskAgent
from models import OrchestrationState, BehavioralSignal, EmotionResult
from datetime import datetime

async def test_risk_high():
    agent = RiskAgent()
    state = OrchestrationState(
        session_id="test",
        signal=BehavioralSignal(
            journal_text="I haven't slept in 3 days and I can't handle this anymore",
            typing_speed=182, pause_frequency=3, deletion_frequency=41,
            inactivity_duration_ms=800, burst_typing=True,
            client_timestamp=datetime(2026, 5, 23, 3, 12, 0)
        ),
        # Pre-populate emotion result (simulating Agent 1 already ran)
        emotion=EmotionResult(
            mood="negative", mood_score=15,
            stress_score=91, anxiety_score=88,
            emotional_volatility=0.78
        )
    )
    result = await agent.run(state)
    assert result.risk is not None
    assert result.risk.risk_level in ("high", "critical")
    assert result.risk.escalation_triggered == True
    print("PASS:", result.risk)

asyncio.run(test_risk_high())
```

---

### Person 2 — Deliverables Checklist

- [ ] `prompts/emotion.txt` — complete system prompt with signal interpretation guide
- [ ] `agents/emotion.py` — EmotionAgent with full prompt construction and parsing
- [ ] `tests/test_emotion.py` — at least 3 test cases (high stress, neutral, positive)
- [ ] `prompts/risk.txt` — complete system prompt with risk definitions
- [ ] `agents/risk.py` — RiskAgent with hard-coded crisis safety check
- [ ] Monitoring level update logic (rule-based, not LLM)
- [ ] `tests/test_risk.py` — at least 4 test cases (low, moderate, high, critical)
- [ ] Both agents work independently with `python tests/test_emotion.py`

---

## Person 3 — Intervention Planner Agent + Reflection Agent

### What You Own

The action layer. Your two agents decide what to do about the assessed risk and generate long-term insights. Intervention depends on Risk's output; Reflection sees everything.

### How You Work Independently

Same as Person 2 — pre-populate `state.emotion` and `state.risk` with test values and develop your agents standalone. They'll slot into the pipeline with zero changes.

---

### Task 3.1 — Intervention Planner Agent

Build `agents/intervention.py`.

**What this agent does:**

Based on risk level and emotional state, selects and configures an appropriate coping intervention. The interventions are specific, actionable wellness exercises — not vague advice.

**The prompt (write in `prompts/intervention.txt`):**

```
You are a wellness intervention planner for an autonomous mental health monitoring system.
You do NOT diagnose. You do NOT replace professional therapy. You provide evidence-based
coping exercises and wellness activities.

Based on the risk assessment and emotional state, generate a personalized intervention workflow.

AVAILABLE INTERVENTIONS:
1. box_breathing: 4-4-4-4 breathing pattern. Best for: acute anxiety, panic indicators.
   Duration: 2-5 minutes.
2. grounding_exercise: 5-4-3-2-1 sensory grounding. Best for: emotional overload,
   dissociation, overwhelm. Duration: 3-5 minutes.
3. cbt_reframing: Identify thought → challenge → reframe. Best for: negative thought
   spirals, catastrophizing. Duration: 5-10 minutes.
4. journaling_prompt: Guided reflective writing. Best for: moderate stress, emotional
   processing. Duration: 5-15 minutes.
5. sleep_recovery: Wind-down routine + sleep hygiene steps. Best for: sleep deprivation.
   Duration: 15-20 minutes.
6. mindfulness_prompt: Brief body scan or present-moment awareness. Best for: general
   stress, elevated tension. Duration: 3-5 minutes.

SELECTION RULES:
- Match intervention to the specific flags from risk assessment
- For multiple flags, create a workflow sequence (most urgent first)
- Never prescribe more than 3 interventions in one workflow
- If sleep_deprivation is flagged, always include sleep_recovery
- If panic_indicators are flagged, always lead with box_breathing

PRIORITY LEVELS:
- immediate: risk is high, intervention should be presented now
- suggested: risk is moderate, intervention is offered but not pushed
- optional: risk is low, light wellness suggestion

Respond ONLY in valid JSON:
{
  "intervention": "<primary intervention name>",
  "workflow": ["step1", "step2", ...],
  "duration": "<total estimated time>",
  "follow_up": "scheduled" | "none",
  "priority": "immediate" | "suggested" | "optional"
}
```

**Agent implementation flow:**

```
run(state) called — state.emotion and state.risk are populated
        ↓
SAFETY GATE (hard-coded, checked before LLM call):
  if state.risk.risk_level == "critical"
     OR "crisis_language" in state.risk.flags:
      → DO NOT call LLM
      → Return hard-coded crisis response:
        InterventionResult(
            intervention="crisis_resources",
            workflow=[
                "988 Suicide & Crisis Lifeline: call or text 988",
                "Crisis Text Line: text HOME to 741741",
                "Please reach out to a trusted person or professional"
            ],
            duration="immediate",
            follow_up="scheduled",
            priority="immediate"
        )
      → Return state immediately
        ↓
For non-critical cases:
  Build user_prompt:
    "RISK ASSESSMENT:
     Risk level: {risk_level}
     Flags: {flags}
     Confidence: {confidence}

     EMOTIONAL STATE:
     Stress: {stress_score}/100
     Anxiety: {anxiety_score}/100
     Mood: {mood} ({mood_score}/100)
     Volatility: {emotional_volatility}

     CONTEXT:
     Sleep hours: {sleep_hours}
     Time of day: {timestamp}
     Energy level: {energy_level}"
        ↓
Call llm_call(system_prompt, user_prompt)
        ↓
Parse → InterventionResult
        ↓
Set state.intervention = InterventionResult(...)
        ↓
Return state
```

**Implementation with safety gate:**

```python
from agents.base import BaseAgent
from models import OrchestrationState, InterventionResult
from utils.llm import llm_call, parse_json_response

CRISIS_RESPONSE = InterventionResult(
    intervention="crisis_resources",
    workflow=[
        "988 Suicide & Crisis Lifeline: call or text 988",
        "Crisis Text Line: text HOME to 741741",
        "Please reach out to a trusted person or professional"
    ],
    duration="immediate",
    follow_up="scheduled",
    priority="immediate"
)

class InterventionAgent(BaseAgent):
    name = "intervention"

    def __init__(self):
        with open("prompts/intervention.txt") as f:
            self.system_prompt = f.read()

    async def run(self, state: OrchestrationState) -> OrchestrationState:
        self.log(f"Planning intervention for risk={state.risk.risk_level}")

        # SAFETY GATE — hard-coded, never bypassed
        if (state.risk.risk_level == "critical"
                or "crisis_language" in state.risk.flags):
            self.log("CRISIS detected — returning professional resources")
            state.intervention = CRISIS_RESPONSE
            return state

        # Normal intervention planning
        user_prompt = f"""RISK ASSESSMENT:
Risk level: {state.risk.risk_level}
Flags: {', '.join(state.risk.flags)}
Confidence: {state.risk.confidence}

EMOTIONAL STATE:
Stress: {state.emotion.stress_score}/100
Anxiety: {state.emotion.anxiety_score}/100
Mood: {state.emotion.mood} ({state.emotion.mood_score}/100)
Volatility: {state.emotion.emotional_volatility}"""

        if state.checkin:
            user_prompt += f"""

CONTEXT:
Sleep: {state.checkin.sleep_hours}h
Energy: {state.checkin.energy_level}/10"""

        raw = await llm_call(self.system_prompt, user_prompt)
        parsed = parse_json_response(raw)

        state.intervention = InterventionResult(**parsed)
        self.log(f"Result: {state.intervention.intervention}, "
                 f"priority={state.intervention.priority}")
        return state
```

**Test independently:**

```python
# tests/test_intervention.py
import asyncio
from agents.intervention import InterventionAgent
from models import (OrchestrationState, BehavioralSignal,
                    EmotionResult, RiskResult)
from datetime import datetime

async def test_high_risk_intervention():
    agent = InterventionAgent()
    state = OrchestrationState(
        session_id="test",
        signal=BehavioralSignal(
            journal_text="Everything feels overwhelming",
            typing_speed=182, pause_frequency=3, deletion_frequency=41,
            inactivity_duration_ms=800, burst_typing=True,
            client_timestamp=datetime(2026, 5, 23, 3, 12, 0)
        ),
        emotion=EmotionResult(
            mood="negative", mood_score=15,
            stress_score=91, anxiety_score=88,
            emotional_volatility=0.78
        ),
        risk=RiskResult(
            risk_level="high",
            escalation_triggered=True,
            confidence=0.84,
            flags=["burnout_risk", "sleep_deprivation"]
        )
    )
    result = await agent.run(state)
    assert result.intervention is not None
    assert result.intervention.priority == "immediate"
    assert "sleep_recovery" in result.intervention.workflow
    print("PASS:", result.intervention)

async def test_crisis_returns_resources():
    agent = InterventionAgent()
    state = OrchestrationState(
        session_id="test",
        signal=BehavioralSignal(
            journal_text="I want to end it all",
            typing_speed=50, pause_frequency=15, deletion_frequency=5,
            inactivity_duration_ms=30000, burst_typing=False,
            client_timestamp=datetime(2026, 5, 23, 2, 0, 0)
        ),
        emotion=EmotionResult(
            mood="negative", mood_score=5,
            stress_score=95, anxiety_score=92,
            emotional_volatility=0.9
        ),
        risk=RiskResult(
            risk_level="critical",
            escalation_triggered=True,
            confidence=0.95,
            flags=["crisis_language", "emotional_overload"]
        )
    )
    result = await agent.run(state)
    assert result.intervention.intervention == "crisis_resources"
    assert "988" in result.intervention.workflow[0]
    print("PASS: crisis safety gate works")

asyncio.run(test_high_risk_intervention())
asyncio.run(test_crisis_returns_resources())
```

---

### Task 3.2 — Reflection & Insight Agent

Build `agents/reflection.py`.

**What this agent does:**

Looks at the full picture — current session results plus historical data — and generates a behavioral insight. This agent's output is what makes the system feel intelligent over time, not just reactive.

**The prompt (write in `prompts/reflection.txt`):**

```
You are a behavioral wellness analyst for a continuous monitoring system.

Analyze the current session data alongside historical trends to generate
ONE actionable insight. You are identifying patterns, not diagnosing.

INSIGHT QUALITY RULES:
- Be specific: "Stress increases when sleep drops below 5 hours" not "Sleep affects stress"
- Be actionable: Include a concrete recommendation the user can act on
- Be data-grounded: Reference actual scores and trends, not generic advice
- Never use clinical diagnostic language (no "you are depressed", "you have anxiety")
- Frame positively when possible: "Your mood improved on days with 7+ hours of sleep"

TREND ANALYSIS:
- Compare current scores to historical averages
- Identify correlations: sleep ↔ stress, time-of-day ↔ anxiety, etc.
- Note if the situation is improving, stable, or declining
- Calculate approximate percentage change for the primary trend

Respond ONLY in valid JSON:
{
  "insight": "<one specific, actionable insight>",
  "trend_change": "<e.g. '+22% stress increase over 7 days' or '-15% anxiety improvement'>",
  "period": "<time period analyzed: '24h' | '3d' | '7d'>",
  "recommendations": ["<specific recommendation 1>", "<specific recommendation 2>"]
}
```

**Agent implementation flow:**

```
run(state) called — all previous agent results are populated
        ↓
Extract:
  - state.emotion (current scores)
  - state.risk (current risk)
  - state.intervention (what was deployed, if anything)
  - state.history (past readings)
        ↓
Build user_prompt:
  "CURRENT SESSION:
   Stress: {stress_score} | Anxiety: {anxiety_score} | Mood: {mood_score}
   Risk: {risk_level} | Flags: {flags}
   Intervention deployed: {intervention or 'none'}
   Sleep: {sleep_hours}h | Time: {timestamp}

   HISTORICAL DATA ({N} past readings):
   Date/Time          | Stress | Anxiety | Mood | Risk    | Sleep
   {formatted table of history}

   TRENDS:
   Stress: {avg_last_5} → {current} ({direction})
   Anxiety: {avg_last_5} → {current} ({direction})
   Mood: {avg_last_5} → {current} ({direction})
   Most common risk level: {mode_risk}
   Most deployed intervention: {mode_intervention}"
        ↓
Call llm_call(system_prompt, user_prompt)
        ↓
Parse → ReflectionResult
        ↓
Set state.reflection = ReflectionResult(...)
        ↓
Return state
```

**Handling missing history (first session):**

```python
if not state.history or len(state.history) < 2:
    # First session — no trends to analyze
    # Tell the LLM this is a first reading
    history_section = """HISTORICAL DATA:
This is the user's first session. No trend data available yet.
Provide an insight based on the current reading only.
Set trend_change to 'baseline established' and period to '0d'."""
else:
    # Format history into readable table
    history_section = self._format_history(state.history)
```

**Helper for formatting history:**

```python
def _format_history(self, history: list[dict]) -> str:
    lines = ["HISTORICAL DATA:"]
    lines.append("Time              | Stress | Anxiety | Mood | Risk")
    lines.append("-" * 55)
    for h in history[-10:]:  # last 10 entries max
        lines.append(
            f"{h.get('timestamp', '?'):18s} | "
            f"{h.get('stress_score', '?'):6} | "
            f"{h.get('anxiety_score', '?'):7} | "
            f"{h.get('mood_score', '?'):4} | "
            f"{h.get('risk_level', '?')}"
        )

    # Compute simple trend
    if len(history) >= 3:
        recent_stress = [h["stress_score"] for h in history[-3:]]
        avg = sum(recent_stress) / len(recent_stress)
        current = history[-1]["stress_score"]
        direction = "rising" if current > avg else "falling" if current < avg else "stable"
        lines.append(f"\nStress trend: {direction} (avg={avg:.0f}, current={current})")

    return "\n".join(lines)
```

**Test independently:**

```python
# tests/test_reflection.py
import asyncio
from agents.reflection import ReflectionAgent
from models import (OrchestrationState, BehavioralSignal,
                    EmotionResult, RiskResult, InterventionResult)
from datetime import datetime

async def test_reflection_with_history():
    agent = ReflectionAgent()
    state = OrchestrationState(
        session_id="test",
        signal=BehavioralSignal(
            journal_text="Still feeling stressed but slightly better today",
            typing_speed=120, pause_frequency=5, deletion_frequency=15,
            inactivity_duration_ms=2000, burst_typing=False,
            client_timestamp=datetime(2026, 5, 23, 22, 0, 0)
        ),
        emotion=EmotionResult(
            mood="negative", mood_score=35,
            stress_score=72, anxiety_score=60,
            emotional_volatility=0.45
        ),
        risk=RiskResult(
            risk_level="moderate", escalation_triggered=False,
            confidence=0.7, flags=["burnout_risk"]
        ),
        intervention=InterventionResult(
            intervention="mindfulness_prompt",
            workflow=["mindfulness_prompt"],
            duration="5 minutes", follow_up="none",
            priority="suggested"
        ),
        history=[
            {"timestamp": "2026-05-21 03:00", "stress_score": 91,
             "anxiety_score": 88, "mood_score": 15, "risk_level": "high"},
            {"timestamp": "2026-05-22 01:30", "stress_score": 85,
             "anxiety_score": 80, "mood_score": 22, "risk_level": "high"},
            {"timestamp": "2026-05-22 23:00", "stress_score": 78,
             "anxiety_score": 68, "mood_score": 30, "risk_level": "moderate"},
        ]
    )
    result = await agent.run(state)
    assert result.reflection is not None
    assert len(result.reflection.insight) > 20
    assert len(result.reflection.recommendations) >= 1
    print("PASS:", result.reflection)

async def test_reflection_first_session():
    agent = ReflectionAgent()
    state = OrchestrationState(
        session_id="test",
        signal=BehavioralSignal(
            journal_text="First time using this, feeling anxious about a deadline",
            typing_speed=100, pause_frequency=4, deletion_frequency=10,
            inactivity_duration_ms=3000, burst_typing=False,
            client_timestamp=datetime(2026, 5, 23, 14, 0, 0)
        ),
        emotion=EmotionResult(
            mood="negative", mood_score=40,
            stress_score=65, anxiety_score=58,
            emotional_volatility=0.3
        ),
        risk=RiskResult(
            risk_level="moderate", escalation_triggered=False,
            confidence=0.6, flags=["burnout_risk"]
        ),
        history=[]  # no history
    )
    result = await agent.run(state)
    assert result.reflection is not None
    assert "baseline" in result.reflection.trend_change.lower()
    print("PASS (first session):", result.reflection)

asyncio.run(test_reflection_with_history())
asyncio.run(test_reflection_first_session())
```

---

### Person 3 — Deliverables Checklist

- [ ] `prompts/intervention.txt` — complete system prompt with intervention catalog
- [ ] `agents/intervention.py` — InterventionAgent with crisis safety gate
- [ ] Crisis safety gate that bypasses LLM for critical risk
- [ ] `tests/test_intervention.py` — test cases for moderate, high, and crisis scenarios
- [ ] `prompts/reflection.txt` — complete system prompt with insight quality rules
- [ ] `agents/reflection.py` — ReflectionAgent with history formatting
- [ ] First-session handling (no history available)
- [ ] `tests/test_reflection.py` — test cases with and without history
- [ ] Both agents work independently with `python tests/test_*.py`

---

## Integration Sequence

Once everyone has their pieces working independently, integrate in this order:

```
Step 1 (5 min): Person 2 + Person 1
─────────────────────────────────────
Person 1 swaps emotion stub → Person 2's EmotionAgent
Person 1 swaps risk stub → Person 2's RiskAgent
Run test_pipeline.py → verify emotion + risk nodes produce real output

Step 2 (5 min): Person 3 + Person 1
─────────────────────────────────────
Person 1 swaps intervention stub → Person 3's InterventionAgent
Person 1 swaps reflection stub → Person 3's ReflectionAgent
Run test_pipeline.py → verify full pipeline produces real output

Step 3 (10 min): Full Pipeline Test
─────────────────────────────────────
Run 3 test scenarios through the REST endpoint:
  1. Low risk: "Had a good day, feeling productive" → expect low risk, no intervention
  2. High risk: "Haven't slept, can't handle this" → expect high risk, intervention deployed
  3. Crisis: "I want to end it all" → expect crisis resources, NOT AI advice
Verify monitoring_level updates correctly

Step 4 (5 min): History Integration
─────────────────────────────────────
Run multiple signals through same session_id
Verify reflection agent sees and references history
Verify trend detection works across readings
```

**Total integration time target: 25 minutes.** If it takes longer, the contracts weren't followed — check field names and types first.

---

## Quick Reference: Who Owns What

| File | Owner | Dependencies |
|---|---|---|
| `models.py` | Person 1 (shared) | None |
| `utils/llm.py` | Person 1 | env vars |
| `utils/history.py` | Person 1 | models.py |
| `agents/base.py` | Person 1 | models.py |
| `orchestrator/graph.py` | Person 1 | all agents |
| `main.py` | Person 1 | orchestrator |
| `agents/emotion.py` | Person 2 | base.py, llm.py, models.py |
| `agents/risk.py` | Person 2 | base.py, llm.py, models.py |
| `prompts/emotion.txt` | Person 2 | None |
| `prompts/risk.txt` | Person 2 | None |
| `agents/intervention.py` | Person 3 | base.py, llm.py, models.py |
| `agents/reflection.py` | Person 3 | base.py, llm.py, models.py |
| `prompts/intervention.txt` | Person 3 | None |
| `prompts/reflection.txt` | Person 3 | None |
