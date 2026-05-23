import { BrainCircuit, ShieldAlert, Sparkles, Zap } from "lucide-react";
import type { ComponentType } from "react";

import { AgentWorkflow } from "@/components/agents/agent-workflow";
import { WellnessChart } from "@/components/analytics/wellness-chart";
import { AgentActivityFeed } from "@/components/dashboard/agent-activity-feed";
import { SignalMonitor } from "@/components/dashboard/signal-monitor";
import { InterventionPanel } from "@/components/intervention/intervention-panel";
import { JournalSimulator } from "@/components/journal/journal-simulator";
import { agents, agentEvents, interventionHistory, moodTrends, wellnessSignals } from "@/lib/mock-data";

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-teal-300 text-slate-950 shadow-glow">
              <BrainCircuit className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-normal text-white">MindMesh</h1>
              <p className="text-sm text-muted-foreground">
                Autonomous mental wellness orchestration console
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-sm sm:min-w-[520px]">
            <StatusMetric icon={Zap} label="Signal rate" value="38/min" />
            <StatusMetric icon={ShieldAlert} label="Monitoring" value="Elevated" />
            <StatusMetric icon={Sparkles} label="Next action" value="2 min" />
          </div>
        </header>

        <section className="grid gap-4 xl:grid-cols-[1fr_420px]">
          <div className="space-y-4">
            <AgentWorkflow agents={agents} />
            <WellnessChart data={moodTrends} />
            <SignalMonitor signals={wellnessSignals} />
          </div>
          <aside className="space-y-4">
            <JournalSimulator />
            <InterventionPanel interventions={interventionHistory} />
            <AgentActivityFeed events={agentEvents} />
          </aside>
        </section>
      </div>
    </main>
  );
}

function StatusMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-teal-300" />
        <span>{label}</span>
      </div>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}
