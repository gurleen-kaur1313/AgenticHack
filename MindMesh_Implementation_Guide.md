# MindMesh — Implementation Guide

## Team Split & Parallel Development Plan

---

## Pre-Work: Shared Contracts (All 3 members, ~20 min)

Before splitting up, lock down these shared interfaces so everyone can build against mocks.

### WebSocket Message Envelope

Every message between frontend ↔ backend follows this shape:

```json
{
  "type": "signal | agent_result | intervention | insight | status",
  "agent": "emotion | risk | intervention | reflection | orchestrator",
  "payload": {},
  "timestamp": "2026-05-23T14:32:00Z",
  "session_id": "uuid-v4"
}
```

### Behavioral Signal Payload (Frontend → Backend)

```json
{
  "journal_text": "string",
  "typing_speed": 182,
  "pause_frequency": 12,
  "deletion_frequency": 41,
  "inactivity_duration_ms": 4500,
  "burst_typing": true,
  "client_timestamp": "2026-05-23T03:12:00Z"
}
```

### Wellness Check-in Payload (Frontend → Backend)

```json
{
  "sleep_hours": 3,
  "stress_level": 8,
  "mood_score": 2,
  "energy_level": 3
}
```

### Agent Output Contracts (Backend → Frontend & Database)

```json
// Emotion Agent
{
  "mood": "negative | neutral | positive",
  "mood_score": 22,
  "stress_score": 91,
  "anxiety_score": 88,
  "emotional_volatility": 0.78
}

// Risk Agent
{
  "risk_level": "low | moderate | high | critical",
  "escalation_triggered": true,
  "confidence": 0.84,
  "flags": ["burnout_risk", "sleep_deprivation", "emotional_overload"]
}

// Intervention Agent
{
  "intervention": "box_breathing",
  "workflow": ["box_breathing", "grounding_exercise", "sleep_recovery_plan"],
  "duration": "2 minutes",
  "follow_up": "scheduled",
  "priority": "immediate"
}

// Reflection Agent
{
  "insight": "Stress spikes correlate with low sleep duration.",
  "trend_change": "+22% stress increase",
  "period": "7d",
  "recommendations": ["Improve sleep consistency", "Reduce late-night activity"]
}
```

### Monitoring Level Enum

```
NORMAL → ELEVATED → HIGH_ATTENTION → CRITICAL
```

### Database Event Row (Backend → ClickHouse)

```json
{
  "timestamp": "DateTime",
  "session_id": "String",
  "mood_score": "Int32",
  "stress_score": "Int32",
  "anxiety_score": "Int32",
  "risk_level": "String",
  "typing_speed": "Int32",
  "deletion_frequency": "Int32",
  "sleep_hours": "Int32",
  "intervention_type": "String",
  "monitoring_level": "String"
}
```

---

## Person A — Frontend & Real-Time UI

### Responsibility

Everything the judges see. The journaling interface, real-time dashboards, agent activity feed, intervention cards, and all client-side behavioral signal capture.

### Tech Stack

- Next.js (App Router)
- Tailwind CSS
- shadcn/ui
- Framer Motion (animations)
- Native WebSocket client

---

### Task Breakdown

#### A1. Project Scaffold & Layout Shell

- `npx create-next-app@latest mindmesh-frontend`
- Configure Tailwind + shadcn/ui
- Build the app shell layout:
  - Left sidebar — navigation (Journal, Dashboard, Insights, Settings)
  - Main content area — routed views
  - Right sidebar — Agent Activity Feed (live)
- Set up a global WebSocket context provider

#### A2. Journaling Interface with Signal Capture

This is the primary input surface AND a real data source.

**UI:**
- Full-width textarea with soft styling
- Character count, timestamp display
- Submit button that sends both text + captured signals

**Signal Capture Logic (runs client-side in real time):**

```
on every keystroke:
  → calculate typing_speed (chars per minute, rolling 5s window)
  → track pause_frequency (gaps > 2s between keystrokes)
  → track deletion_frequency (backspace / delete count)
  → track inactivity_duration_ms (time since last keystroke)
  → detect burst_typing (> 200 chars/min sustained for 3s+)
```

**Flow:**

