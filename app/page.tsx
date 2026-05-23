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
import { analyzeSignal, type PipelineResponse } from "@/lib/api";
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

const MIN_WORDS_TO_ANALYZE = 5;
const TYPING_DEBOUNCE_MS = 2500;
const initialTimelineTimestamp = "--:--:--";
const highStressDemoText =
  "I feel overwhelmed, anxious, burned out, and can't sleep before this deadline.";

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
  const [backendStatus, setBackendStatus] = useState<"idle" | "connected" | "fallback">("idle");
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  const wordCount = useMemo(() => journalText.trim().split(/\s+/).filter(Boolean).length, [journalText]);
  const sessionSeconds =
    now > 0 && sessionStartedAt > 0 ? Math.max(1, Math.floor((now - sessionStartedAt) / 1000)) : 0;
  const activeMinutes = Math.max(1 / 60, sessionSeconds / 60);
  const typingSpeed = Math.round(journalText.length / 5 / activeMinutes);
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
    async (source: "auto" | "simulate", journalTextOverride?: string) => {
      resetTimers();
      setWorkflowActive(true);
      setAgents(initialAgents);
      const liveJournalText = journalTextOverride ?? journalText;
      const isSevere = source === "simulate" || liveJournalText.toLowerCase().includes("panic");
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
        source === "simulate" ? "Injected high-stress demo signal." : "Stress phrase detected in journal stream.",
        "risk",
      );

      const effectiveJournalText =
        liveJournalText.trim().length > 0
          ? liveJournalText
          : "I haven't slept in 3 days and I can't handle this anymore";

      let pipeline: PipelineResponse | null = null;
      try {
        pipeline = await analyzeSignal({
          journal_text: effectiveJournalText,
          typing_speed: Math.max(20, typingSpeed),
          pause_frequency: Math.min(20, Math.floor(idleSeconds / 2)),
          deletion_frequency: deleteCount,
          inactivity_duration_ms: idleSeconds * 1000,
          burst_typing: deleteCount > 25 || typingSpeed > 160,
          client_timestamp: new Date().toISOString(),
        });
        setBackendStatus("connected");
        addTimeline("Backend", "Pipeline response received from /analyze.", "complete");
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
    [addTimeline, deleteCount, idleSeconds, journalText, resetTimers, typingSpeed, updateAgent]
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

  // The last journal text that was sent to the pipeline
  const lastAnalyzedTextRef = useRef("");
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!hasEnoughContent) return;

    // Clear any pending debounce when the user keeps typing
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    debounceTimerRef.current = setTimeout(() => {
      // Don't re-run if the text hasn't meaningfully changed since last analysis
      if (journalText.trim() === lastAnalyzedTextRef.current) return;
      if (workflowActive) return;

      lastAnalyzedTextRef.current = journalText.trim();
      void runWorkflow("auto");
    }, TYPING_DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [journalText, hasEnoughContent, workflowActive, runWorkflow]);

  useEffect(() => resetTimers, [resetTimers]);

  const onJournalChange = (value: string) => {
    setJournalText(value);
    setLastInputAt(Date.now());
  };

  const simulateHighStressEvent = () => {
    onJournalChange(highStressDemoText);
    void runWorkflow("simulate", highStressDemoText);
  };

  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
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

          <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[620px]">
            <HeaderMetric icon={RadioTower} label="Monitoring mode" value={monitoringMode} />
            <HeaderMetric icon={ShieldAlert} label="Risk level" value={riskLevel} tone={riskLevel === "high" ? "risk" : "normal"} />
            <HeaderMetric icon={Zap} label="Signal rate" value={`${Math.max(8, Math.min(64, typingSpeed + deleteCount))}/min`} />
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

              <Button
                onClick={simulateHighStressEvent}
                className="w-full bg-gradient-to-r from-violet-400 via-sky-400 to-teal-300 text-slate-950 hover:opacity-90"
              >
                <Flame className="h-4 w-4" />
                Simulate high stress event
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
                {agents.map((agent, index) => (
                  <motion.div
                    key={agent.id}
                    layout
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.06 }}
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
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-medium text-slate-300">Score trends over session</p>
                    <div className="flex items-center gap-3 text-[11px] text-slate-400">
                      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400 inline-block" />Mood ↑ better</span>
                      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-violet-400 inline-block" />Stress ↑ worse</span>
                      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sky-400 inline-block" />Anxiety ↑ worse</span>
                    </div>
                  </div>
                  <div className="h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendData}>
                        <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                        <XAxis dataKey="time" stroke="rgba(255,255,255,0.38)" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
                        <YAxis stroke="rgba(255,255,255,0.38)" tickLine={false} axisLine={false} domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${v}`} />
                        <Tooltip content={<ChartTooltip />} />
                        <Line type="monotone" dataKey="mood" name="Mood" stroke="#34d399" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="stress" name="Stress" stroke="#a78bfa" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="anxiety" name="Anxiety" stroke="#38bdf8" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium text-slate-300">Stress intensity over time</p>
                  <div className="h-28">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trendData}>
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
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white/[0.055] shadow-2xl shadow-black/30 backdrop-blur-xl">
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle>Intervention Card</CardTitle>
                <Waves className="h-4 w-4 text-teal-300" />
              </CardHeader>
              <CardContent>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={output.intervention?.id}
                    initial={{ opacity: 0, y: 10 }}
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

function eventDot(tone: TimelineEvent["tone"]) {
  if (tone === "running") return "bg-sky-300 shadow-[0_0_18px_rgba(56,189,248,0.65)]";
  if (tone === "complete") return "bg-teal-300 shadow-[0_0_18px_rgba(45,212,191,0.65)]";
  if (tone === "risk") return "bg-red-300 shadow-[0_0_18px_rgba(248,113,113,0.65)]";
  return "bg-slate-500";
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
