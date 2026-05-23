import type { Agent, AgentEvent, Intervention, MoodPoint, WellnessSignal } from "@/lib/types";

export const agents: Agent[] = [
  {
    id: "emotion",
    name: "Emotion Agent",
    role: "Sentiment and volatility scoring",
    status: "analyzing",
    confidence: 91,
    lastAction: "Detected stress inflection in journal tone",
    throughput: 34,
  },
  {
    id: "risk",
    name: "Risk Agent",
    role: "Burnout and escalation monitoring",
    status: "monitoring",
    confidence: 87,
    lastAction: "Raised monitoring level to elevated",
    throughput: 19,
  },
  {
    id: "intervention",
    name: "Intervention Agent",
    role: "Autonomous support plan selection",
    status: "intervening",
    confidence: 84,
    lastAction: "Deployed box breathing workflow",
    throughput: 12,
  },
  {
    id: "reflection",
    name: "Reflection Agent",
    role: "Pattern mining and weekly insights",
    status: "idle",
    confidence: 78,
    lastAction: "Queued sleep-stress correlation summary",
    throughput: 8,
  },
];

export const wellnessSignals: WellnessSignal[] = [
  {
    id: "typing-speed",
    label: "Typing speed",
    value: 184,
    unit: "wpm",
    delta: 18,
    trend: "up",
    riskLevel: "moderate",
  },
  {
    id: "pause-frequency",
    label: "Pause frequency",
    value: 14,
    unit: "pauses",
    delta: 6,
    trend: "up",
    riskLevel: "high",
  },
  {
    id: "deletions",
    label: "Deletion rate",
    value: 41,
    unit: "edits",
    delta: 12,
    trend: "up",
    riskLevel: "high",
  },
  {
    id: "inactivity",
    label: "Inactivity window",
    value: 4.5,
    unit: "sec",
    delta: -1.1,
    trend: "down",
    riskLevel: "low",
  },
];

export const moodTrends: MoodPoint[] = [
  { time: "08:00", mood: 68, stress: 42, anxiety: 37 },
  { time: "09:00", mood: 64, stress: 48, anxiety: 42 },
  { time: "10:00", mood: 58, stress: 61, anxiety: 55 },
  { time: "11:00", mood: 52, stress: 72, anxiety: 63 },
  { time: "12:00", mood: 49, stress: 78, anxiety: 70 },
  { time: "13:00", mood: 54, stress: 66, anxiety: 61 },
  { time: "14:00", mood: 61, stress: 57, anxiety: 50 },
];

export const stressTrends = moodTrends.map((point) => ({
  time: point.time,
  stress: point.stress,
}));

export const interventionHistory: Intervention[] = [
  {
    id: "int-001",
    title: "Box breathing reset",
    type: "breathing",
    status: "active",
    priority: "immediate",
    durationMinutes: 2,
    triggeredBy: "High deletion rate and negative sentiment shift",
    timestamp: "2026-05-23T14:18:00Z",
  },
  {
    id: "int-002",
    title: "Grounding exercise",
    type: "grounding",
    status: "queued",
    priority: "recommended",
    durationMinutes: 3,
    triggeredBy: "Anxiety score above baseline",
    timestamp: "2026-05-23T14:22:00Z",
  },
  {
    id: "int-003",
    title: "Sleep recovery reflection",
    type: "sleep",
    status: "completed",
    priority: "routine",
    durationMinutes: 5,
    triggeredBy: "Three-day low sleep pattern",
    timestamp: "2026-05-23T09:05:00Z",
  },
];

export const agentEvents: AgentEvent[] = [
  {
    id: "evt-001",
    agentId: "emotion",
    event: "Mood score dropped below rolling seven-day baseline",
    timestamp: "14:17:21",
    severity: "moderate",
  },
  {
    id: "evt-002",
    agentId: "risk",
    event: "Risk classifier flagged burnout indicators",
    timestamp: "14:17:29",
    severity: "high",
  },
  {
    id: "evt-003",
    agentId: "intervention",
    event: "Selected immediate box breathing protocol",
    timestamp: "14:18:02",
    severity: "moderate",
  },
  {
    id: "evt-004",
    agentId: "reflection",
    event: "Correlated stress spike with low sleep duration",
    timestamp: "14:19:44",
    severity: "low",
  },
];
