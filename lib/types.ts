export type AgentStatus = "idle" | "monitoring" | "analyzing" | "intervening" | "escalated";

export type RiskLevel = "low" | "moderate" | "high" | "critical";

export type MonitoringLevel = "normal" | "elevated" | "high_attention" | "critical";

export interface Agent {
  id: string;
  name: string;
  role: string;
  status: AgentStatus;
  confidence: number;
  lastAction: string;
  throughput: number;
}

export interface WellnessSignal {
  id: string;
  label: string;
  value: number;
  unit: string;
  delta: number;
  trend: "up" | "down" | "stable";
  riskLevel: RiskLevel;
}

export interface Intervention {
  id: string;
  title: string;
  type: "breathing" | "grounding" | "reflection" | "sleep" | "escalation";
  status: "queued" | "active" | "completed";
  priority: "routine" | "recommended" | "immediate";
  durationMinutes: number;
  triggeredBy: string;
  timestamp: string;
}

export interface MoodPoint {
  time: string;
  mood: number;
  stress: number;
  anxiety: number;
}

export interface AgentEvent {
  id: string;
  agentId: string;
  event: string;
  timestamp: string;
  severity: RiskLevel;
}