```
User types in journal
        ↓
Client-side JS captures behavioral signals in real time
        ↓
On submit (or every 10s while typing):
  → Package { journal_text, typing_speed, pause_frequency,
               deletion_frequency, inactivity_duration_ms,
               burst_typing, client_timestamp }
  → Send via WebSocket
```

**Implementation detail:** Use `useRef` to store keystroke timestamps without re-renders. Compute metrics on submit or at intervals.

#### A3. Wellness Check-in Modal

- Triggered on app open or by schedule
- Four sliders or segmented controls:
  - Sleep hours (0–12)
  - Stress level (1–10)
  - Mood score (1–10)
  - Energy level (1–10)
- Sends `wellness_checkin` payload over WebSocket on submit

#### A4. Real-Time Emotional Dashboard

Subscribes to WebSocket messages of type `agent_result` and renders live panels.

**Panels:**

| Panel | Data Source | Visualization |
|---|---|---|
| Mood Gauge | emotion agent → mood_score | Animated radial gauge |
| Stress Meter | emotion agent → stress_score | Color-coded bar (green→red) |
| Anxiety Level | emotion agent → anxiety_score | Numeric + trend arrow |
| Risk Level | risk agent → risk_level | Badge (LOW / MODERATE / HIGH / CRITICAL) with color |
| Monitoring Level | orchestrator → monitoring_level | Status indicator with pulse animation |

**Flow:**

```
WebSocket receives agent_result message
        ↓
Parse message.agent and message.payload
        ↓
Update corresponding React state
        ↓
Dashboard panels re-render with Framer Motion transitions
```

#### A5. Agent Activity Feed

A chronological live feed showing what each agent is doing, making the orchestration visible.

**Each feed item shows:**
- Agent name + icon
- Action taken ("Analyzed emotion", "Escalated risk to HIGH", "Deployed box breathing")
- Timestamp
- Expandable detail (raw JSON payload)

**Flow:**

```
Every WebSocket message
        ↓
Append to activity feed state (capped at last 50 items)
        ↓
New items animate in from top (Framer Motion)
        ↓
Color-code by agent (Emotion=blue, Risk=red, Intervention=green, Reflection=purple)
```

#### A6. Intervention Cards

When the Intervention Agent fires, render an interactive card.

**Card contents:**
- Intervention name ("Box Breathing")
- Duration ("2 minutes")
- Step-by-step instructions (expandable)
- Start / Dismiss buttons
- If box breathing: animated breathing circle (4s in, 4s hold, 4s out, 4s hold)

**Flow:**

```
WebSocket receives message where type = "intervention"
        ↓
Push to intervention queue
        ↓
Render top intervention as a card overlay or inline panel
        ↓
User interacts (start / dismiss)
        ↓
Send acknowledgment back over WebSocket
```

#### A7. Analytics View (consumes Person C's endpoints)

- Emotional trend line chart (stress, anxiety, mood over time)
- Sleep vs. stress correlation scatter plot
- Intervention history table
- Pulls data from REST endpoints built by Person C

**Note:** Use Recharts or Chart.js. Build with mock data first; swap to real endpoints during integration.

#### A8. Mock WebSocket Server (for independent development)

Create a simple Node.js script or Next.js API route that emits fake agent events on a timer so Person A can develop the entire frontend without waiting on Person B.

```
Every 3 seconds:
  → emit random emotion agent result
Every 8 seconds:
  → emit risk agent result (occasionally HIGH)
When risk is HIGH:
  → emit intervention deployment 2 seconds later
Every 30 seconds:
  → emit reflection insight
```

---

### Person A Deliverables Checklist

- [ ] App shell with navigation and layout
- [ ] Journal input with real-time signal capture
- [ ] Wellness check-in modal
- [ ] Live emotional dashboard (5 panels)
- [ ] Agent activity feed
- [ ] Intervention cards with breathing animation
- [ ] Analytics view with charts
- [ ] WebSocket client context provider
- [ ] Mock WebSocket server for local dev

---

## Person B — Backend Orchestration & Agents

### Responsibility

The autonomous brain. FastAPI server, WebSocket handling, the LangGraph orchestrator, all four AI agents, prompt engineering, and the autonomous workflow loop.

### Tech Stack

- Python 3.11+
- FastAPI + Uvicorn
- WebSockets (via FastAPI)
- LangGraph (orchestration)
- OpenAI API (or Ollama for local)
- Pydantic (data models)

