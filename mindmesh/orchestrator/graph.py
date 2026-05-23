import time

from langgraph.graph import END, StateGraph

from agents.emotion import EmotionAgent
from agents.intervention import InterventionAgent
from agents.reflection import ReflectionAgent
from agents.risk import RiskAgent
from orchestrator.router import should_intervene, update_monitoring_level
from orchestrator.state import from_orchestration_state, to_orchestration_state
from utils import datadog as dd
from utils.db_client import db_client, event_from_state
from utils.history import HistoryManager
from utils.senso import enrichment_to_dict, senso_client

emotion_agent = EmotionAgent()
risk_agent = RiskAgent()
intervention_agent = InterventionAgent()
reflection_agent = ReflectionAgent()
history_manager = HistoryManager()

if db_client.enabled:
    db_client.init_schema()


async def _run_traced(agent_name: str, agent, state_dict: dict) -> dict:
    orch = to_orchestration_state(state_dict)
    start = time.perf_counter()
    with dd.trace(f"agent.{agent_name}", agent=agent_name, session_id=orch.session_id):
        orch = await agent.run(orch)
    elapsed_ms = (time.perf_counter() - start) * 1000
    dd.record_agent_latency(agent_name, elapsed_ms)
    return from_orchestration_state(orch)


async def ingest_node(state: dict) -> dict:
    orch = to_orchestration_state(state)
    with dd.trace("orchestrator.ingest", session_id=orch.session_id):
        orch.history = history_manager.get_history(orch.session_id)
        enrichment = await senso_client.enrich(orch.signal)
        result = from_orchestration_state(orch)
        result["senso_enrichment"] = enrichment_to_dict(enrichment)
    return result


async def emotion_node(state: dict) -> dict:
    return await _run_traced("emotion", emotion_agent, state)


async def risk_node(state: dict) -> dict:
    orch = to_orchestration_state(state)
    start = time.perf_counter()
    with dd.trace("agent.risk", agent="risk", session_id=orch.session_id):
        orch = await risk_agent.run(orch)
        orch = update_monitoring_level(orch)
    dd.record_agent_latency("risk", (time.perf_counter() - start) * 1000)
    result = from_orchestration_state(orch)
    result["senso_enrichment"] = state.get("senso_enrichment")
    return result


async def intervention_node(state: dict) -> dict:
    result = await _run_traced("intervention", intervention_agent, state)
    result["senso_enrichment"] = state.get("senso_enrichment")
    return result


async def reflection_node(state: dict) -> dict:
    result = await _run_traced("reflection", reflection_agent, state)
    result["senso_enrichment"] = state.get("senso_enrichment")
    return result


async def persist_node(state: dict) -> dict:
    orch = to_orchestration_state(state)
    with dd.trace("orchestrator.persist", session_id=orch.session_id):
        history_manager.add_entry(orch.session_id, orch)
        db_client.write_event(event_from_state(orch))
        dd.push_pipeline_metrics(orch)
        orch.history = history_manager.get_history(orch.session_id)
    result = from_orchestration_state(orch)
    result["senso_enrichment"] = state.get("senso_enrichment")
    return result


def build_pipeline():
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
    graph.add_conditional_edges(
        "risk",
        should_intervene,
        {"intervene": "intervention", "skip": "reflection"},
    )
    graph.add_edge("intervention", "reflection")
    graph.add_edge("reflection", "persist")
    graph.add_edge("persist", END)

    return graph.compile()


pipeline = build_pipeline()
