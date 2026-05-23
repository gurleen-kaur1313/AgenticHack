from models import OrchestrationState


class HistoryManager:
    """In-memory rolling window of past orchestration snapshots per session."""

    def __init__(self, max_window: int = 20) -> None:
        self._store: dict[str, list[dict]] = {}
        self.max_window = max_window

    def add_entry(self, session_id: str, state: OrchestrationState) -> None:
        snapshot = {
            "timestamp": state.signal.client_timestamp.isoformat(),
            "stress_score": state.emotion.stress_score if state.emotion else None,
            "anxiety_score": state.emotion.anxiety_score if state.emotion else None,
            "mood_score": state.emotion.mood_score if state.emotion else None,
            "risk_level": state.risk.risk_level if state.risk else None,
            "monitoring_level": state.monitoring_level,
        }
        entries = self._store.setdefault(session_id, [])
        entries.append(snapshot)
        if len(entries) > self.max_window:
            self._store[session_id] = entries[-self.max_window :]

    def get_history(self, session_id: str, limit: int = 10) -> list[dict]:
        entries = self._store.get(session_id, [])
        return entries[-limit:]

    def get_trend(
        self, session_id: str, field: str = "stress_score", window: int = 5
    ) -> tuple[str, float]:
        entries = self.get_history(session_id, limit=window)
        values = [entry[field] for entry in entries if entry.get(field) is not None]
        if len(values) < 2:
            return "stable", 0.0

        first = values[0]
        last = values[-1]
        if first == 0:
            pct_change = 100.0 if last > 0 else 0.0
        else:
            pct_change = ((last - first) / first) * 100.0

        if pct_change > 10:
            direction = "rising"
        elif pct_change < -10:
            direction = "falling"
        else:
            direction = "stable"
        return direction, round(pct_change, 1)
