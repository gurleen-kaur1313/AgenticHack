from langgraph.graph import END, StateGraph

from agents.emotion import EmotionAgent
from agents.intervention import InterventionAgent
from agents.reflection import ReflectionAgent
from agents.risk import RiskAgent
from orchestrator.router import should_intervene, update_monitoring_level
from orchestrator.state import from_orchestration_state, to_orchestration_state
from utils.history import HistoryManager

emotion_agent = EmotionAgent()
risk_agent = RiskAgent()
intervention_agent = InterventionAgent()
reflection_agent = ReflectionAgent()
history_manager = HistoryManager()


async def ingest_node(state: dict) -> dict:
    orch = to_orchestration_state(state)
    orch.history = history_manager.get_history(orch.session_id)
    return from_orchestration_state(orch)


async def emotion_node(state: dict) -> dict:
    orch = await emotion_agent.run(to_orchestration_state(state))
    return from_orchestration_state(orch)


async def risk_node(state: dict) -> dict:
    orch = await risk_agent.run(to_orchestration_state(state))
    orch = update_monitoring_level(orch)
    return from_orchestration_state(orch)


async def intervention_node(state: dict) -> dict:
    orch = await intervention_agent.run(to_orchestration_state(state))
    return from_orchestration_state(orch)


async def reflection_node(state: dict) -> dict:
    orch = await reflection_agent.run(to_orchestration_state(state))
    return from_orchestration_state(orch)


async def persist_node(state: dict) -> dict:
    orch = to_orchestration_state(state)
    history_manager.add_entry(orch.session_id, orch)
    orch.history = history_manager.get_history(orch.session_id)
    return from_orchestration_state(orch)


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