---

### Task Breakdown

#### B1. Project Scaffold & Data Models

- Set up FastAPI project structure:

```
backend/
├── main.py              # FastAPI app + WebSocket endpoint
├── models/
│   ├── signals.py       # Pydantic models for incoming signals
│   ├── agents.py        # Pydantic models for agent outputs
│   └── events.py        # Wellness event model (for DB writes)
├── agents/
│   ├── emotion.py
│   ├── risk.py
│   ├── intervention.py
│   └── reflection.py
├── orchestrator/
│   ├── graph.py         # LangGraph workflow definition
│   └── state.py         # Shared orchestration state
├── prompts/
│   ├── emotion.txt
│   ├── risk.txt
│   ├── intervention.txt
│   └── reflection.txt
└── utils/
    ├── ws_manager.py    # WebSocket connection manager
    └── db_client.py     # ClickHouse writer (interface only; Person C implements)
```

- Define all Pydantic models matching the shared contracts above

#### B2. WebSocket Server & Connection Manager

**Endpoints:**
- `ws://localhost:8000/ws/{session_id}` — main bidirectional channel

**Connection Manager:**
- Track active connections by session_id
- Broadcast agent results back to the correct session
- Handle disconnections gracefully

**Incoming message routing:**

```
WebSocket message received
        ↓
Parse envelope → extract type
        ↓
if type == "signal":
    → validate as BehavioralSignal
    → feed into orchestrator
if type == "wellness_checkin":
    → validate as WellnessCheckin
    → merge into session state
    → feed into orchestrator
if type == "intervention_ack":
    → log acknowledgment
```

#### B3. Orchestration State

Define the shared state that flows through the LangGraph pipeline:

```python
class OrchestrationState:
    session_id: str
    journal_text: str
    behavioral_signals: BehavioralSignal
    wellness_checkin: Optional[WellnessCheckin]
    monitoring_level: str  # NORMAL | ELEVATED | HIGH_ATTENTION | CRITICAL
    emotion_result: Optional[EmotionOutput]
    risk_result: Optional[RiskOutput]
    intervention_result: Optional[InterventionOutput]
    reflection_result: Optional[ReflectionOutput]
    history: list[dict]  # rolling window of last N events
```

#### B4. Agent 1 — Emotion Analysis Agent

**Prompt design strategy:**
- System prompt establishes the agent as a clinical-grade emotional signal analyzer
- User prompt includes journal text + behavioral metrics
- Output must be structured JSON matching the contract

**Flow:**

```
Receives: journal_text + behavioral_signals + wellness_checkin
        ↓
Constructs prompt:
  "Analyze the following journal entry and behavioral signals.
   Journal: {text}
   Typing speed: {speed} chars/min (baseline: 120)
   Deletion rate: {del_rate}% (baseline: 15%)
   Time of entry: {time}
   Sleep hours: {sleep}
   
   Return JSON with: mood, mood_score (0-100),
   stress_score (0-100), anxiety_score (0-100),
   emotional_volatility (0.0-1.0)"
        ↓
Calls LLM (OpenAI / Ollama)
        ↓
Parses structured output → EmotionOutput
        ↓
Broadcasts result via WebSocket
        ↓
Passes to next agent in graph
```

**Important:** Include few-shot examples in the prompt so output is reliably structured.

#### B5. Agent 2 — Risk Detection Agent

**Inputs:** EmotionOutput + behavioral signals + session history

**Prompt design strategy:**
- Receives emotion scores + raw signals + historical trend
- Classifies risk level with confidence score
- Determines if escalation is needed

**Flow:**

```
Receives: emotion_result + behavioral_signals + history
        ↓
Constructs prompt:
  "Given the following emotional analysis and behavioral signals,
   classify the mental wellness risk level.
   
   Current scores: stress={stress}, anxiety={anxiety}
   Behavioral: typing at {speed} cpm, {del}% deletions, active at {time}
   History: last 5 readings show {trend}
   
   Classify risk_level as: low | moderate | high | critical
   Set escalation_triggered: true if risk >= high
   List applicable flags from: burnout_risk, panic_indicators,
   emotional_overload, sleep_deprivation, crisis_language
   Return confidence (0.0-1.0)"
        ↓
Calls LLM
        ↓
Parses → RiskOutput
        ↓
IF escalation_triggered:
    → Update monitoring_level in state
    → Emit status message via WebSocket
        ↓
Passes to next agent
```

