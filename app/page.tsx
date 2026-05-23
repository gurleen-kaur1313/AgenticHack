"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlarmClock,
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  CircleDot,
  Clock3,
  Flame,
  Gauge,
  HeartPulse,
  Keyboard,
  Moon,
  Play,
  RadioTower,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Waves,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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
  type SensoEnrichment,
} from "@/lib/api";
import { interventionHistory, moodTrends } from "@/lib/mock-data";
import type { AgentStatus, MoodPoint, RiskLevel } from "@/lib/types";
import { cn } from "@/lib/utils";

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

type HistoryQuestionId = "stress_trend" | "sleep_anxiety" | "intervention_frequency" | "baseline_compare";

type HistoryAnswer = {
  question: string;
  answer: string;
};

/** Minimum words before Analyze is enabled (0 = any non-empty text). */
const MIN_WORDS_TO_ANALYZE = 1;
const TYPING_DEBOUNCE_MS = 1500;
const initialTimelineTimestamp = "--:--:--";

const initialAgents: DemoAgent[] = [
  {
    id: "emotion",
    name: "Emotion Analysis Agent",
    role: "Scores stress, anxiety, mood, and volatility from journal language.",
    status: "idle",
    output: "Waiting for sufficient journal signal.",
    progress: 0,
  },
  {
    id: "risk",
    name: "Risk Detection Agent",
    role: "Classifies short-term wellness risk from behavior and context.",
    status: "idle",
    output: "No escalation criteria active.",
    progress: 0,
  },
  {
    id: "intervention",
    name: "Intervention Planner Agent",
    role: "Selects a lightweight support protocol based on detected state.",
    status: "idle",
    output: "Standing by for planning request.",
    progress: 0,
  },
  {
    id: "reflection",
    name: "Reflection Agent",
    role: "Summarizes patterns and creates a brief insight for review.",
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

export default function Home() {
  const [journalText, setJournalText] = useState("");
  const [deleteCount, setDeleteCount] = useState(0);
  const [sleepHours, setSleepHours] = useState(5.5);
  const [lastInputAt, setLastInputAt] = useState(0);
  const [firstKeystrokeAt, setFirstKeystrokeAt] = useState(0);
  const [pauseCount, setPauseCount] = useState(0);
  const [maxPauseMs, setMaxPauseMs] = useState(0);
  const [sessionStartedAt, setSessionStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  const [agents, setAgents] = useState<DemoAgent[]>(initialAgents);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([
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
  const [trendData, setTrendData] = useState<MoodPoint[]>(moodTrends);
  const [workflowActive, setWorkflowActive] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationStatus | null>(null);
  const [senso, setSenso] = useState<SensoEnrichment | null>(null);
  const [analyticsSummary, setAnalyticsSummary] = useState<AnalyticsSummary | null>(null);
  const [historyAnswer, setHistoryAnswer] = useState<HistoryAnswer | null>(null);
  const [historyQuestionLoading, setHistoryQuestionLoading] = useState<HistoryQuestionId | null>(null);
  const [backendStatus, setBackendStatus] = useState<"idle" | "connected" | "fallback">("idle");
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  const wordCount = useMemo(() => journalText.trim().split(/\s+/).filter(Boolean).length, [journalText]);
  const sessionSeconds =
    now > 0 && sessionStartedAt > 0 ? Math.max(1, Math.floor((now - sessionStartedAt) / 1000)) : 0;
  const typingWindowMs =
    firstKeystrokeAt > 0 && lastInputAt > firstKeystrokeAt
      ? Math.max(1000, lastInputAt - firstKeystrokeAt)
      : 1000;
  const typingSpeed =
    journalText.length > 0
      ? Math.round(journalText.length / 5 / (typingWindowMs / 60000))
      : 0;
  const idleSeconds = Math.max(0, Math.floor((now - lastInputAt) / 1000));
  const hasEnoughContent = wordCount >= MIN_WORDS_TO_ANALYZE;
  const riskLevel = output.risk;
  const monitoringMode = riskLevel === "high" || riskLevel === "critical" ? "High attention" : "Elevated";

  const addTimeline = useCallback((agent: string, message: string, tone: TimelineEvent["tone"]) => {
    setTimeline((current) => [
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        agent,
        message,
        timestamp: formatTime(new Date()),
        tone,
      },
      ...current,
    ].slice(0, 9));
  }, []);

  const updateAgent = useCallback((id: AgentId, patch: Partial<DemoAgent>) => {
    setAgents((current) => current.map((agent) => (agent.id === id ? { ...agent, ...patch } : agent)));
  }, []);

  const resetTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const runWorkflow = useCallback(
    async () => { // not auto now
      if (!hasEnoughContent || workflowActive) {
        return;
      }

      resetTimers();
      setWorkflowActive(true);
      setAgents(initialAgents);
      const liveJournalText = journalText.trim();
      const isSevere =
        liveJournalText.toLowerCase().includes("panic") ||
        liveJournalText.toLowerCase().includes("overwhelmed") ||
        liveJournalText.toLowerCase().includes("can't sleep");
      const fallback: AgentOutput = {
        stress: isSevere ? 91 : 78,
        anxiety: isSevere ? 88 : 72,
        mood: isSevere ? 28 : 42,
        risk: isSevere ? "high" : "moderate",
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

      addTimeline(
        "Orchestrator",
        "Manual journal analysis requested.",
        "risk",
      );

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
        if (pipeline.senso_enrichment) {
          setSenso(pipeline.senso_enrichment);
          addTimeline(
            "Senso",
            `Behavior enriched: ${pipeline.senso_enrichment.cadence}, sleep ${pipeline.senso_enrichment.sleep_consistency}.`,
            "complete",
          );
        }
        try {
          const summary = await fetchAnalyticsSummary(pipeline.session_id);
          setAnalyticsSummary(summary);
          addTimeline(
            "ClickHouse",
            `Analytics summary refreshed (${summary.total_sessions} events, trend ${summary.trend_direction}).`,
            "complete",
          );
        } catch (summaryError) {
          console.warn("analytics summary fetch failed", summaryError);
        }
      } catch (error) {
        console.warn("MindMesh backend unreachable, using mock output", error);
        setBackendStatus("fallback");
        addTimeline("Backend", "Backend unreachable — using local mock pipeline.", "neutral");
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
        {
          delay: 250,
          id: "emotion",
          status: "running",
          progress: 45,
          output: "Parsing journal tone and volatility markers.",
          event: "Emotion analysis started.",
          tone: "running",
        },
        {
          delay: 1050,
          id: "emotion",
          status: "complete",
          progress: 100,
          output: `Stress ${nextOutput.stress}, anxiety ${nextOutput.anxiety}, mood ${nextOutput.mood}.`,
          event: `Emotion scores published: stress ${nextOutput.stress}, anxiety ${nextOutput.anxiety}.`,
          tone: "complete",
        },
        {
          delay: 1350,
          id: "risk",
          status: "running",
          progress: 48,
          output: "Combining behavioral and check-in signals.",
          event: "Risk classifier evaluating current session.",
          tone: "running",
        },
        {
          delay: 2150,
          id: "risk",
          status: "complete",
          progress: 100,
          output: `${nextOutput.risk.toUpperCase()} wellness risk. Monitoring mode adjusted.`,
          event: `Risk level changed to ${nextOutput.risk}.`,
          tone: nextOutput.risk === "high" ? "risk" : "complete",
        },
        {
          delay: 2450,
          id: "intervention",
          status: "running",
          progress: 60,
          output: "Selecting lowest-friction support protocol.",
          event: "Intervention planner selecting protocol.",
          tone: "running",
        },
        {
          delay: 3300,
          id: "intervention",
          status: "complete",
          progress: 100,
          output: `${nextOutput.intervention?.title} published to user workspace.`,
          event: `${nextOutput.intervention?.title} card deployed.`,
          tone: "complete",
        },
        {
          delay: 3600,
          id: "reflection",
          status: "running",
          progress: 58,
          output: "Creating concise pattern insight.",
          event: "Reflection agent summarizing signal pattern.",
          tone: "running",
        },
        {
          delay: 4400,
          id: "reflection",
          status: "complete",
          progress: 100,
          output: nextOutput.insight,
          event: "Reflection insight published.",
          tone: "complete",
        },
      ];

      steps.forEach((step) => {
        timersRef.current.push(
          setTimeout(() => {
            updateAgent(step.id, {
              status: step.status,
              progress: step.progress,
              output: step.output,
            });
            addTimeline(initialAgents.find((agent) => agent.id === step.id)?.name ?? step.id, step.event, step.tone);
          }, step.delay),
        );
      });

      timersRef.current.push(
        setTimeout(() => {
          setOutput(nextOutput);
          setTrendData((current) => [
            ...current.slice(-6),
            {
              time: formatTime(new Date()),
              mood: nextOutput.mood,
              stress: nextOutput.stress,
              anxiety: nextOutput.anxiety,
            },
          ]);
          setWorkflowActive(false);
        }, 4550),
      );
    },
    [
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
    ],
  );

  const answerHistoryQuestion = useCallback(
    async (questionId: HistoryQuestionId) => {
      const question = historyQuestions.find((item) => item.id === questionId)?.label ?? "History question";

      if (!sessionId) {
        setHistoryAnswer({
          question,
          answer: "Analyze at least one journal entry first so MindMesh has a session id to query.",
        });
        return;
      }

      setHistoryQuestionLoading(questionId);
      try {
        const [timeline, correlation, interventions, summary] = await Promise.all([
          fetchAnalyticsTimeline(sessionId, "7d"),
          fetchAnalyticsCorrelation(sessionId),
          fetchAnalyticsInterventions(sessionId),
          fetchAnalyticsSummary(sessionId),
        ]);

        setAnalyticsSummary(summary);
        setHistoryAnswer({
          question,
          answer: buildHistoryAnswer(questionId, {
            timeline,
            correlation,
            interventions,
            summary,
            current: output,
          }),
        });
        addTimeline("ClickHouse", `Answered history question: ${question}`, "complete");
      } catch (error) {
        console.warn("history question failed", error);
        setHistoryAnswer({
          question,
          answer: "Could not query the history store. Start the backend and make sure ClickHouse or the in-memory fallback has events for this session.",
        });
        addTimeline("ClickHouse", "History question failed; analytics endpoint unavailable.", "neutral");
      } finally {
        setHistoryQuestionLoading(null);
      }
    },
    [addTimeline, output, sessionId],
  );

  useEffect(() => {
    const startedAt = Date.now();
    setSessionStartedAt(startedAt);
    setLastInputAt(startedAt);
    setNow(startedAt);
    setTimeline((current) =>
      current.map((event) =>
        event.id === "boot" ? { ...event, timestamp: formatTime(new Date(startedAt)) } : event,
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
        if (!cancelled) {
          setIntegrations(health.integrations);
        }
      } catch (error) {
        if (!cancelled) {
          setIntegrations({ clickhouse: false, datadog: false, senso: false });
        }
        console.warn("health check failed", error);
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
    if (firstKeystrokeAt === 0 && value.length > 0) {
      setFirstKeystrokeAt(stamp);
    }
    if (lastInputAt > 0 && stamp - lastInputAt > 2000) {
      setPauseCount((c) => c + 1);
    }
    if (lastInputAt > 0) {
      const gap = stamp - lastInputAt;
      setMaxPauseMs((prev) => Math.max(prev, gap));
    }
    setJournalText(value);
    setLastInputAt(stamp);
  };

  return (
    <main className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(124,58,237,0.24),transparent_28%),radial-gradient(circle_at_82%_8%,rgba(14,165,233,0.18),transparent_26%),radial-gradient(circle_at_55%_86%,rgba(45,212,191,0.14),transparent_30%)]" />
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:44px_44px] opacity-30" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-4 px-4 py-4 sm:px-5 lg:px-6">
        <header className="flex flex-col gap-4 rounded-lg border border-white/10 bg-white/[0.055] p-4 shadow-2xl shadow-black/30 backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <motion.div
              animate={{ boxShadow: ["0 0 18px rgba(45,212,191,0.22)", "0 0 34px rgba(124,58,237,0.32)", "0 0 18px rgba(45,212,191,0.22)"] }}
              transition={{ duration: 3.2, repeat: Infinity }}
              className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-teal-300 via-sky-400 to-violet-500 text-slate-950"
            >
              <BrainCircuit className="h-6 w-6" />
            </motion.div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-normal text-white">MindMesh</h1>
                <Badge variant={workflowActive ? "warning" : "success"}>
                  {workflowActive ? "Agents running" : "System online"}
                </Badge>
                <Badge variant={backendStatus === "fallback" ? "warning" : backendStatus === "connected" ? "success" : "outline"}>
                  {backendStatus === "connected"
                    ? "Backend connected"
                    : backendStatus === "fallback"
                      ? "Local fallback"
                      : "Backend ready"}
                </Badge>
              </div>
              <p className="text-sm text-slate-300">
                Autonomous wellness orchestration dashboard
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 lg:min-w-[620px]">
            <div className="grid gap-3 sm:grid-cols-3">
              <HeaderMetric icon={RadioTower} label="Monitoring mode" value={monitoringMode} />
              <HeaderMetric icon={ShieldAlert} label="Risk level" value={riskLevel} tone={riskLevel === "high" ? "risk" : "normal"} />
              <HeaderMetric icon={Zap} label="Signal rate" value={`${Math.max(8, Math.min(64, typingSpeed + deleteCount))}/min`} />
            </div>
            <IntegrationStrip integrations={integrations} sessionId={sessionId} />
          </div>
        </header>

        <section className="grid flex-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)_390px]">
          <Card className="border-white/10 bg-white/[0.055] shadow-2xl shadow-black/30 backdrop-blur-xl">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Live Journal Input</CardTitle>
                <p className="mt-1 text-xs text-slate-400">Streams journal signals to backend pipeline</p>
              </div>
              <Keyboard className="h-4 w-4 text-teal-300" />
            </CardHeader>
            <CardContent className="space-y-4">
              <textarea
                value={journalText}
                onChange={(event) => onJournalChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Backspace" || event.key === "Delete") {
                    setDeleteCount((count) => count + 1);
                  }
                }}
                className="min-h-[360px] w-full resize-none rounded-lg border border-white/10 bg-slate-950/70 p-4 text-sm leading-6 text-white outline-none transition focus:border-teal-300/70 focus:ring-2 focus:ring-teal-300/20"
                placeholder="Type a reflection. Demo triggers: overwhelmed, panic, can't sleep, anxious, burnout."
              />

              <div className="grid grid-cols-2 gap-3">
                <SignalStat icon={Keyboard} label="Typing speed" value={`${typingSpeed}`} suffix="wpm" />
                <SignalStat icon={RotateCcw} label="Deletion rate" value={`${deleteCount}`} suffix="keys" />
                <SignalStat icon={AlarmClock} label="Idle time" value={`${idleSeconds}`} suffix="sec" />
                <SignalStat icon={Clock3} label="Session" value={formatDuration(sessionSeconds)} />
              </div>

              <SensoCard enrichment={senso} enabled={integrations?.senso ?? false} />
              <AnalyticsSummaryCard summary={analyticsSummary} enabled={integrations?.clickhouse ?? false} />

              <div className="rounded-lg border border-white/10 bg-black/25 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-white">
                    <Moon className="h-4 w-4 text-sky-300" />
                    Sleep input
                  </div>
                  <span className="text-sm font-semibold text-teal-200">{sleepHours.toFixed(1)}h</span>
                </div>
                <input
                  aria-label="Sleep hours"
                  type="range"
                  min="0"
                  max="10"
                  step="0.5"
                  value={sleepHours}
                  onChange={(event) => setSleepHours(Number(event.target.value))}
                  className="w-full accent-teal-300"
                />
              </div>

              <p className="text-xs text-slate-400">
                {workflowActive
                  ? "Analysis in progress…"
                  : hasEnoughContent
                    ? `${wordCount} word${wordCount === 1 ? "" : "s"} ready to analyze`
                    : "Type in the journal box to enable analysis"}
              </p>
              <Button
                onClick={() => void runWorkflow()}
                disabled={!hasEnoughContent || workflowActive}
                className="w-full bg-gradient-to-r from-violet-400 via-sky-400 to-teal-300 text-slate-950 hover:opacity-90 disabled:opacity-50"
              >
                <Activity className="h-4 w-4" />
                {workflowActive ? "Analyzing journal..." : "Analyze journal"}
              </Button>
            </CardContent>
          </Card>

          <Card className="min-h-[720px] border-white/10 bg-white/[0.055] shadow-2xl shadow-black/30 backdrop-blur-xl">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Autonomous Agent Activity</CardTitle>
                <p className="mt-1 text-xs text-slate-400">Idle agents activate when signal thresholds are crossed</p>
              </div>
              <motion.div
                animate={{ scale: workflowActive ? [1, 1.15, 1] : 1 }}
                transition={{ duration: 1, repeat: workflowActive ? Infinity : 0 }}
                className="flex h-9 w-9 items-center justify-center rounded-md border border-teal-300/30 bg-teal-300/10"
              >
                <Activity className="h-4 w-4 text-teal-200" />
              </motion.div>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
              <div className="space-y-3">
                {agents.map((agent) => (
                  <motion.div
                    key={agent.id}
                    layout
                    initial={false}
                    className={cn(
                      "relative overflow-hidden rounded-lg border bg-slate-950/55 p-4",
                      agent.status === "running"
                        ? "border-sky-300/45 shadow-[0_0_32px_rgba(14,165,233,0.16)]"
                        : agent.status === "complete"
                          ? "border-teal-300/35"
                          : "border-white/10",
                    )}
                  >
                    {agent.status === "running" ? (
                      <motion.div
                        className="absolute inset-y-0 left-0 w-1 bg-sky-300"
                        animate={{ opacity: [0.35, 1, 0.35] }}
                        transition={{ duration: 1.2, repeat: Infinity }}
                      />
                    ) : null}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex gap-3">
                        <AgentOrb status={agent.status} />
                        <div>
                          <h3 className="text-sm font-semibold text-white">{agent.name}</h3>
                          <p className="mt-1 text-xs leading-5 text-slate-400">{agent.role}</p>
                        </div>
                      </div>
                      <AgentBadge status={agent.status} />
                    </div>
                    <div className="mt-4">
                      <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
                        <span>{agent.output}</span>
                        <span>{agent.progress}%</span>
                      </div>
                      <Progress
                        value={agent.progress}
                        className={cn(
                          "bg-white/10",
                          agent.status === "running" && "[&>div]:bg-sky-300",
                          agent.status === "complete" && "[&>div]:bg-teal-300",
                        )}
                      />
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="rounded-lg border border-white/10 bg-black/25 p-4">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-white">Real-time Timeline</h2>
                    <p className="mt-1 text-xs text-slate-400">Newest autonomous action first</p>
                  </div>
                  <CircleDot className="h-4 w-4 text-teal-300" />
                </div>
                <div className="space-y-3">
                  <AnimatePresence initial={false}>
                    {timeline.map((event) => (
                      <motion.div
                        key={event.id}
                        layout
                        initial={{ opacity: 0, x: 18 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -18 }}
                        className="grid grid-cols-[auto_1fr] gap-3"
                      >
                        <span className={cn("mt-1 h-2.5 w-2.5 rounded-full", eventDot(event.tone))} />
                        <div className="rounded-md border border-white/10 bg-white/[0.04] p-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs font-semibold text-white">{event.agent}</p>
                            <span className="text-[11px] text-slate-500">{event.timestamp}</span>
                          </div>
                          <p className="mt-1 text-xs leading-5 text-slate-300">{event.message}</p>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            </CardContent>
          </Card>

          <aside className="space-y-4">
            <Card className="border-white/10 bg-white/[0.055] shadow-2xl shadow-black/30 backdrop-blur-xl">
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>Wellness Analytics</CardTitle>
                  <p className="mt-1 text-xs text-slate-400">Scores update after each journal analysis</p>
                </div>
                <Gauge className="h-4 w-4 text-sky-300" />
              </CardHeader>
              <CardContent className="space-y-5">
                <ScoreGrid output={output} />
                <SessionTrendCharts data={trendData} />
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white/[0.055] shadow-2xl shadow-black/30 backdrop-blur-xl">
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle>Intervention Card</CardTitle>
                <Waves className="h-4 w-4 text-teal-300" />
              </CardHeader>
              <CardContent>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={output.intervention?.id}
                    initial={false}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="rounded-lg border border-teal-300/25 bg-teal-300/10 p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-semibold text-white">{output.intervention?.title}</h3>
                        <p className="mt-2 text-xs leading-5 text-slate-300">{output.intervention?.body}</p>
                      </div>
                      <Badge variant={riskLevel === "high" ? "danger" : "warning"}>{output.intervention?.minutes} min</Badge>
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
                      <span className="text-xs text-teal-100">{output.intervention?.protocol}</span>
                      <Button size="sm" variant="outline">
                        <Play className="h-3.5 w-3.5" />
                        Start
                      </Button>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white/[0.055] shadow-2xl shadow-black/30 backdrop-blur-xl">
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle>Reflection Insight</CardTitle>
                <Sparkles className="h-4 w-4 text-violet-300" />
              </CardHeader>
              <CardContent>
                <p className="rounded-lg border border-white/10 bg-black/25 p-4 text-sm leading-6 text-slate-200">
                  {output.insight}
                </p>
              </CardContent>
            </Card>

            <HistoryQuestionsCard
              answer={historyAnswer}
              clickhouseEnabled={integrations?.clickhouse ?? false}
              loading={historyQuestionLoading}
              onAsk={(questionId) => void answerHistoryQuestion(questionId)}
              sessionId={sessionId}
            />
          </aside>
        </section>

        <footer className="rounded-lg border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-xs leading-5 text-amber-100">
          MindMesh is a wellness support tool, not a medical diagnosis or therapy replacement. If you are in immediate danger or crisis, contact emergency services or a crisis hotline.
        </footer>
      </div>
    </main>
  );
}

function HeaderMetric({
  icon: Icon,
  label,
  value,
  tone = "normal",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone?: "normal" | "risk";
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Icon className={cn("h-3.5 w-3.5", tone === "risk" ? "text-red-300" : "text-teal-300")} />
        <span>{label}</span>
      </div>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function SignalStat({
  icon: Icon,
  label,
  value,
  suffix,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  suffix?: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/25 p-3">
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Icon className="h-3.5 w-3.5 text-sky-300" />
        <span>{label}</span>
      </div>
      <div className="mt-2 flex items-end gap-1">
        <span className="text-xl font-semibold text-white">{value}</span>
        {suffix ? <span className="pb-0.5 text-xs text-slate-500">{suffix}</span> : null}
      </div>
    </div>
  );
}

function AgentOrb({ status }: { status: DemoAgent["status"] }) {
  return (
    <div className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/10">
      {status === "running" ? (
        <motion.span
          className="absolute inset-0 rounded-lg border border-sky-300/60"
          animate={{ scale: [1, 1.35], opacity: [0.8, 0] }}
          transition={{ duration: 1.2, repeat: Infinity }}
        />
      ) : null}
      {status === "complete" ? (
        <CheckCircle2 className="h-5 w-5 text-teal-300" />
      ) : (
        <BrainCircuit className={cn("h-5 w-5", status === "running" ? "text-sky-300" : "text-slate-400")} />
      )}
    </div>
  );
}

function AgentBadge({ status }: { status: DemoAgent["status"] }) {
  if (status === "complete") {
    return <Badge variant="success">complete</Badge>;
  }

  if (status === "running") {
    return <Badge variant="warning">running</Badge>;
  }

  return <Badge variant="outline">idle</Badge>;
}

function scoreLabel(score: number, kind: "stress" | "anxiety" | "mood"): { text: string; color: string } {
  if (kind === "mood") {
    if (score >= 70) return { text: "Positive", color: "text-emerald-300" };
    if (score >= 45) return { text: "Neutral", color: "text-sky-300" };
    if (score >= 25) return { text: "Low", color: "text-amber-300" };
    return { text: "Very Low", color: "text-red-300" };
  }
  // stress / anxiety: lower is better
  if (score <= 30) return { text: "Low", color: "text-emerald-300" };
  if (score <= 55) return { text: "Moderate", color: "text-amber-300" };
  if (score <= 75) return { text: "High", color: "text-orange-300" };
  return { text: "Critical", color: "text-red-300" };
}

function riskColor(risk: RiskLevel): string {
  if (risk === "critical") return "text-red-300";
  if (risk === "high") return "text-orange-300";
  if (risk === "moderate") return "text-amber-300";
  return "text-emerald-300";
}

function ScoreGrid({ output }: { output: AgentOutput }) {
  const stressLbl = scoreLabel(output.stress, "stress");
  const anxietyLbl = scoreLabel(output.anxiety, "anxiety");
  const moodLbl = scoreLabel(output.mood, "mood");

  return (
    <div className="space-y-2">
      {/* Stress */}
      <div className="rounded-lg border border-white/10 bg-black/25 p-3">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
          <div className="flex items-center gap-1.5">
            <Flame className="h-3.5 w-3.5 text-violet-300" />
            <span>Stress</span>
            <span className="text-slate-600">· higher = worse</span>
          </div>
          <span className={cn("font-semibold", stressLbl.color)}>{stressLbl.text}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full bg-violet-400 transition-all duration-700" style={{ width: `${output.stress}%` }} />
          </div>
          <span className="text-sm font-bold text-white w-10 text-right">{output.stress}<span className="text-xs text-slate-500">/100</span></span>
        </div>
      </div>

      {/* Anxiety */}
      <div className="rounded-lg border border-white/10 bg-black/25 p-3">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
          <div className="flex items-center gap-1.5">
            <HeartPulse className="h-3.5 w-3.5 text-sky-300" />
            <span>Anxiety</span>
            <span className="text-slate-600">· higher = worse</span>
          </div>
          <span className={cn("font-semibold", anxietyLbl.color)}>{anxietyLbl.text}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full bg-sky-400 transition-all duration-700" style={{ width: `${output.anxiety}%` }} />
          </div>
          <span className="text-sm font-bold text-white w-10 text-right">{output.anxiety}<span className="text-xs text-slate-500">/100</span></span>
        </div>
      </div>

      {/* Mood */}
      <div className="rounded-lg border border-white/10 bg-black/25 p-3">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-emerald-300" />
            <span>Mood</span>
            <span className="text-slate-600">· higher = better</span>
          </div>
          <span className={cn("font-semibold", moodLbl.color)}>{moodLbl.text}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full bg-emerald-400 transition-all duration-700" style={{ width: `${output.mood}%` }} />
          </div>
          <span className="text-sm font-bold text-white w-10 text-right">{output.mood}<span className="text-xs text-slate-500">/100</span></span>
        </div>
      </div>

      {/* Risk */}
      <div className="rounded-lg border border-white/10 bg-black/25 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-300" />
            <span>Overall Risk</span>
          </div>
          <span className={cn("text-sm font-bold capitalize", riskColor(output.risk))}>{output.risk}</span>
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          {output.risk === "critical" && "Immediate support recommended."}
          {output.risk === "high" && "Active intervention recommended."}
          {output.risk === "moderate" && "Mild support suggested."}
          {output.risk === "low" && "Normal emotional range. No action needed."}
        </p>
      </div>
    </div>
  );
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/95 p-3 text-xs shadow-xl">
      <p className="mb-2 font-semibold text-white">{label}</p>
      {payload.map((item) => (
        <p key={item.name} style={{ color: item.color }} className="capitalize">
          {item.name}: {item.value}
        </p>
      ))}
    </div>
  );
}

function SessionTrendCharts({ data }: { data: MoodPoint[] }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium text-slate-300">Score trends over session</p>
          <div className="flex items-center gap-3 text-[11px] text-slate-400">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
              Mood ↑ better
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-violet-400" />
              Stress ↑ worse
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-sky-400" />
              Anxiety ↑ worse
            </span>
          </div>
        </div>
        <div className="h-44 min-h-[11rem] w-full min-w-0">
          {mounted ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis dataKey="time" stroke="rgba(255,255,255,0.38)" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
                <YAxis stroke="rgba(255,255,255,0.38)" tickLine={false} axisLine={false} domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${v}`} />
                <Tooltip content={<ChartTooltip />} />
                <Line type="monotone" dataKey="mood" name="Mood" stroke="#34d399" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="stress" name="Stress" stroke="#a78bfa" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="anxiety" name="Anxiety" stroke="#38bdf8" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full w-full animate-pulse rounded-lg bg-white/[0.04]" />
          )}
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-medium text-slate-300">Stress intensity over time</p>
        <div className="h-28 min-h-[7rem] w-full min-w-0">
          {mounted ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="stressArea" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" hide />
                <YAxis hide domain={[0, 100]} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="stress" name="Stress" stroke="#8b5cf6" fill="url(#stressArea)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full w-full animate-pulse rounded-lg bg-white/[0.04]" />
          )}
        </div>
      </div>
    </>
  );
}

function eventDot(tone: TimelineEvent["tone"]) {
  if (tone === "running") return "bg-sky-300 shadow-[0_0_18px_rgba(56,189,248,0.65)]";
  if (tone === "complete") return "bg-teal-300 shadow-[0_0_18px_rgba(45,212,191,0.65)]";
  if (tone === "risk") return "bg-red-300 shadow-[0_0_18px_rgba(248,113,113,0.65)]";
  return "bg-slate-500";
}

function IntegrationStrip({
  integrations,
  sessionId,
}: {
  integrations: IntegrationStatus | null;
  sessionId: string | null;
}) {
  const items: Array<{ key: keyof IntegrationStatus; label: string }> = [
    { key: "clickhouse", label: "ClickHouse" },
    { key: "datadog", label: "Datadog" },
    { key: "senso", label: "Senso" },
  ];

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-[11px]">
      <div className="flex items-center gap-2">
        <span className="font-semibold uppercase tracking-wide text-slate-400">Sponsors</span>
        {items.map((item) => {
          const active = integrations?.[item.key] ?? false;
          return (
            <span
              key={item.key}
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-2 py-0.5",
                active
                  ? "border-teal-300/50 bg-teal-300/10 text-teal-100"
                  : "border-white/10 bg-white/[0.03] text-slate-400",
              )}
              title={active ? `${item.label} live` : `${item.label} no-op fallback`}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-teal-300" : "bg-slate-500")} />
              {item.label}
            </span>
          );
        })}
      </div>
      {sessionId ? (
        <span className="text-slate-500">
          session <span className="font-mono text-slate-300">{sessionId.slice(0, 8)}</span>
        </span>
      ) : null}
    </div>
  );
}

function SensoCard({
  enrichment,
  enabled,
}: {
  enrichment: SensoEnrichment | null;
  enabled: boolean;
}) {
  if (!enrichment) {
    return null;
  }
  return (
    <div className="rounded-lg border border-white/10 bg-black/25 p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-white">
          <Waves className="h-4 w-4 text-violet-300" />
          Senso enrichment
        </div>
        <Badge variant={enabled ? "success" : "outline"}>{enabled ? "live" : "heuristic"}</Badge>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <EnrichmentStat label="Cadence" value={enrichment.cadence} />
        <EnrichmentStat label="Fluctuation" value={enrichment.fluctuation_score.toFixed(2)} />
        <EnrichmentStat label="Sleep" value={enrichment.sleep_consistency} />
      </div>
    </div>
  );
}

function EnrichmentStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.03] p-2">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold capitalize text-white">{value}</p>
    </div>
  );
}

function AnalyticsSummaryCard({
  summary,
  enabled,
}: {
  summary: AnalyticsSummary | null;
  enabled: boolean;
}) {
  if (!summary || summary.total_sessions === 0) {
    return null;
  }
  return (
    <div className="rounded-lg border border-white/10 bg-black/25 p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-white">
          <Gauge className="h-4 w-4 text-sky-300" />
          ClickHouse summary
        </div>
        <Badge variant={enabled ? "success" : "outline"}>
          {enabled ? "clickhouse" : "in-memory"}
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <EnrichmentStat label="Events" value={summary.total_sessions.toString()} />
        <EnrichmentStat label="Trend" value={summary.trend_direction} />
        <EnrichmentStat label="Avg stress" value={summary.avg_stress.toString()} />
        <EnrichmentStat label="Top risk" value={summary.most_common_risk} />
      </div>
    </div>
  );
}

const historyQuestions: Array<{ id: HistoryQuestionId; label: string }> = [
  { id: "stress_trend", label: "Has this user's stress increased over time?" },
  { id: "sleep_anxiety", label: "Does low sleep correlate with higher anxiety?" },
  { id: "intervention_frequency", label: "Which interventions were deployed most often?" },
  { id: "baseline_compare", label: "Is this session worse than the recent baseline?" },
];

function HistoryQuestionsCard({
  answer,
  clickhouseEnabled,
  loading,
  onAsk,
  sessionId,
}: {
  answer: HistoryAnswer | null;
  clickhouseEnabled: boolean;
  loading: HistoryQuestionId | null;
  onAsk: (questionId: HistoryQuestionId) => void;
  sessionId: string | null;
}) {
  return (
    <Card className="border-white/10 bg-white/[0.055] shadow-2xl shadow-black/30 backdrop-blur-xl">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Ask History</CardTitle>
          <p className="mt-1 text-xs text-slate-400">Answers from stored session events</p>
        </div>
        <Badge variant={clickhouseEnabled ? "success" : "outline"}>
          {clickhouseEnabled ? "ClickHouse" : "memory"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2">
          {historyQuestions.map((question) => (
            <button
              key={question.id}
              type="button"
              onClick={() => onAsk(question.id)}
              disabled={loading !== null}
              className="rounded-md border border-white/10 bg-black/25 px-3 py-2 text-left text-xs leading-5 text-slate-200 transition hover:border-sky-300/40 hover:bg-sky-300/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading === question.id ? "Querying history..." : question.label}
            </button>
          ))}
        </div>
        {!sessionId ? (
          <p className="rounded-md border border-amber-300/20 bg-amber-300/10 p-3 text-xs leading-5 text-amber-100">
            Analyze a journal entry first to create a session history.
          </p>
        ) : null}
        {answer ? (
          <div className="rounded-lg border border-teal-300/25 bg-teal-300/10 p-4">
            <p className="text-xs font-semibold text-teal-100">{answer.question}</p>
            <p className="mt-2 text-sm leading-6 text-slate-100">{answer.answer}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function formatTime(date: Date) {
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const seconds = date.getSeconds().toString().padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function mergePipelineWithFallback(
  pipeline: PipelineResponse | null,
  fallback: AgentOutput,
): AgentOutput {
  if (!pipeline || !pipeline.emotion || !pipeline.risk) {
    return fallback;
  }

  const intervention = pipeline.intervention
    ? mapIntervention(pipeline.intervention, fallback.intervention)
    : null;

  const insight = pipeline.reflection?.insight?.trim().length
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
  const title = humanizeKey(payload.intervention);
  const protocol = payload.workflow.length > 0 ? payload.workflow.map(humanizeKey).join(" + ") : title;

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
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
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

function answerStressTrend(timeline: AnalyticsTimelinePoint[], summary: AnalyticsSummary): string {
  if (timeline.length < 2) {
    return `Not enough stored events yet. Current summary has ${summary.total_sessions} event${summary.total_sessions === 1 ? "" : "s"}; analyze a few more entries to establish a trend.`;
  }

  const first = timeline[0].stress;
  const last = timeline[timeline.length - 1].stress;
  const change = percentChange(first, last);
  const direction = last > first ? "increased" : last < first ? "decreased" : "stayed stable";

  return `Stress has ${direction}: it moved from ${first}/100 to ${last}/100 across ${timeline.length} stored events (${formatSignedPercent(change)}). Overall trend is ${summary.trend_direction}.`;
}

function answerSleepAnxiety(correlation: AnalyticsCorrelationPoint[]): string {
  const usable = correlation
    .filter((point) => typeof point.avg_anxiety === "number")
    .sort((a, b) => a.sleep_hours - b.sleep_hours);

  if (usable.length < 2) {
    return "Not enough sleep/anxiety history yet. Add multiple journal analyses with different sleep-hour inputs to compare low sleep against higher sleep.";
  }

  const lowSleep = usable[0];
  const highSleep = usable[usable.length - 1];
  const lowAnxiety = lowSleep.avg_anxiety ?? 0;
  const highAnxiety = highSleep.avg_anxiety ?? 0;

  if (lowAnxiety > highAnxiety) {
    return `Yes. Stored events show higher anxiety at lower sleep: ${lowSleep.sleep_hours}h sleep averages ${lowAnxiety.toFixed(1)}/100 anxiety, while ${highSleep.sleep_hours}h averages ${highAnxiety.toFixed(1)}/100.`;
  }

  if (lowAnxiety < highAnxiety) {
    return `Not in the current stored data. ${lowSleep.sleep_hours}h sleep averages ${lowAnxiety.toFixed(1)}/100 anxiety, while ${highSleep.sleep_hours}h averages ${highAnxiety.toFixed(1)}/100. More events may change this.`;
  }

  return `The current data is flat: both low and high sleep buckets average ${lowAnxiety.toFixed(1)}/100 anxiety.`;
}

function answerInterventionFrequency(
  interventions: AnalyticsInterventionRow[],
  summary: AnalyticsSummary,
): string {
  if (!interventions.length) {
    return "No intervention events have been stored for this session yet.";
  }

  const counts = interventions.reduce<Record<string, number>>((acc, row) => {
    acc[row.intervention_type] = (acc[row.intervention_type] ?? 0) + 1;
    return acc;
  }, {});
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const [topIntervention, topCount] = ranked[0];

  return `${humanizeKey(topIntervention)} was deployed most often (${topCount} time${topCount === 1 ? "" : "s"}). Summary top intervention: ${summary.most_deployed_intervention ? humanizeKey(summary.most_deployed_intervention) : "none"}.`;
}

function answerBaselineCompare(timeline: AnalyticsTimelinePoint[], current: AgentOutput): string {
  if (timeline.length < 2) {
    return "This is still the baseline period. Analyze more entries before comparing the current session against recent history.";
  }

  const previous = timeline.slice(0, -1);
  const avgStress = average(previous.map((point) => point.stress));
  const avgAnxiety = average(previous.map((point) => point.anxiety));
  const avgMood = average(previous.map((point) => point.mood));
  const worse =
    current.stress > avgStress + 5 ||
    current.anxiety > avgAnxiety + 5 ||
    current.mood < avgMood - 5;

  return `${worse ? "Yes" : "No"}. Current stress/anxiety/mood are ${current.stress}/${current.anxiety}/${current.mood}, compared with recent baselines of ${avgStress.toFixed(1)}/${avgAnxiety.toFixed(1)}/${avgMood.toFixed(1)}.`;
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function percentChange(first: number, last: number): number {
  if (first === 0) {
    return last > 0 ? 100 : 0;
  }

  return ((last - first) / first) * 100;
}

function formatSignedPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}
