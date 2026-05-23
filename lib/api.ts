import type { Intervention, MoodPoint, WellnessSignal } from "@/lib/types";

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