**Critical safety note:** If `crisis_language` flag is detected, the system MUST surface professional crisis resources (988 Suicide & Crisis Lifeline, Crisis Text Line) rather than attempting AI intervention. Hard-code this as a rule-based check, not an LLM decision.

#### B6. Agent 3 — Intervention Planner Agent

**Inputs:** RiskOutput + EmotionOutput + wellness_checkin

**Flow:**

```
Receives: risk_result + emotion_result + checkin data
        ↓
IF risk_level == "low":
    → skip intervention, pass through
IF risk_level == "moderate":
    → generate light intervention (journaling prompt, mindfulness)
IF risk_level == "high":
    → generate active intervention (box breathing, grounding, CBT)
IF risk_level == "critical":
    → surface crisis resources (hard-coded, not LLM-generated)
    → do NOT generate casual coping exercises
        ↓
Constructs prompt (for moderate/high only):
  "Based on the following risk assessment, generate
   a personalized coping intervention workflow.
   
   Risk: {risk_level}, Flags: {flags}
   Stress: {stress}, Anxiety: {anxiety}
   Sleep: {sleep_hours}, Time: {time}
   
   Select from: box_breathing, grounding_exercise,
   cbt_reframing, journaling_prompt, sleep_recovery,
   mindfulness_prompt
   
   Return: intervention name, ordered workflow steps,
   duration, follow_up status"
        ↓
Calls LLM
        ↓
Parses → InterventionOutput
        ↓
Broadcasts intervention via WebSocket (type: "intervention")
        ↓
Passes to reflection agent
```

#### B7. Agent 4 — Reflection & Insight Agent

**Inputs:** Full orchestration state + session history

**Flow:**

```
Receives: all agent results + rolling history window
        ↓
Constructs prompt:
  "Analyze the following wellness session data and
   generate behavioral insights.
   
   Current session: {current_results}
   Historical readings (last 10): {history}
   
   Identify: correlations, trends, recurring patterns
   Generate: one actionable insight, trend change percentage,
   and 1-2 specific recommendations"
        ↓
Calls LLM
        ↓
Parses → ReflectionOutput
        ↓
Broadcasts insight via WebSocket
        ↓
Writes complete event to database (via db_client interface)
```

#### B8. LangGraph Orchestrator

Define the agent pipeline as a LangGraph StateGraph:

```
                    ┌──────────────┐
  signal arrives →  │  Ingest Node │
                    └──────┬───────┘
                           ↓
                    ┌──────────────┐
                    │ Emotion Agent│
                    └──────┬───────┘
                           ↓
                    ┌──────────────┐
                    │  Risk Agent  │
                    └──────┬───────┘
                           ↓
                   ┌───────┴────────┐
                   │  Conditional   │
                   │  Router        │
                   └───┬────────┬───┘
                       ↓        ↓
              risk >= moderate   risk == low
                       ↓        ↓
              ┌────────────┐  ┌─────┐
              │Intervention│  │ Skip│
              │   Agent    │  └──┬──┘
              └─────┬──────┘     │
                    ↓            │
              ┌─────┴────────────┘
              ↓
       ┌──────────────┐
       │  Reflection   │
       │    Agent      │
       └──────┬───────┘
              ↓
       ┌──────────────┐
       │  Persist to   │
       │  Database     │
       └──────────────┘
```

**Key behaviors:**
- The graph runs end-to-end on every incoming signal
- The conditional router skips intervention for low-risk signals
- Each node emits its result over WebSocket as soon as it completes (streaming feel)
- The orchestrator tracks monitoring_level across invocations per session

#### B9. Autonomous Monitoring Loop

Beyond responding to user signals, add a background task that:

```
Every 60 seconds (if session active):
        ↓
Check: has user been inactive > 5 minutes at unusual hour?
        ↓
If monitoring_level >= ELEVATED:
    → trigger a wellness check-in prompt via WebSocket
    → increase check-in frequency
        ↓
If monitoring_level returns to NORMAL for 3 consecutive readings:
    → decrease monitoring intensity
    → emit status update
```

This makes the system feel genuinely autonomous, not just reactive.

