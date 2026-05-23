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
_enabled = False


def _init() -> None:
    global _tracer, _statsd, _enabled
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


_init()


def is_enabled() -> bool:
    return _enabled


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
