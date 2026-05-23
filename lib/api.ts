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

export interface PipelineResponse {
  session_id: string;
  emotion: EmotionPayload | null;
  risk: RiskPayload | null;
  intervention: InterventionPayload | null;
  reflection: ReflectionPayload | null;
  monitoring_level: string;
  history: Array<Record<string, unknown>>;
}

export async function analyzeSignal(signal: BehavioralSignalPayload): Promise<PipelineResponse> {
  return request<PipelineResponse>("/analyze", {
    method: "POST",
    body: JSON.stringify(signal),
  });
}