#### B10. Database Writer Interface

Define a `db_client.py` with a clear interface that Person C implements:

```python
class WellnessDBClient:
    async def write_event(self, event: WellnessEvent) -> None: ...
    async def get_history(self, session_id: str, limit: int) -> list[WellnessEvent]: ...
    async def get_trends(self, session_id: str, period: str) -> TrendData: ...
```

Person B codes against this interface with a simple in-memory mock. Person C swaps in the real ClickHouse implementation.

---

### Person B Deliverables Checklist

- [ ] FastAPI project with Pydantic models
- [ ] WebSocket server + connection manager
- [ ] Orchestration state definition
- [ ] Emotion Analysis Agent with prompt
- [ ] Risk Detection Agent with prompt + crisis safeguard
- [ ] Intervention Planner Agent with prompt
- [ ] Reflection & Insight Agent with prompt
- [ ] LangGraph StateGraph with conditional routing
- [ ] Autonomous monitoring background loop
- [ ] Database client interface (mock implementation)
- [ ] Test with canned signal payloads (no frontend needed)

---

## Person C — Data, Analytics & Sponsor Integrations

### Responsibility

The data persistence layer, analytics APIs, and all three sponsor tool integrations (Datadog, ClickHouse, Senso). Also owns the analytics story for the demo.

### Tech Stack

- ClickHouse (analytics DB)
- Datadog (APM + custom metrics)
- Senso (behavioral signal ingestion)
- Python (FastAPI endpoints for analytics)
- SQL (ClickHouse queries)

---

### Task Breakdown

#### C1. ClickHouse Setup & Schema

**Deploy ClickHouse** (Docker for local, ClickHouse Cloud for demo):

```bash
docker run -d --name clickhouse \
  -p 8123:8123 -p 9000:9000 \
  clickhouse/clickhouse-server
```

**Create the main table:**

```sql
CREATE TABLE wellness_events (
    timestamp DateTime,
    session_id String,
    mood_score Int32,
    stress_score Int32,
    anxiety_score Int32,
    risk_level String,
    typing_speed Int32,
    deletion_frequency Int32,
    sleep_hours Int32,
    intervention_type String,
    monitoring_level String,
    emotional_volatility Float32
) ENGINE = MergeTree()
PARTITION BY toDate(timestamp)
ORDER BY (session_id, timestamp);
```

**Create a materialized view for trend aggregation:**

```sql
CREATE MATERIALIZED VIEW wellness_hourly_agg
ENGINE = AggregatingMergeTree()
ORDER BY (session_id, hour)
AS SELECT
    session_id,
    toStartOfHour(timestamp) AS hour,
    avg(stress_score) AS avg_stress,
    avg(anxiety_score) AS avg_anxiety,
    avg(mood_score) AS avg_mood,
    max(risk_level) AS max_risk,
    count() AS event_count
FROM wellness_events
GROUP BY session_id, hour;
```

#### C2. Database Client Implementation

Implement the `WellnessDBClient` interface defined by Person B:

```
write_event(event):
        ↓
    Validate event against Pydantic model
        ↓
    Insert into ClickHouse wellness_events table
        ↓
    Push custom metric to Datadog (event_written)

get_history(session_id, limit):
        ↓
    SELECT * FROM wellness_events
    WHERE session_id = {session_id}
    ORDER BY timestamp DESC
    LIMIT {limit}
        ↓
    Return as list[WellnessEvent]

get_trends(session_id, period):
        ↓
    Query wellness_hourly_agg for the period
        ↓
    Compute: trend direction, percentage change, correlations
        ↓
    Return as TrendData
```

#### C3. Analytics REST Endpoints

Build FastAPI endpoints consumed by Person A's analytics view:

**Endpoint 1: `GET /analytics/timeline/{session_id}`**

```
Query params: period (1h | 6h | 24h | 7d)
        ↓
SELECT timestamp, stress_score, anxiety_score, mood_score
FROM wellness_events
WHERE session_id = {id} AND timestamp > now() - interval {period}
ORDER BY timestamp
        ↓
Returns: array of { timestamp, stress, anxiety, mood }
→ Frontend renders as line chart
```

**Endpoint 2: `GET /analytics/correlation/{session_id}`**

