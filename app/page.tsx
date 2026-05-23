"use client";

import { motion } from "framer-motion";
import {
  Activity,
  AlertCircle,
  BarChart2,
  Brain,
  ChevronRight,
  Clock,
  Keyboard,
  Moon,
  Play,
  RotateCcw,
  Sparkles,
  TrendingUp,
  Wind,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  analyzeSignal,
  fetchAnalyticsCorrelation,
  fetchAnalyticsInterventions,
  fetchAnalyticsSummary,
  fetchAnalyticsTimeline,
  fetchHealth,
  type AnalyticsCorrelationPoint,
  type AnalyticsInterventionRow,
  type AnalyticsSummary,
  type AnalyticsTimelinePoint,
  type IntegrationStatus,
  type PipelineResponse,
  // type SensoEnrichment, // senso card removed
} from "@/lib/api";
import { interventionHistory, moodTrends } from "@/lib/mock-data";
import type { AgentStatus, MoodPoint, RiskLevel } from "@/lib/types";

// ─── palette ──────────────────────────────────────────────────────────────────
const C = {
  teal:   "#0F766E",
  amber:  "#C2740C",
  indigo: "#5B5BD6",
  green:  "#3E8E5A",
  coral:  "#C0543E",
  ink:    "#1C1D1A",
  canvas: "#F2F1ED",
} as const;

const RING_R    = 72;
const RING_CIRC = 2 * Math.PI * RING_R;

// ─── types (identical to original) ───────────────────────────────────────────
type AgentId = "emotion" | "risk" | "intervention" | "reflection";

type DemoAgent = {
  id: AgentId;
  name: string;
  role: string;
  status: Extract<AgentStatus, "idle" | "running" | "complete">;
  output: string;
  progress: number;
};

type TimelineEvent = {
  id: string;
  agent: string;
  message: string;
  timestamp: string;
  tone: "neutral" | "running" | "complete" | "risk";
};

type InterventionCard = {
  id: string;
  title: string;
  body: string;
  protocol: string;
  minutes: number;
};

type AgentOutput = {
  stress: number;
  anxiety: number;
  mood: number;
  risk: RiskLevel;
  intervention: InterventionCard | null;
  insight: string;
};

type HistoryQuestionId =
  | "stress_trend"
  | "sleep_anxiety"
  | "intervention_frequency"
  | "baseline_compare";

type HistoryAnswer = { question: string; answer: string };

// ─── constants (identical to original) ────────────────────────────────────────
const MIN_WORDS_TO_ANALYZE = 1;
const initialTimelineTimestamp = "--:--:--";

const initialAgents: DemoAgent[] = [
  {
    id: "emotion",
    name: "Emotion Analysis",
    role: "Scores stress, anxiety, mood from journal language.",
    status: "idle",
    output: "Waiting for sufficient journal signal.",
    progress: 0,
  },
  {
    id: "risk",
    name: "Risk Detection",
    role: "Classifies wellness risk from behavior and context.",
    status: "idle",
    output: "No escalation criteria active.",
    progress: 0,
  },
  {
    id: "intervention",
    name: "Intervention Planner",
    role: "Selects a support protocol based on detected state.",
    status: "idle",
    output: "Standing by for planning request.",
    progress: 0,
  },
  {
    id: "reflection",
    name: "Reflection Agent",
    role: "Summarizes patterns and creates a brief insight.",
    status: "idle",
    output: "No pattern summary published.",
    progress: 0,
  },
];

const seedIntervention: InterventionCard = {
  id: interventionHistory[0]?.id ?? "seed",
  title: interventionHistory[0]?.title ?? "Box breathing reset",
  body: interventionHistory[0]?.triggeredBy ?? "Elevated stress signal detected.",
  protocol: "4-4-4-4 breathing",
  minutes: interventionHistory[0]?.durationMinutes ?? 2,
};

const historyQuestions: Array<{
  id: HistoryQuestionId;
  Icon: LucideIcon;
  label: string;
}> = [
  { id: "stress_trend",           Icon: TrendingUp, label: "Has this user's stress increased over time?" },
  { id: "sleep_anxiety",          Icon: Moon,       label: "Does low sleep correlate with higher anxiety?" },
  { id: "intervention_frequency", Icon: Activity,   label: "Which interventions were deployed most often?" },
  { id: "baseline_compare",       Icon: BarChart2,  label: "Is this session worse than the recent baseline?" },
];

