from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class BehavioralSignal(BaseModel):
    journal_text: str
    typing_speed: int
    pause_frequency: int
    deletion_frequency: int
    inactivity_duration_ms: int
    burst_typing: bool
    client_timestamp: datetime


class WellnessCheckin(BaseModel):
    sleep_hours: int = Field(ge=0, le=12)
    stress_level: int = Field(ge=1, le=10)
    mood_score: int = Field(ge=1, le=10)
    energy_level: int = Field(ge=1, le=10)


class EmotionResult(BaseModel):
    mood: str
    mood_score: int = Field(ge=0, le=100)
    stress_score: int = Field(ge=0, le=100)
    anxiety_score: int = Field(ge=0, le=100)
    emotional_volatility: float = Field(ge=0.0, le=1.0)


class RiskResult(BaseModel):
    risk_level: str
    escalation_triggered: bool
    confidence: float = Field(ge=0.0, le=1.0)
    flags: list[str]


class InterventionResult(BaseModel):
    intervention: str
    workflow: list[str]
    duration: str
    follow_up: str
    priority: str


class ReflectionResult(BaseModel):
    insight: str
    trend_change: str
    period: str
    recommendations: list[str]


class OrchestrationState(BaseModel):
    session_id: str
    signal: BehavioralSignal
    checkin: Optional[WellnessCheckin] = None
    monitoring_level: str = "NORMAL"
    emotion: Optional[EmotionResult] = None
    risk: Optional[RiskResult] = None
    intervention: Optional[InterventionResult] = None
    reflection: Optional[ReflectionResult] = None
    history: list[dict] = Field(default_factory=list)