```
Returns: sleep_hours vs stress_score data points
        ↓
SELECT sleep_hours, avg(stress_score) as avg_stress
FROM wellness_events
WHERE session_id = {id}
GROUP BY sleep_hours
ORDER BY sleep_hours
        ↓
Returns: array of { sleep_hours, avg_stress }
→ Frontend renders as scatter plot
```

**Endpoint 3: `GET /analytics/interventions/{session_id}`**

```
SELECT timestamp, intervention_type, risk_level, stress_score
FROM wellness_events
WHERE session_id = {id} AND intervention_type != ''
ORDER BY timestamp DESC
        ↓
Returns: intervention history with context
→ Frontend renders as table
```

**Endpoint 4: `GET /analytics/summary/{session_id}`**

```
Returns aggregate stats:
  - total sessions
  - average stress / anxiety / mood
  - most common risk level
  - most deployed intervention
  - trend direction (improving / declining / stable)
```

#### C4. Seed Data Generator

Create a script that generates realistic synthetic data so you can develop dashboards independently:

```
generate_seed_data(days=7, events_per_day=24):
        ↓
    For each day:
        ↓
        Generate events with realistic patterns:
          - stress rises in late-night hours
          - mood correlates inversely with stress
          - sleep deprivation increases anxiety next day
          - occasional HIGH risk events trigger interventions
          - insert some "good days" for contrast
        ↓
    Bulk insert into ClickHouse
        ↓
    Verify with: SELECT count() FROM wellness_events
```

This lets you build and demo analytics dashboards before real data flows in.

#### C5. Datadog Integration

**Setup:**
- Install `ddtrace` and `datadog` Python packages
- Configure DD_API_KEY, DD_APP_KEY, DD_SITE

**What to instrument:**

```
1. Agent Execution Traces
   ─────────────────────
   Wrap each agent call with Datadog APM spans:
   
   with tracer.trace("agent.emotion", service="mindmesh"):
       result = await emotion_agent.run(state)
   
   This creates a trace showing:
   orchestrator
     └─ agent.emotion (120ms)
     └─ agent.risk (85ms)
     └─ agent.intervention (200ms)
     └─ agent.reflection (150ms)

2. Custom Metrics
   ──────────────
   Push metrics on every event:
   - mindmesh.stress_score (gauge)
   - mindmesh.risk_level (count by level)
   - mindmesh.intervention.deployed (count by type)
   - mindmesh.monitoring_level (gauge)
   - mindmesh.agent.latency (histogram per agent)
   - mindmesh.escalation.triggered (count)

3. Monitors / Alerts (demo value)
   ───────────────────────────────
   Create a Datadog monitor:
   "Alert when mindmesh.risk_level:critical > 3 in 5 minutes"
   
   This shows judges that the system has production-grade alerting.
```

**Demo flow:**

```
User submits journal entry
        ↓
Datadog APM shows the full trace:
  ingest → emotion → risk → intervention → reflection → db_write
        ↓
Custom dashboard shows:
  - Agent latency breakdown
  - Risk level distribution
  - Escalation event timeline
  - Intervention deployment rate
```

#### C6. Senso Integration

Senso provides behavioral signal ingestion.

**Integration flow:**

```
Frontend captures typing signals
        ↓
Signals sent to backend via WebSocket
        ↓
Backend forwards behavioral data to Senso:
  - typing cadence
  - activity patterns
  - behavioral fluctuations
  - sleep consistency
        ↓
Senso processes and returns enriched behavioral analysis
        ↓
Enriched data feeds into the Emotion Agent alongside raw signals
```

**Implementation:**
- Set up Senso SDK / API client
- Create a `SensoClient` class with methods:
  - `ingest_behavior(signals: BehavioralSignal) -> EnrichedBehavior`
  - `get_behavior_summary(session_id: str) -> BehaviorSummary`
- Integrate into the orchestrator's ingest node (coordinate with Person B)

#### C7. Datadog Dashboard for Demo

Build a Datadog dashboard titled "MindMesh — Autonomous Orchestration" with these widgets:

