"""Datadog APM tracing + custom metrics with a no-op fallback.

Enabled when DD_API_KEY is set. When disabled, every function becomes a
zero-overhead pass-through so the rest of the pipeline keeps working.
"""
from __future__ import annotations

import contextlib
import os
import time
from typing import Iterator

from dotenv import load_dotenv

from models import OrchestrationState

load_dotenv()

_tracer = None
_statsd = None
_llmobs = None
_enabled = False
_llmobs_enabled = False


def _init() -> None:
    global _tracer, _statsd, _llmobs, _enabled, _llmobs_enabled
    if not os.getenv("DD_API_KEY"):
        return

    try:
        from ddtrace import tracer as dd_tracer  # type: ignore
        from datadog import initialize, statsd  # type: ignore

        initialize(
            api_key=os.getenv("DD_API_KEY"),
            app_key=os.getenv("DD_APP_KEY"),
            statsd_host=os.getenv("DD_AGENT_HOST", "127.0.0.1"),
            statsd_port=int(os.getenv("DD_DOGSTATSD_PORT", "8125")),
        )
        _tracer = dd_tracer
        _statsd = statsd
        _enabled = True
        print("[datadog] tracing + metrics enabled")
    except Exception as exc:
        print(f"[datadog] disabled ({exc.__class__.__name__}: {exc})")
        _tracer = None
        _statsd = None
        _enabled = False

    if os.getenv("DD_LLMOBS_ENABLED", "0") == "1":
        # Skip the openai-agents integration: our project has a local `agents/`
        # package that shadows the real one and breaks ddtrace's auto-patching.
        existing_patches = os.environ.get("DD_PATCH_MODULES", "")
        if "openai_agents" not in existing_patches:
            os.environ["DD_PATCH_MODULES"] = (
                f"{existing_patches},openai_agents:false".lstrip(",")
            )

        try:
            from ddtrace.llmobs import LLMObs  # type: ignore

            LLMObs.enable(
                ml_app=os.getenv("DD_LLMOBS_ML_APP", "mindmesh"),
                api_key=os.getenv("DD_API_KEY"),
                site=os.getenv("DD_SITE", "datadoghq.com"),
                agentless_enabled=os.getenv("DD_LLMOBS_AGENTLESS_ENABLED", "0") == "1",
            )
            _llmobs = LLMObs
            _llmobs_enabled = True
            print(
                f"[datadog] LLM Observability enabled "
                f"(ml_app={os.getenv('DD_LLMOBS_ML_APP', 'mindmesh')}, "
                f"agentless={os.getenv('DD_LLMOBS_AGENTLESS_ENABLED', '0')})"
            )
        except Exception as exc:
            print(f"[datadog] LLMObs disabled ({exc.__class__.__name__}: {exc})")
            _llmobs = None
            _llmobs_enabled = False


_init()


def is_enabled() -> bool:
    return _enabled


def is_llmobs_enabled() -> bool:
    return _llmobs_enabled


@contextlib.contextmanager
def trace(operation: str, service: str = "mindmesh", **tags: str) -> Iterator[None]:
    """Wrap a block in a Datadog APM span (no-op when disabled)."""
    if _enabled and _tracer is not None:
        with _tracer.trace(operation, service=service) as span:
            for key, value in tags.items():
                span.set_tag(key, value)
            yield
        return

    start = time.perf_counter()
    try:
        yield
    finally:
        elapsed_ms = (time.perf_counter() - start) * 1000
        if os.getenv("MINDMESH_TRACE_LOG", "false").lower() == "true":
            print(f"[trace] {operation} {elapsed_ms:.1f}ms")


@contextlib.contextmanager
def llm_workflow(name: str, session_id: str | None = None) -> Iterator[None]:
    """LLM Observability workflow span (covers the whole pipeline run)."""
    if _llmobs_enabled and _llmobs is not None:
        with _llmobs.workflow(name=name) as span:
            if session_id:
                _llmobs.annotate(span=span, tags={"session_id": session_id})
            yield
        return
    yield


@contextlib.contextmanager
def llm_agent(name: str, session_id: str | None = None) -> Iterator[None]:
    """LLM Observability agent span (one per agent call)."""
    if _llmobs_enabled and _llmobs is not None:
        with _llmobs.agent(name=name) as span:
            if session_id:
                _llmobs.annotate(span=span, tags={"session_id": session_id})
            yield
        return
    yield


def annotate_llm_span(
    input_data: object | None = None,
    output_data: object | None = None,
    tags: dict | None = None,
) -> None:
    """Attach input/output payload + tags to the currently-active LLMObs span."""
    if not (_llmobs_enabled and _llmobs is not None):
        return
    try:
        _llmobs.annotate(input_data=input_data, output_data=output_data, tags=tags or {})
    except Exception as exc:
        if os.getenv("MINDMESH_TRACE_LOG", "false").lower() == "true":
            print(f"[llmobs] annotate failed: {exc}")


def gauge(metric: str, value: float, tags: list[str] | None = None) -> None:
    if _enabled and _statsd is not None:
        _statsd.gauge(metric, value, tags=tags or [])


def increment(metric: str, value: float = 1, tags: list[str] | None = None) -> None:
    if _enabled and _statsd is not None:
        _statsd.increment(metric, value, tags=tags or [])


def histogram(metric: str, value: float, tags: list[str] | None = None) -> None:
    if _enabled and _statsd is not None:
        _statsd.histogram(metric, value, tags=tags or [])


def push_pipeline_metrics(state: OrchestrationState) -> None:
    """Push the canonical MindMesh metric set after each pipeline run."""
    session_tag = f"session:{state.session_id}"

    if state.emotion:
        gauge("mindmesh.stress_score", state.emotion.stress_score, tags=[session_tag])
        gauge("mindmesh.mood_score", state.emotion.mood_score, tags=[session_tag])
        gauge("mindmesh.anxiety_score", state.emotion.anxiety_score, tags=[session_tag])

    if state.risk:
        increment(
            "mindmesh.risk_level",
            tags=[session_tag, f"risk:{state.risk.risk_level}"],
        )
        if state.risk.escalation_triggered:
            increment("mindmesh.escalation.triggered", tags=[session_tag])

    if state.intervention:
        increment(
            "mindmesh.intervention.deployed",
            tags=[
                session_tag,
                f"intervention:{state.intervention.intervention}",
                f"priority:{state.intervention.priority}",
            ],
        )

    monitoring_map = {"NORMAL": 0, "ELEVATED": 1, "HIGH_ATTENTION": 2, "CRITICAL": 3}
    gauge(
        "mindmesh.monitoring_level",
        monitoring_map.get(state.monitoring_level, 0),
        tags=[session_tag],
    )


def record_agent_latency(agent_name: str, elapsed_ms: float) -> None:
    histogram("mindmesh.agent.latency", elapsed_ms, tags=[f"agent:{agent_name}"])