// ─── main component ───────────────────────────────────────────────────────────
export default function Home() {
  const [activeTab, setActiveTab]               = useState<"today" | "history">("today");
  const [journalText, setJournalText]           = useState("");
  const [deleteCount, setDeleteCount]           = useState(0);
  const [sleepHours, setSleepHours]             = useState(5.5);
  const [lastInputAt, setLastInputAt]           = useState(0);
  const [firstKeystrokeAt, setFirstKeystrokeAt] = useState(0);
  const [pauseCount, setPauseCount]             = useState(0);
  const [maxPauseMs, setMaxPauseMs]             = useState(0);
  const [sessionStartedAt, setSessionStartedAt] = useState(0);
  const [now, setNow]                           = useState(0);
  const [agents, setAgents]                     = useState<DemoAgent[]>(initialAgents);
  const [timeline, setTimeline]                 = useState<TimelineEvent[]>([
    {
      id: "boot",
      agent: "System",
      message: "Monitoring mode active. Client-side signal stream initialized.",
      timestamp: initialTimelineTimestamp,
      tone: "neutral",
    },
  ]);
  const [output, setOutput] = useState<AgentOutput>({
    stress: 42,
    anxiety: 37,
    mood: 68,
    risk: "low",
    intervention: seedIntervention,
    insight: "Baseline patterns are stable. No autonomous workflow is currently active.",
  });
  const [trendData, setTrendData]               = useState<MoodPoint[]>(moodTrends);
  const [workflowActive, setWorkflowActive]     = useState(false);
  const [sessionId, setSessionId]               = useState<string | null>(null);
  const [integrations, setIntegrations]         = useState<IntegrationStatus | null>(null);
  // const [senso, setSenso] = useState<SensoEnrichment | null>(null); // senso card removed
  const [analyticsSummary, setAnalyticsSummary] = useState<AnalyticsSummary | null>(null);
  const [historyAnswer, setHistoryAnswer]       = useState<HistoryAnswer | null>(null);
  const [historyQuestionLoading, setHistoryQuestionLoading] =
    useState<HistoryQuestionId | null>(null);
  const [backendStatus, setBackendStatus] =
    useState<"idle" | "connected" | "fallback">("idle");

  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  // ─── computed ──────────────────────────────────────────────────────────────
  const wordCount = useMemo(
    () => journalText.trim().split(/\s+/).filter(Boolean).length,
    [journalText],
  );
  const sessionSeconds =
    now > 0 && sessionStartedAt > 0
      ? Math.max(1, Math.floor((now - sessionStartedAt) / 1000))
      : 0;
  const typingWindowMs =
    firstKeystrokeAt > 0 && lastInputAt > firstKeystrokeAt
      ? Math.max(1000, lastInputAt - firstKeystrokeAt)
      : 1000;
  const typingSpeed =
    journalText.length > 0
      ? Math.round(journalText.length / 5 / (typingWindowMs / 60000))
      : 0;
  const idleSeconds      = Math.max(0, Math.floor((now - lastInputAt) / 1000));
  const hasEnoughContent = wordCount >= MIN_WORDS_TO_ANALYZE;
  const riskLevel        = output.risk;
  const accent           = riskAccent(riskLevel);
  const wellnessScore    = Math.round(
    (output.mood + (100 - output.stress) + (100 - output.anxiety)) / 3,
  );
  const ringDash    = RING_CIRC * (wellnessScore / 100);
  const currentTime =
    now > 0
      ? new Date(now).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        })
      : "";
  const agentsActive = agents.some((a) => a.status !== "idle");

  // ─── callbacks ─────────────────────────────────────────────────────────────
  const addTimeline = useCallback(
    (agent: string, message: string, tone: TimelineEvent["tone"]) => {
      setTimeline((current) =>
        [
          {
            id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            agent,
            message,
            timestamp: formatTime(new Date()),
            tone,
          },
          ...current,
        ].slice(0, 9),
      );
    },
    [],
  );

  const updateAgent = useCallback(
    (id: AgentId, patch: Partial<DemoAgent>) => {
      setAgents((current) =>
        current.map((a) => (a.id === id ? { ...a, ...patch } : a)),
      );
    },
    [],
  );

  const resetTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const runWorkflow = useCallback(async () => {
    if (!hasEnoughContent || workflowActive) return;

    resetTimers();
    setWorkflowActive(true);
    setAgents(initialAgents);

    const liveJournalText = journalText.trim();
    const isSevere =
      liveJournalText.toLowerCase().includes("panic") ||
      liveJournalText.toLowerCase().includes("overwhelmed") ||
      liveJournalText.toLowerCase().includes("can't sleep");

    const fallback: AgentOutput = {
      stress:  isSevere ? 91 : 78,
      anxiety: isSevere ? 88 : 72,
      mood:    isSevere ? 28 : 42,
      risk:    isSevere ? "high" : "moderate",
      intervention: isSevere
        ? {
            id: "grounding-urgent",
            title: "Grounding reset",
            body: "Autonomous planner selected a 5-4-3-2-1 sensory grounding protocol.",
            protocol: "5 senses grounding",
            minutes: 3,
          }
        : {
            id: "box-breathing",
            title: "Box breathing reset",
            body: "Autonomous planner selected a short breathing protocol for acute stress load.",
            protocol: "4-4-4-4 breathing",
            minutes: 2,
          },
      insight: isSevere
        ? "Stress language, deletion behavior, and low sleep input are converging. Recommend immediate downshift and follow-up check-in."
        : "Journal tone and typing behavior show a stress spike above baseline. A short reset is recommended before continuing.",
    };

    addTimeline("Orchestrator", "Manual journal analysis requested.", "risk");

    let pipeline: PipelineResponse | null = null;
    try {
      pipeline = await analyzeSignal(
        {
          journal_text: liveJournalText,
          typing_speed: Math.max(20, typingSpeed),
          pause_frequency: pauseCount,
          deletion_frequency: deleteCount,
          inactivity_duration_ms: maxPauseMs,
          burst_typing: deleteCount > 25 || typingSpeed > 160,
          client_timestamp: new Date().toISOString(),
        },
        sessionId ?? undefined,
      );
      setBackendStatus("connected");
      addTimeline("Backend", "Pipeline response received from /analyze.", "complete");
      if (pipeline.session_id && pipeline.session_id !== sessionId) {
        setSessionId(pipeline.session_id);
      }
      // senso card removed — keeping enrichment data in pipeline but not displaying
      // if (pipeline.senso_enrichment) {
      //   setSenso(pipeline.senso_enrichment);
      //   addTimeline("Senso", `Behavior enriched: ${pipeline.senso_enrichment.cadence}, sleep ${pipeline.senso_enrichment.sleep_consistency}.`, "complete");
      // }
      try {
        const summary = await fetchAnalyticsSummary(pipeline.session_id);
        setAnalyticsSummary(summary);
        addTimeline(
          "ClickHouse",
          `Analytics summary refreshed (${summary.total_sessions} events, trend ${summary.trend_direction}).`,
          "complete",
        );
      } catch {
        /* silent */
      }
    } catch {
      setBackendStatus("fallback");
      addTimeline(
        "Backend",
        "Backend unreachable — using local mock pipeline.",
        "neutral",
      );
    }

    const nextOutput = mergePipelineWithFallback(pipeline, fallback);

    const steps: Array<{
      delay: number;
      id: AgentId;
      status: DemoAgent["status"];
      progress: number;
      output: string;
      event: string;
      tone: TimelineEvent["tone"];
    }> = [
      { delay: 250,  id: "emotion",      status: "running",  progress: 45,  output: "Parsing journal tone and volatility markers.",              event: "Emotion analysis started.",                                        tone: "running"   },
      { delay: 1050, id: "emotion",      status: "complete", progress: 100, output: `Stress ${nextOutput.stress}, anxiety ${nextOutput.anxiety}, mood ${nextOutput.mood}.`, event: `Emotion scores: stress ${nextOutput.stress}, anxiety ${nextOutput.anxiety}.`, tone: "complete" },
      { delay: 1350, id: "risk",         status: "running",  progress: 48,  output: "Combining behavioral and check-in signals.",                event: "Risk classifier evaluating session.",                              tone: "running"   },
      { delay: 2150, id: "risk",         status: "complete", progress: 100, output: `${nextOutput.risk.toUpperCase()} wellness risk.`,           event: `Risk level: ${nextOutput.risk}.`,                                 tone: nextOutput.risk === "high" ? "risk" : "complete" },
      { delay: 2450, id: "intervention", status: "running",  progress: 60,  output: "Selecting lowest-friction support protocol.",               event: "Intervention planner selecting protocol.",                         tone: "running"   },
      { delay: 3300, id: "intervention", status: "complete", progress: 100, output: `${nextOutput.intervention?.title} published.`,              event: `${nextOutput.intervention?.title} card deployed.`,                 tone: "complete"  },
      { delay: 3600, id: "reflection",   status: "running",  progress: 58,  output: "Creating concise pattern insight.",                         event: "Reflection agent summarizing pattern.",                            tone: "running"   },
      { delay: 4400, id: "reflection",   status: "complete", progress: 100, output: nextOutput.insight,                                          event: "Reflection insight published.",                                    tone: "complete"  },
    ];

    steps.forEach((step) => {
      timersRef.current.push(
        setTimeout(() => {
          updateAgent(step.id, {
            status: step.status,
            progress: step.progress,
            output: step.output,
          });
          addTimeline(
            initialAgents.find((a) => a.id === step.id)?.name ?? step.id,
            step.event,
            step.tone,
          );
        }, step.delay),
      );
    });

    timersRef.current.push(
      setTimeout(() => {
        setOutput(nextOutput);
        setTrendData((current) => [
          ...current.slice(-6),
          {
            time:    formatTime(new Date()),
            mood:    nextOutput.mood,
            stress:  nextOutput.stress,
            anxiety: nextOutput.anxiety,
          },
        ]);
        setWorkflowActive(false);
      }, 4550),
    );
  }, [
    addTimeline,
    deleteCount,
    hasEnoughContent,
    journalText,
    maxPauseMs,
    pauseCount,
    resetTimers,
    sessionId,
    typingSpeed,
    updateAgent,
    workflowActive,
  ]);

  const answerHistoryQuestion = useCallback(
    async (questionId: HistoryQuestionId) => {
      const question =
        historyQuestions.find((q) => q.id === questionId)?.label ?? "History question";
      if (!sessionId) {
        setHistoryAnswer({
          question,
          answer:
            "Analyze at least one journal entry first so MindMesh has a session id to query.",
        });
        return;
      }
      setHistoryQuestionLoading(questionId);
      try {
        const [tl, correlation, interventions, summary] = await Promise.all([
          fetchAnalyticsTimeline(sessionId, "7d"),
          fetchAnalyticsCorrelation(sessionId),
          fetchAnalyticsInterventions(sessionId),
          fetchAnalyticsSummary(sessionId),
        ]);
        setAnalyticsSummary(summary);
        setHistoryAnswer({
          question,
          answer: buildHistoryAnswer(questionId, {
            timeline: tl,
            correlation,
            interventions,
            summary,
            current: output,
          }),
        });
        addTimeline("ClickHouse", `Answered: ${question}`, "complete");
      } catch {
        setHistoryAnswer({
          question,
          answer:
            "Could not query the history store. Start the backend and make sure ClickHouse or the in-memory fallback has events for this session.",
        });
        addTimeline(
          "ClickHouse",
          "History question failed; analytics endpoint unavailable.",
          "neutral",
        );
      } finally {
        setHistoryQuestionLoading(null);
      }
    },
    [addTimeline, output, sessionId],
  );

  // ─── effects ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const startedAt = Date.now();
    setSessionStartedAt(startedAt);
    setLastInputAt(startedAt);
    setNow(startedAt);
    setTimeline((c) =>
      c.map((e) =>
        e.id === "boot"
          ? { ...e, timestamp: formatTime(new Date(startedAt)) }
          : e,
      ),
    );
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const health = await fetchHealth();
        if (!cancelled) setIntegrations(health.integrations);
      } catch {
        if (!cancelled)
          setIntegrations({ clickhouse: false, datadog: false, senso: false });
      }
    };
    void load();
    const interval = setInterval(() => void load(), 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => resetTimers, [resetTimers]);

  const onJournalChange = (value: string) => {
    const stamp = Date.now();
    if (firstKeystrokeAt === 0 && value.length > 0) setFirstKeystrokeAt(stamp);
    if (lastInputAt > 0 && stamp - lastInputAt > 2000) setPauseCount((c) => c + 1);
    if (lastInputAt > 0) setMaxPauseMs((prev) => Math.max(prev, stamp - lastInputAt));
    setJournalText(value);
    setLastInputAt(stamp);
  };

  // ─── render ────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: C.canvas,
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      }}
    >
      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <header
        style={{
          backgroundColor: "rgba(255,255,255,0.9)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(0,0,0,0.06)",
          position: "sticky",
          top: 0,
          zIndex: 30,
        }}
      >
        <div
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            padding: "12px 24px",
            display: "flex",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                backgroundColor: C.teal,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Brain size={20} color="#fff" />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    fontSize: 16,
                    fontWeight: 800,
                    letterSpacing: "-0.02em",
                    color: C.ink,
                  }}
                >
                  MindMesh
                </span>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    backgroundColor: "#DCFCE7",
                    color: "#15803D",
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: 999,
                  }}
                >
                  <motion.span
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      backgroundColor: "#22C55E",
                      display: "inline-block",
                    }}
                  />
                  Live
                </span>
              </div>
              <p
                style={{
                  fontSize: 11,
                  color: "#9CA3AF",
                  fontWeight: 500,
                  margin: 0,
                }}
              >
                Autonomous wellness orchestration
              </p>
            </div>
          </div>

          {/* Sponsor chips — reflect live /health status */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginLeft: "auto",
              flexShrink: 0,
            }}
          >
            <SponsorChip label="ClickHouse" active={integrations?.clickhouse ?? false} />
            <SponsorChip label="Datadog"    active={integrations?.datadog    ?? false} />
            {/* <SponsorChip label="Senso" active={integrations?.senso ?? false} /> */}
          </div>

          {/* Tab control */}
          <div
            style={{
              display: "flex",
              gap: 4,
              padding: 4,
              backgroundColor: "#F3F4F6",
              borderRadius: 14,
              flexShrink: 0,
            }}
          >
            {(["today", "history"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: "6px 18px",
                  borderRadius: 10,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 700,
                  backgroundColor: activeTab === tab ? "#fff" : "transparent",
                  color: activeTab === tab ? C.ink : "#9CA3AF",
                  boxShadow:
                    activeTab === tab ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
                  transition: "all 0.2s",
                }}
              >
                {tab === "today" ? "Today" : "Ask History"}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── CONTENT ────────────────────────────────────────────────────────── */}
      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 24px" }}>
        {activeTab === "today" ? (
          /* ── TODAY — two-column layout ──────────────────────────────────── */
          <div
            className="mindmesh-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "clamp(300px, 44%, 520px) 1fr",
              gap: 24,
              alignItems: "start",
            }}
          >
            {/* LEFT ─────────────────────────────────────────────────────── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Journal */}
              <PCard>
                <p
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "#9CA3AF",
                    marginBottom: 4,
                  }}
                >
                  Good morning · {currentTime}
                </p>
                <h2
                  style={{
                    fontSize: 24,
                    fontWeight: 800,
                    letterSpacing: "-0.03em",
                    color: C.ink,
                    margin: "0 0 16px",
                  }}
                >
                  How are you feeling?
                </h2>
                <textarea
                  className="journal-textarea"
                  placeholder={`Start writing freely…\n\nDemo triggers: overwhelmed · panic · can't sleep · anxious · burnout`}
                  value={journalText}
                  onChange={(e) => onJournalChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Backspace" || e.key === "Delete")
                      setDeleteCount((c) => c + 1);
                  }}
                />
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginTop: 12,
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 500, color: "#9CA3AF" }}>
                    {wordCount} {wordCount === 1 ? "word" : "words"}
                  </span>
                  <button
                    onClick={() => void runWorkflow()}
                    disabled={!hasEnoughContent || workflowActive}
                    style={{
                      padding: "8px 20px",
                      borderRadius: 12,
                      border: "none",
                      cursor:
                        hasEnoughContent && !workflowActive
                          ? "pointer"
                          : "not-allowed",
                      fontSize: 13,
                      fontWeight: 700,
                      color: "#fff",
                      backgroundColor: C.teal,
                      opacity: !hasEnoughContent || workflowActive ? 0.35 : 1,
                      transition: "opacity 0.2s",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Activity size={13} />
                    {workflowActive ? "Analyzing…" : "Analyze journal"}
                  </button>
                </div>
              </PCard>

              {/* Behavioral signals */}
              <PCard>
                <h3
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: C.ink,
                    margin: "0 0 16px",
                  }}
                >
                  Behavioral signals
                </h3>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 10,
                    marginBottom: 12,
                  }}
                >
                  <StatPill Icon={Keyboard}  label="Typing speed" value={typingSpeed} unit="wpm" />
                  <StatPill Icon={RotateCcw} label="Deletions"    value={deleteCount} unit="keys" />
                  <StatPill Icon={Clock}     label="Idle time"    value={idleSeconds} unit="sec" />
                  <StatPill Icon={Activity}  label="Session"      value={fmtDuration(sessionSeconds)} />
                </div>
                {/* Sleep slider */}
                <div
                  style={{
                    backgroundColor: "#F9F9F7",
                    borderRadius: 16,
                    padding: "12px 14px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 8,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Moon size={14} color={C.indigo} />
                      <span
                        style={{ fontSize: 13, fontWeight: 500, color: "#6B7280" }}
                      >
                        Sleep last night
                      </span>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 800, color: C.ink }}>
                      {sleepHours.toFixed(1)}h
                    </span>
                  </div>
                  <input
                    aria-label="Sleep hours"
                    type="range"
                    min="0"
                    max="10"
                    step="0.5"
                    value={sleepHours}
                    onChange={(e) => setSleepHours(Number(e.target.value))}
                    style={{ width: "100%" }}
                  />
                </div>
              </PCard>

              {/* senso card removed
              {senso && (
                <SensoCard enrichment={senso} enabled={integrations?.senso ?? false} />
              )} */}

              {/* ClickHouse summary — appears after first successful /analytics call */}
              {analyticsSummary && analyticsSummary.total_sessions > 0 && (
                <ClickHouseSummaryCard
                  summary={analyticsSummary}
                  enabled={integrations?.clickhouse ?? false}
                />
              )}
            </div>

            {/* RIGHT ────────────────────────────────────────────────────── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Wellness score ring */}
              <PCard
                className="animate-fade-rise"
                style={{ display: "flex", flexDirection: "column", alignItems: "center" }}
              >
                <h3
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: C.ink,
                    margin: "0 0 16px",
                    alignSelf: "flex-start",
                  }}
                >
                  Wellness score
                </h3>
                <div style={{ position: "relative", width: 176, height: 176 }}>
                  <svg width="176" height="176" viewBox="0 0 176 176">
                    <circle
                      cx="88"
                      cy="88"
                      r={RING_R}
                      fill="none"
                      stroke="#F3F4F6"
                      strokeWidth="12"
                    />
                    <circle
                      cx="88"
                      cy="88"
                      r={RING_R}
                      fill="none"
                      stroke={accent}
                      strokeWidth="12"
                      strokeLinecap="round"
                      strokeDasharray={`${ringDash} ${RING_CIRC - ringDash}`}
                      strokeDashoffset={RING_CIRC / 4}
                      style={{
                        transition:
                          "stroke-dasharray 1.1s cubic-bezier(.4,0,.2,1), stroke 0.5s ease",
                      }}
                    />
                  </svg>
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 48,
                        fontWeight: 800,
                        letterSpacing: "-0.04em",
                        color: accent,
                        lineHeight: 1,
                      }}
                    >
                      {wellnessScore}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        color: "#9CA3AF",
                        marginTop: 4,
                      }}
                    >
                      Wellness
                    </span>
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 8,
                    marginTop: 16,
                  }}
                >
                  <span style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>
                    {riskLabel(riskLevel)}
                  </span>
                  <RiskPill risk={riskLevel} />
                </div>
              </PCard>

              {/* Agent workflow panel — visible once agents start running */}
              {(workflowActive || agentsActive) && (
                <PCard className="animate-fade-rise delay-1">
                  <h3
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: C.ink,
                      margin: "0 0 16px",
                    }}
                  >
                    {workflowActive ? "Agents running…" : "Agent analysis complete"}
                  </h3>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 0.8fr",
                      gap: 16,
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {agents.map((a) => (
                        <AgentWorkflowCard key={a.id} agent={a} />
                      ))}
                    </div>
                    <TimelineFeed events={timeline} />
                  </div>
                </PCard>
              )}

              {/* Metrics bars */}
              <PCard className="animate-fade-rise delay-2">
                <h3
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: C.ink,
                    margin: "0 0 18px",
                  }}
                >
                  Your metrics
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <MetricBar label="Stress"  value={output.stress}  color={C.coral}  sublabel="higher = worse" />
                  <MetricBar label="Anxiety" value={output.anxiety} color={C.indigo} sublabel="higher = worse" />
                  <MetricBar label="Mood"    value={output.mood}    color={C.green}  sublabel="higher = better" />
                </div>
              </PCard>

              {/* Trends today — line chart */}
              <PCard className="animate-fade-rise delay-3">
                <h3
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: C.ink,
                    margin: "0 0 16px",
                  }}
                >
                  Trends today
                </h3>
                <ResponsiveContainer width="100%" height={190}>
                  <LineChart
                    data={trendData}
                    margin={{ top: 4, right: 8, bottom: 0, left: -24 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 11, fill: "#9CA3AF" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#9CA3AF" }}
                      axisLine={false}
                      tickLine={false}
                      domain={[0, 100]}
                    />
                    <Tooltip content={<ChartTip />} />
                    <Legend
                      iconType="circle"
                      iconSize={7}
                      wrapperStyle={{ fontSize: 12, fontWeight: 600, paddingTop: 10 }}
                    />
                    <Line type="monotone" dataKey="mood"    name="Mood"    stroke={C.green}  strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="stress"  name="Stress"  stroke={C.coral}  strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="anxiety" name="Anxiety" stroke={C.indigo} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </PCard>

              {/* Stress intensity — area chart */}
              <PCard className="animate-fade-rise delay-4">
                <h3
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: C.ink,
                    margin: "0 0 16px",
                  }}
                >
                  Stress intensity
                </h3>
                <ResponsiveContainer width="100%" height={140}>
                  <AreaChart
                    data={trendData}
                    margin={{ top: 4, right: 8, bottom: 0, left: -24 }}
                  >
                    <defs>
                      <linearGradient id="stressGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={accent} stopOpacity={0.35} />
                        <stop offset="95%" stopColor={accent} stopOpacity={0}    />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 11, fill: "#9CA3AF" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#9CA3AF" }}
                      axisLine={false}
                      tickLine={false}
                      domain={[0, 100]}
                    />
                    <Tooltip content={<ChartTip />} />
                    <Area
                      type="monotone"
                      dataKey="stress"
                      name="Stress"
                      stroke={accent}
                      strokeWidth={2.5}
                      fill="url(#stressGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </PCard>

              {/* Intervention card */}
              {output.intervention && (
                <PCard className="animate-fade-rise delay-5">
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      marginBottom: 16,
                    }}
                  >
                    <div>
                      <p
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          letterSpacing: "0.1em",
                          textTransform: "uppercase",
                          color: "#9CA3AF",
                          marginBottom: 4,
                        }}
                      >
                        Recommended intervention
                      </p>
                      <h3
                        style={{
                          fontSize: 16,
                          fontWeight: 800,
                          color: C.ink,
                          margin: 0,
                        }}
                      >
                        {output.intervention.title}
                      </h3>
                    </div>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        padding: "3px 10px",
                        borderRadius: 999,
                        backgroundColor: "#F3F4F6",
                        color: "#6B7280",
                        flexShrink: 0,
                      }}
                    >
                      {output.intervention.minutes} min
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      marginBottom: 18,
                    }}
                  >
                    <BreathingDot
                      active={riskLevel === "high" || riskLevel === "critical"}
                    />
                    <span
                      style={{ fontSize: 13, fontWeight: 600, color: C.ink }}
                    >
                      {output.intervention.protocol}
                    </span>
                  </div>
                  <button
                    style={{
                      width: "100%",
                      padding: "10px 0",
                      borderRadius: 14,
                      border: "none",
                      cursor: "pointer",
                      fontSize: 14,
                      fontWeight: 700,
                      color: "#fff",
                      backgroundColor: accent,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      transition: "opacity 0.2s",
                    }}
                  >
                    <Play size={15} />
                    Start session
                  </button>
                </PCard>
              )}

              {/* Reflection insight */}
              <PCard>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 12,
                  }}
                >
                  <Sparkles size={15} color={C.indigo} />
                  <h3
                    style={{ fontSize: 14, fontWeight: 700, color: C.ink, margin: 0 }}
                  >
                    Reflection insight
                  </h3>
                </div>
                <p
                  style={{ fontSize: 13, lineHeight: 1.75, color: "#6B7280", margin: 0 }}
                >
                  {output.insight}
                </p>
              </PCard>
            </div>
          </div>
        ) : (
          /* ── ASK HISTORY TAB ─────────────────────────────────────────────── */
          <div
            style={{ maxWidth: 640, margin: "0 auto" }}
            className="animate-fade-rise"
          >
            <PCard>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 24,
                }}
              >
                <div style={{ flex: 1 }}>
                  <h2
                    style={{
                      fontSize: 18,
                      fontWeight: 800,
                      letterSpacing: "-0.02em",
                      color: C.ink,
                      margin: 0,
                    }}
                  >
                    Ask History
                  </h2>
                  <p
                    style={{
                      fontSize: 12,
                      color: "#9CA3AF",
                      fontWeight: 500,
                      margin: "2px 0 0",
                    }}
                  >
                    Answers from your stored session events
                  </p>
                </div>
                <SponsorChip
                  label="ClickHouse"
                  active={integrations?.clickhouse ?? false}
                />
              </div>

              {/* Amber notice when no session yet */}
              {!sessionId && (
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    padding: "12px 16px",
                    borderRadius: 16,
                    marginBottom: 20,
                    backgroundColor: "#FFFBEB",
                    border: "1px solid #FDE68A",
                  }}
                >
                  <AlertCircle
                    size={15}
                    color={C.amber}
                    style={{ marginTop: 1, flexShrink: 0 }}
                  />
                  <p
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: "#92400E",
                      margin: 0,
                    }}
                  >
                    Analyze a journal entry first to create a session history.
                  </p>
                </div>
              )}

              {/* Question rows */}
              <div style={{ display: "flex", flexDirection: "column" }}>
                {historyQuestions.map(({ id, Icon, label }, i) => (
                  <button
                    key={id}
                    onClick={() => void answerHistoryQuestion(id)}
                    disabled={historyQuestionLoading !== null}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      padding: "14px 10px",
                      width: "100%",
                      textAlign: "left",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      borderBottom:
                        i < historyQuestions.length - 1
                          ? "1px solid #F3F4F6"
                          : "none",
                      borderRadius: 12,
                      opacity: historyQuestionLoading !== null ? 0.6 : 1,
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                        "#F9F9F7";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                        "transparent";
                    }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        flexShrink: 0,
                        backgroundColor: "#F0FDFA",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Icon size={15} color={C.teal} />
                    </div>
                    <span
                      style={{ flex: 1, fontSize: 13, fontWeight: 600, color: C.ink }}
                    >
                      {historyQuestionLoading === id
                        ? "Querying history…"
                        : label}
                    </span>
                    <ChevronRight size={15} color="#D1D5DB" />
                  </button>
                ))}
              </div>

              {/* Answer display */}
              {historyAnswer && (
                <div
                  style={{
                    marginTop: 20,
                    padding: "16px 18px",
                    borderRadius: 16,
                    backgroundColor: "#F0FDFA",
                    border: "1px solid #99F6E4",
                  }}
                >
                  <p
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: C.teal,
                      marginBottom: 8,
                    }}
                  >
                    {historyAnswer.question}
                  </p>
                  <p
                    style={{
                      fontSize: 13,
                      lineHeight: 1.75,
                      color: C.ink,
                      margin: 0,
                    }}
                  >
                    {historyAnswer.answer}
                  </p>
                </div>
              )}
            </PCard>
          </div>
        )}
      </main>

      {/* Responsive stacking */}
      <style>{`
        @media (max-width: 768px) {
          .mindmesh-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

// ─── design primitives ────────────────────────────────────────────────────────
function PCard({
  children,
  className,
  style = {},
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={className}
      style={{
        background: "#fff",
        borderRadius: 24,
        boxShadow: "0 2px 20px rgba(0,0,0,0.055)",
        padding: 24,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function SponsorChip({ label, active }: { label: string; active: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 12px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        backgroundColor: active ? "#F0FDFA" : "#F3F4F6",
        color: active ? C.teal : "#9CA3AF",
        border: `1px solid ${active ? "#99F6E4" : "#E5E7EB"}`,
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          backgroundColor: active ? C.teal : "#D1D5DB",
          display: "inline-block",
        }}
      />
      {label}
    </div>
  );
}

function StatPill({
  Icon,
  label,
  value,
  unit,
}: {
  Icon: LucideIcon;
  label: string;
  value: number | string;
  unit?: string;
}) {
  return (
    <div
      style={{
        background: "#F9F9F7",
        borderRadius: 16,
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#9CA3AF" }}>
        <Icon size={13} />
        <span style={{ fontSize: 11, fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <span
          style={{
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: "-0.03em",
            color: C.ink,
          }}
        >
          {value}
        </span>
        {unit && (
          <span style={{ fontSize: 11, fontWeight: 500, color: "#9CA3AF" }}>
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

function MetricBar({
  label,
  value,
  color,
  sublabel,
}: {
  label: string;
  value: number;
  color: string;
  sublabel: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{label}</span>
          <span style={{ fontSize: 11, color: "#9CA3AF" }}>· {sublabel}</span>
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color }}>{value}</span>
      </div>
      <div
        style={{
          height: 10,
          background: "#F3F4F6",
          borderRadius: 999,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            borderRadius: 999,
            backgroundColor: color,
            width: `${value}%`,
            transition: "width 1.1s cubic-bezier(.4,0,.2,1)",
          }}
        />
      </div>
    </div>
  );
}

function AgentWorkflowCard({ agent }: { agent: DemoAgent }) {
  const isRunning = agent.status === "running";
  const isDone    = agent.status === "complete";
  return (
    <div
      style={{
        borderRadius: 14,
        padding: "12px 14px",
        position: "relative",
        overflow: "hidden",
        border: `1px solid ${isRunning ? "#99F6E4" : isDone ? "#CCFBF1" : "#F3F4F6"}`,
        backgroundColor: isRunning ? "#F0FDFA" : "#FAFAFA",
      }}
    >
      {isRunning && (
        <motion.div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 3,
            backgroundColor: C.teal,
          }}
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.2, repeat: Infinity }}
        />
      )}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>
          {agent.name}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: "2px 8px",
            borderRadius: 999,
            backgroundColor: isDone
              ? "#F0FDFA"
              : isRunning
              ? "#FFFBEB"
              : "#F3F4F6",
            color: isDone ? C.teal : isRunning ? C.amber : "#9CA3AF",
          }}
        >
          {isDone ? "complete" : isRunning ? "running" : "idle"}
        </span>
      </div>
      <p
        style={{
          fontSize: 11,
          color: "#6B7280",
          marginBottom: 8,
          lineHeight: 1.4,
        }}
      >
        {agent.output}
      </p>
      <div
        style={{
          height: 4,
          background: "#F3F4F6",
          borderRadius: 999,
          overflow: "hidden",
        }}
      >
        <motion.div
          animate={{ width: `${agent.progress}%` }}
          transition={{ duration: 0.5 }}
          style={{
            height: "100%",
            borderRadius: 999,
            backgroundColor: isDone ? C.teal : isRunning ? "#60DEC0" : "#E5E7EB",
          }}
        />
      </div>
    </div>
  );
}

function TimelineFeed({ events }: { events: TimelineEvent[] }) {
  const dotColor = (tone: TimelineEvent["tone"]) => {
    if (tone === "complete") return C.teal;
    if (tone === "running")  return C.amber;
    if (tone === "risk")     return C.coral;
    return "#9CA3AF";
  };
  return (
    <div
      style={{
        borderRadius: 14,
        backgroundColor: "#F9F9F7",
        padding: 14,
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        maxHeight: 280,
      }}
    >
      <p
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: "#9CA3AF",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: 10,
        }}
      >
        Live timeline
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {events.map((event) => (
          <div
            key={event.id}
            style={{
              display: "flex",
              gap: 8,
              padding: "5px 0",
              borderBottom: "1px solid rgba(0,0,0,0.04)",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                backgroundColor: dotColor(event.tone),
                flexShrink: 0,
                marginTop: 4,
              }}
            />
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: C.ink, margin: 0 }}>
                {event.agent}
              </p>
              <p
                style={{
                  fontSize: 10,
                  color: "#6B7280",
                  margin: 0,
                  lineHeight: 1.4,
                }}
              >
                {event.message}
              </p>
              <p style={{ fontSize: 9, color: "#9CA3AF", margin: 0 }}>
                {event.timestamp}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BreathingDot({ active }: { active: boolean }) {
  return (
    <div
      style={{
        position: "relative",
        width: 32,
        height: 32,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <motion.div
        animate={active ? { scale: [1, 1.5, 1] } : {}}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: "absolute",
          width: 32,
          height: 32,
          borderRadius: "50%",
          backgroundColor: active ? "#FDE68A" : "#CCFBF1",
          opacity: 0.55,
        }}
      />
      <div
        style={{
          position: "relative",
          width: 10,
          height: 10,
          borderRadius: "50%",
          backgroundColor: active ? C.amber : C.teal,
        }}
      />
    </div>
  );
}

function RiskPill({ risk }: { risk: RiskLevel }) {
  const bg  =
    risk === "high" || risk === "critical" ? "#FEE2E2" :
    risk === "moderate"                    ? "#FFFBEB" : "#F0FDFA";
  const fg  =
    risk === "high" || risk === "critical" ? "#DC2626" :
    risk === "moderate"                    ? C.amber   : C.teal;
  const bdr =
    risk === "high" || risk === "critical" ? "#FCA5A5" :
    risk === "moderate"                    ? "#FDE68A" : "#99F6E4";
  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 600,
        padding: "3px 12px",
        borderRadius: 999,
        backgroundColor: bg,
        color: fg,
        border: `1px solid ${bdr}`,
      }}
    >
      {risk.charAt(0).toUpperCase() + risk.slice(1)} risk
    </span>
  );
}

// senso card removed — component kept for reference
// function SensoCard({ enrichment, enabled }: { enrichment: SensoEnrichment; enabled: boolean }) {
//   return (
//     <PCard>
//       <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
//         <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
//           <Wind size={14} color={C.indigo} />
//           <h3 style={{ fontSize: 14, fontWeight: 700, color: C.ink, margin: 0 }}>Senso enrichment</h3>
//         </div>
//         <SponsorChip label={enabled ? "live" : "heuristic"} active={enabled} />
//       </div>
//       <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
//         {[
//           { label: "Cadence",      value: enrichment.cadence },
//           { label: "Fluctuation",  value: enrichment.fluctuation_score.toFixed(2) },
//           { label: "Sleep",        value: enrichment.sleep_consistency },
//         ].map(({ label, value }) => (
//           <div key={label} style={{ backgroundColor: "#F9F9F7", borderRadius: 12, padding: "10px 12px" }}>
//             <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9CA3AF", margin: "0 0 4px" }}>{label}</p>
//             <p style={{ fontSize: 13, fontWeight: 700, color: C.ink, margin: 0, textTransform: "capitalize" }}>{value}</p>
//           </div>
//         ))}
//       </div>
//     </PCard>
//   );
// }

function ClickHouseSummaryCard({
  summary,
  enabled,
}: {
  summary: AnalyticsSummary;
  enabled: boolean;
}) {
  return (
    <PCard>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <h3 style={{ fontSize: 14, fontWeight: 700, color: C.ink, margin: 0 }}>
          ClickHouse summary
        </h3>
        <SponsorChip label={enabled ? "clickhouse" : "in-memory"} active={enabled} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
        {[
          { label: "Events",     value: summary.total_sessions.toString() },
          { label: "Trend",      value: summary.trend_direction },
          { label: "Avg stress", value: summary.avg_stress.toString() },
          { label: "Top risk",   value: summary.most_common_risk },
        ].map(({ label, value }) => (
          <div
            key={label}
            style={{
              backgroundColor: "#F9F9F7",
              borderRadius: 12,
              padding: "10px 12px",
            }}
          >
            <p
              style={{
                fontSize: 10,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#9CA3AF",
                margin: "0 0 4px",
              }}
            >
              {label}
            </p>
            <p
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: C.ink,
                margin: 0,
                textTransform: "capitalize",
              }}
            >
              {value}
            </p>
          </div>
        ))}
      </div>
    </PCard>
  );
}

function ChartTip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 12,
        boxShadow: "0 4px 24px rgba(0,0,0,0.1)",
        padding: "10px 14px",
        fontSize: 12,
        fontWeight: 600,
        color: C.ink,
      }}
    >
      <p style={{ margin: "0 0 6px", color: "#9CA3AF", fontWeight: 500 }}>{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ margin: "2px 0", color: p.color }}>
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
}

// ─── pure helpers (all logic identical to original) ───────────────────────────
function riskLabel(risk: RiskLevel): string {
  if (risk === "critical" || risk === "high") return "Needs care";
  if (risk === "moderate") return "Monitor";
  return "Balanced";
}

function riskAccent(risk: RiskLevel): string {
  if (risk === "high" || risk === "critical") return C.coral;
  if (risk === "moderate") return C.amber;
  return C.teal;
}

function fmtDuration(seconds: number): string {
  const m = String(Math.floor(seconds / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function formatTime(date: Date): string {
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

function mergePipelineWithFallback(
  pipeline: PipelineResponse | null,
  fallback: AgentOutput,
): AgentOutput {
  if (!pipeline?.emotion || !pipeline?.risk) return fallback;
  const intervention = pipeline.intervention
    ? mapIntervention(pipeline.intervention, fallback.intervention)
    : null;
  const insight =
    pipeline.reflection?.insight?.trim().length
      ? pipeline.reflection.insight
      : fallback.insight;
  return {
    stress: pipeline.emotion.stress_score,
    anxiety: pipeline.emotion.anxiety_score,
    mood: pipeline.emotion.mood_score,
    risk: pipeline.risk.risk_level,
    intervention,
    insight,
  };
}

function mapIntervention(
  payload: NonNullable<PipelineResponse["intervention"]>,
  fallback: InterventionCard | null,
): InterventionCard {
  const minutes = parseMinutes(payload.duration) ?? fallback?.minutes ?? 2;
  const title   = humanizeKey(payload.intervention);
  const protocol =
    payload.workflow.length > 0
      ? payload.workflow.map(humanizeKey).join(" + ")
      : title;
  return {
    id: `${payload.intervention}-${payload.priority}`,
    title,
    body: `Autonomous planner selected ${title.toLowerCase()} (priority: ${payload.priority}).`,
    protocol,
    minutes,
  };
}

function humanizeKey(key: string): string {
  return key
    .split("_")
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function parseMinutes(duration: string): number | null {
  const match = duration.match(/(\d+(?:\.\d+)?)/);
  return match ? Math.max(1, Math.round(Number(match[1]))) : null;
}

function buildHistoryAnswer(
  questionId: HistoryQuestionId,
  data: {
    timeline: AnalyticsTimelinePoint[];
    correlation: AnalyticsCorrelationPoint[];
    interventions: AnalyticsInterventionRow[];
    summary: AnalyticsSummary;
    current: AgentOutput;
  },
): string {
  switch (questionId) {
    case "stress_trend":
      return answerStressTrend(data.timeline, data.summary);
    case "sleep_anxiety":
      return answerSleepAnxiety(data.correlation);
    case "intervention_frequency":
      return answerInterventionFrequency(data.interventions, data.summary);
    case "baseline_compare":
      return answerBaselineCompare(data.timeline, data.current);
  }
}

function answerStressTrend(
  timeline: AnalyticsTimelinePoint[],
  summary: AnalyticsSummary,
): string {
  if (timeline.length < 2) {
    return `Not enough stored events yet. Current summary has ${summary.total_sessions} event${summary.total_sessions === 1 ? "" : "s"}; analyze a few more entries to establish a trend.`;
  }
  const first     = timeline[0].stress;
  const last      = timeline[timeline.length - 1].stress;
  const change    = percentChange(first, last);
  const direction = last > first ? "increased" : last < first ? "decreased" : "stayed stable";
  return `Stress has ${direction}: it moved from ${first}/100 to ${last}/100 across ${timeline.length} stored events (${formatSignedPercent(change)}). Overall trend is ${summary.trend_direction}.`;
}

function answerSleepAnxiety(correlation: AnalyticsCorrelationPoint[]): string {
  const usable = correlation
    .filter((p) => typeof p.avg_anxiety === "number")
    .sort((a, b) => a.sleep_hours - b.sleep_hours);
  if (usable.length < 2) {
    return "Not enough sleep/anxiety history yet. Add multiple journal analyses with different sleep-hour inputs to compare.";
  }
  const low  = usable[0];
  const high = usable[usable.length - 1];
  const lowA  = low.avg_anxiety  ?? 0;
  const highA = high.avg_anxiety ?? 0;
  if (lowA > highA) {
    return `Yes. Lower sleep correlates with higher anxiety: ${low.sleep_hours}h sleep averages ${lowA.toFixed(1)}/100 anxiety vs ${high.sleep_hours}h at ${highA.toFixed(1)}/100.`;
  }
  if (lowA < highA) {
    return `Not in the current data. ${low.sleep_hours}h averages ${lowA.toFixed(1)}/100 anxiety, while ${high.sleep_hours}h averages ${highA.toFixed(1)}/100. More events may change this.`;
  }
  return `The current data is flat: both low and high sleep buckets average ${lowA.toFixed(1)}/100 anxiety.`;
}

function answerInterventionFrequency(
  interventions: AnalyticsInterventionRow[],
  summary: AnalyticsSummary,
): string {
  if (!interventions.length)
    return "No intervention events have been stored for this session yet.";
  const counts = interventions.reduce<Record<string, number>>((acc, row) => {
    acc[row.intervention_type] = (acc[row.intervention_type] ?? 0) + 1;
    return acc;
  }, {});
  const [top, count] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return `${humanizeKey(top)} was deployed most often (${count} time${count === 1 ? "" : "s"}). Summary top intervention: ${summary.most_deployed_intervention ? humanizeKey(summary.most_deployed_intervention) : "none"}.`;
}

function answerBaselineCompare(
  timeline: AnalyticsTimelinePoint[],
  current: AgentOutput,
): string {
  if (timeline.length < 2) {
    return "This is still the baseline period. Analyze more entries before comparing the current session against recent history.";
  }
  const prev = timeline.slice(0, -1);
  const avgS = average(prev.map((p) => p.stress));
  const avgA = average(prev.map((p) => p.anxiety));
  const avgM = average(prev.map((p) => p.mood));
  const worse =
    current.stress > avgS + 5 ||
    current.anxiety > avgA + 5 ||
    current.mood < avgM - 5;
  return `${worse ? "Yes" : "No"}. Current stress/anxiety/mood are ${current.stress}/${current.anxiety}/${current.mood}, compared with recent baselines of ${avgS.toFixed(1)}/${avgA.toFixed(1)}/${avgM.toFixed(1)}.`;
}

function average(values: number[]): number {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

function percentChange(first: number, last: number): number {
  if (first === 0) return last > 0 ? 100 : 0;
  return ((last - first) / first) * 100;
}

function formatSignedPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}
