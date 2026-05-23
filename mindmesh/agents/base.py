from abc import ABC, abstractmethod

from models import OrchestrationState


class BaseAgent(ABC):
    """Base class for all MindMesh agents."""

    name: str = "base"

    @abstractmethod
    async def run(self, state: OrchestrationState) -> OrchestrationState:
        """Read state, perform work, write results, return updated state."""
        pass

    def log(self, message: str) -> None:
        print(f"[{self.name}] {message}")
