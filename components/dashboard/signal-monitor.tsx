import { Activity, ArrowDownRight, ArrowUpRight, Gauge } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { WellnessSignal } from "@/lib/types";

const riskVariant = {
  low: "success",
  moderate: "warning",
  high: "danger",
  critical: "danger",
} as const;

interface SignalMonitorProps {
  signals: WellnessSignal[];
}

export function SignalMonitor({ signals }: SignalMonitorProps) {
  return (
    <Card className="bg-white/[0.03]">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Live Signal Monitor</CardTitle>
        <Gauge className="h-4 w-4 text-teal-300" />
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {signals.map((signal) => (
          <div key={signal.id} className="rounded-md border border-white/10 bg-black/20 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground">{signal.label}</p>
                <div className="mt-2 flex items-end gap-2">
                  <span className="text-2xl font-semibold text-white">{signal.value}</span>
                  <span className="pb-1 text-xs text-muted-foreground">{signal.unit}</span>
                </div>
              </div>
              <Badge variant={riskVariant[signal.riskLevel]}>{signal.riskLevel}</Badge>
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              {signal.trend === "down" ? (
                <ArrowDownRight className="h-4 w-4 text-emerald-300" />
              ) : (
                <ArrowUpRight className="h-4 w-4 text-amber-300" />
              )}
              <span>{Math.abs(signal.delta)} from baseline</span>
              <Activity className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
