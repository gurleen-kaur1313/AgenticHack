import type { Intervention, MoodPoint, RiskLevel, WellnessSignal } from "@/lib/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`MindMesh API request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function fetchWellnessSignals(): Promise<WellnessSignal[]> {
  return request<WellnessSignal[]>("/signals");
}

export async function fetchMoodTrends(): Promise<MoodPoint[]> {
  return request<MoodPoint[]>("/analytics/mood");
}

export async function deployIntervention(interventionId: string): Promise<Intervention> {
  return request<Intervention>(`/interventions/${interventionId}/deploy`, {
    method: "POST",
  });
}

export function createSignalSocket(sessionId: string): WebSocket {
  return new WebSocket(`${API_BASE_URL.replace(/^http/, "ws")}/ws/sessions/${sessionId}`);
}

// ---------- Pipeline integration ----------

export interface BehavioralSignalPayload {
  journal_text: string;
  typing_speed: number;
  pause_frequency: number;
  deletion_frequency: number;
  inactivity_duration_ms: number;
  burst_typing: boolean;
  client_timestamp: string;
}

export interface EmotionPayload {
  mood: string;
  mood_score: number;
  stress_score: number;
  anxiety_score: number;
  emotional_volatility: number;
}

export interface RiskPayload {
  risk_level: RiskLevel;
  escalation_triggered: boolean;
  confidence: number;
  flags: string[];
}

export interface InterventionPayload {
  intervention: string;
  workflow: string[];
  duration: string;
  follow_up: string;
  priority: string;
}

export interface ReflectionPayload {
  insight: string;
  trend_change: string;
  period: string;
  recommendations: string[];
}

export interface SensoEnrichment {
  cadence: string;
  fluctuation_score: number;
  sleep_consistency: string;
  raw?: Record<string, unknown>;
}

export interface PipelineResponse {
  session_id: string;
  emotion: EmotionPayload | null;
  risk: RiskPayload | null;
  intervention: InterventionPayload | null;
  reflection: ReflectionPayload | null;
  monitoring_level: string;
  history: Array<Record<string, unknown>>;
  senso_enrichment: SensoEnrichment | null;
}

export async function analyzeSignal(
  signal: BehavioralSignalPayload,
  sessionId?: string,
): Promise<PipelineResponse> {
  const query = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : "";
  return request<PipelineResponse>(`/analyze${query}`, {
    method: "POST",
    body: JSON.stringify(signal),
  });
}

// ---------- Sponsor integration endpoints ----------

export interface IntegrationStatus {
  clickhouse: boolean;
  datadog: boolean;
  senso: boolean;
}

export interface HealthResponse {
  status: string;
  integrations: IntegrationStatus;
}

export async function fetchHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/health");
}

export interface AnalyticsTimelinePoint {
  timestamp: string;
  stress: number;
  anxiety: number;
  mood: number;
}

export async function fetchAnalyticsTimeline(
  sessionId: string,
  period: "1h" | "6h" | "24h" | "7d" = "24h",
): Promise<AnalyticsTimelinePoint[]> {
  return request<AnalyticsTimelinePoint[]>(`/analytics/timeline/${sessionId}?period=${period}`);
}

export interface AnalyticsSummary {
  total_sessions: number;
  avg_stress: number;
  avg_anxiety: number;
  avg_mood: number;
  most_common_risk: string;
  most_deployed_intervention: string;
  trend_direction: string;
}

export async function fetchAnalyticsSummary(sessionId: string): Promise<AnalyticsSummary> {
  return request<AnalyticsSummary>(`/analytics/summary/${sessionId}`);
}

export interface AnalyticsInterventionRow {
  timestamp: string;
  intervention_type: string;
  risk_level: string;
  stress_score: number;
}

export async function fetchAnalyticsInterventions(
  sessionId: string,
): Promise<AnalyticsInterventionRow[]> {
  return request<AnalyticsInterventionRow[]>(`/analytics/interventions/${sessionId}`);
}

export interface AnalyticsCorrelationPoint {
  sleep_hours: number;
  avg_stress: number;
  avg_anxiety?: number;
}

export async function fetchAnalyticsCorrelation(
  sessionId: string,
): Promise<AnalyticsCorrelationPoint[]> {
  return request<AnalyticsCorrelationPoint[]>(`/analytics/correlation/${sessionId}`);
}
