import json
import uuid
from datetime import datetime
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from models import BehavioralSignal, OrchestrationState, WellnessCheckin
from orchestrator.graph import history_manager, pipeline
from orchestrator.state import to_orchestration_state

app = FastAPI(title="MindMesh")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Latest pipeline result per session (powers dashboard REST stubs)
_session_cache: dict[str, dict[str, Any]] = {}


def _parse_incoming_message(raw: str) -> tuple[BehavioralSignal | None, WellnessCheckin | None]:
    data = json.loads(raw)
    if "type" in data:
        msg_type = data["type"]
        payload = data.get("payload", data.get("data", {}))
        if msg_type == "wellness_checkin":
            return None, WellnessCheckin(**payload)
        if msg_type == "signal":
            return BehavioralSignal(**payload), None
        if msg_type == "intervention_ack":
            return None, None
    return BehavioralSignal(**data), None


def _build_initial_state(
    session_id: str,
    signal: BehavioralSignal,
    checkin: WellnessCheckin | None = None,
) -> dict:
    return {
        "session_id": session_id,
        "signal": signal,
        "checkin": checkin,
        "monitoring_level": "NORMAL",
        "history": history_manager.get_history(session_id),
    }


def _serialize_pipeline_result(result: dict) -> dict:
    orch = to_orchestration_state(result)
    return {
        "session_id": orch.session_id,
        "emotion": orch.emotion.model_dump() if orch.emotion else None,
        "risk": orch.risk.model_dump() if orch.risk else None,
        "intervention": orch.intervention.model_dump() if orch.intervention else None,
        "reflection": orch.reflection.model_dump() if orch.reflection else None,
        "monitoring_level": orch.monitoring_level,
        "history": orch.history,
    }


async def _run_pipeline(session_id: str, state: dict) -> dict:
    result = await pipeline.ainvoke(state)
    payload = _serialize_pipeline_result(result)
    _session_cache[session_id] = payload
    return payload


async def _handle_websocket(websocket: WebSocket, session_id: str) -> None:
    await websocket.accept()
    pending_checkin: WellnessCheckin | None = None
    try:
        while True:
            raw = await websocket.receive_text()
            signal, checkin = _parse_incoming_message(raw)
            if checkin:
                pending_checkin = checkin
                continue
            if signal is None:
                continue

            state = _build_initial_state(session_id, signal, pending_checkin)
            payload = await _run_pipeline(session_id, state)
            pending_checkin = None
            await websocket.send_json(payload)
    except WebSocketDisconnect:
        return
    except Exception as exc:
        print(f"WS error [{session_id}]: {exc}")
        await websocket.close()


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await _handle_websocket(websocket, session_id)


@app.websocket("/ws/sessions/{session_id}")
async def websocket_sessions_endpoint(websocket: WebSocket, session_id: str):
    """Alias used by the Next.js client in lib/api.ts."""
    await _handle_websocket(websocket, session_id)


@app.post("/analyze")
async def analyze(signal: BehavioralSignal):
    session_id = str(uuid.uuid4())
    state = _build_initial_state(session_id, signal)
    return await _run_pipeline(session_id, state)


@app.get("/signals")
async def get_signals():
    """Dashboard wellness signals — stub data aligned with frontend types."""
    cached = next(iter(_session_cache.values()), None)
    risk_level = "moderate"
    if cached and cached.get("risk"):
        risk_level = cached["risk"]["risk_level"]

    return [
        {
            "id": "typing-speed",
            "label": "Typing speed",
            "value": 184,
            "unit": "wpm",
            "delta": 18,
            "trend": "up",
            "riskLevel": risk_level,
        },
        {
            "id": "pause-frequency",
            "label": "Pause frequency",
            "value": 14,
            "unit": "pauses",
            "delta": 6,
            "trend": "up",
            "riskLevel": "high" if risk_level in ("high", "critical") else "moderate",
        },
        {
            "id": "deletions",
            "label": "Deletion rate",
            "value": 41,
            "unit": "edits",
            "delta": 12,
            "trend": "up",
            "riskLevel": "high" if risk_level in ("high", "critical") else "moderate",
        },
        {
            "id": "inactivity",
            "label": "Inactivity window",
            "value": 4.5,
            "unit": "sec",
            "delta": -1.1,
            "trend": "down",
            "riskLevel": "low",
        },
    ]


@app.get("/analytics/mood")
async def get_mood_analytics():
    """Mood trend series for the analytics chart."""
    now = datetime.now()
    return [
        {
            "time": now.replace(hour=9, minute=0).strftime("%H:%M"),
            "mood": 62,
            "stress": 48,
            "anxiety": 40,
        },
        {
            "time": now.replace(hour=12, minute=0).strftime("%H:%M"),
            "mood": 55,
            "stress": 58,
            "anxiety": 52,
        },
        {
            "time": now.replace(hour=15, minute=0).strftime("%H:%M"),
            "mood": 42,
            "stress": 72,
            "anxiety": 65,
        },
        {
            "time": now.replace(hour=18, minute=0).strftime("%H:%M"),
            "mood": 35,
            "stress": 85,
            "anxiety": 78,
        },
    ]


@app.post("/interventions/{intervention_id}/deploy")
async def deploy_intervention(intervention_id: str):
    return {
        "id": intervention_id,
        "title": "Box breathing + grounding",
        "type": "breathing",
        "status": "active",
        "priority": "immediate",
        "durationMinutes": 2,
        "triggeredBy": "intervention_agent",
        "timestamp": datetime.now().isoformat(),
    }