```
┌─────────────────────────────────────────────────────┐
│  MindMesh — Autonomous Orchestration Dashboard      │
├──────────────────────┬──────────────────────────────┤
│ Agent Latency        │ Risk Level Distribution      │
│ (timeseries, by      │ (pie chart: low/mod/high/    │
│  agent name)         │  critical)                   │
├──────────────────────┼──────────────────────────────┤
│ Escalation Events    │ Intervention Deployments     │
│ (event timeline)     │ (bar chart by type)          │
├──────────────────────┼──────────────────────────────┤
│ Stress Score         │ Active Orchestration Traces  │
│ (timeseries gauge)   │ (APM trace list)             │
└──────────────────────┴──────────────────────────────┘
```

This is what you show judges during Minute 2 of the demo to prove real-time observability.

---

### Person C Deliverables Checklist

- [ ] ClickHouse running with schema + materialized view
- [ ] WellnessDBClient implementation (write + read)
- [ ] Four analytics REST endpoints
- [ ] Seed data generator with realistic patterns
- [ ] Datadog APM tracing on agent pipeline
- [ ] Datadog custom metrics (6+ metrics)
- [ ] Datadog demo dashboard (6 widgets)
- [ ] Senso behavioral signal integration
- [ ] Datadog monitor/alert for critical risk

---

## Integration Plan

### Integration Seam 1: Frontend ↔ Backend (Person A + Person B)

**When:** After both have core functionality working independently (~60-70% through).

**Steps:**

```
1. Person B starts the real FastAPI WebSocket server
2. Person A points frontend WebSocket URL to Person B's server
3. Test: Person A types journal entry →
     Person B's agents process it →
       results stream back to Person A's dashboard
4. Debug: message format mismatches, timing issues, error handling
```

**Likely issues:** JSON field name mismatches, WebSocket reconnection handling, message ordering.

### Integration Seam 2: Backend ↔ Database (Person B + Person C)

**When:** After Person B has agents producing output and Person C has ClickHouse ready.

**Steps:**

```
1. Person C provides the real WellnessDBClient to Person B
2. Person B swaps out mock → real client
3. Test: agent pipeline runs →
     events appear in ClickHouse →
       analytics endpoints return real data
4. Debug: data type mismatches, timestamp formats, missing fields
```

**Likely issues:** Timestamp timezone handling, nullable fields, ClickHouse connection pooling.

### Integration Seam 3: Frontend ↔ Analytics (Person A + Person C)

**When:** After Seam 2 works and real data is flowing.

**Steps:**

```
1. Person A swaps chart mock data for Person C's REST endpoints
2. Test: analytics view shows real emotional trends from ClickHouse
3. Debug: CORS, date formatting, empty states
```

### Integration Seam 4: Datadog Tracing (Person B + Person C)

**When:** Person C wraps Person B's agent calls with Datadog spans.

**Steps:**

```
1. Person C adds ddtrace decorators/context managers to Person B's agent code
2. Test: run full pipeline → verify trace appears in Datadog APM
3. Verify: custom metrics flowing to Datadog dashboard
```

---

## Timeline Recommendation (8-hour hackathon)

| Time Block | Person A | Person B | Person C |
|---|---|---|---|
| Hour 0-0.5 | **All together:** lock contracts, set up repos |  |  |
| Hour 0.5-3 | Scaffold + journal + signal capture | Scaffold + FastAPI + WS server | ClickHouse setup + schema + seed data |
| Hour 3-5 | Dashboard + activity feed + intervention cards | All 4 agents + LangGraph orchestrator | Datadog setup + analytics endpoints |
| Hour 5-6 | **Integration window:** connect A↔B, test WebSocket flow | **Integration window:** connect B↔C, swap mock DB | **Integration window:** connect all, add tracing |
| Hour 6-7 | Polish UI, animations, error states | Autonomous loop, edge cases, crisis safeguard | Datadog dashboard, Senso integration |
| Hour 7-8 | **All together:** dry-run demo 3x, fix bugs, prepare talking points |  |  |

---

## Safety Reminder

This system monitors emotional distress. During development and demo:

- **Never let the AI generate crisis intervention advice.** If `crisis_language` is flagged, hard-code a response that surfaces real resources (988 Lifeline, Crisis Text Line).
- **The demo should explicitly state** this is a monitoring and support tool, not a replacement for professional help.
- **Do not store real user emotional data** beyond the hackathon demo. Use synthetic data for the presentation.
- **The Reflection Agent should never make diagnostic statements.** It reports trends, not diagnoses.
