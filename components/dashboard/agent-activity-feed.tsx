import { CircleDot } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AgentEvent } from "@/lib/types";

const severityColor = {
  low: "text-emerald-300",
  moderate: "text-amber-300",
  high: "text-red-300",
  critical: "text-red-200",
};

interface AgentActivityFeedProps {
  events: AgentEvent[];
}

export function AgentActivityFeed({ events }: AgentActivityFeedProps) {
  return (
    <Card className="bg-white/[0.03]">
      <CardHeader>
        <CardTitle>Agent Activity Feed</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {events.map((event) => (
          <div key={event.id} className="grid grid-cols-[auto_1fr_auto] gap-3">
            <CircleDot className={`mt-0.5 h-4 w-4 ${severityColor[event.severity]}`} />
            <div>
              <p className="text-sm text-white">{event.event}</p>
              <p className="mt-1 text-xs text-muted-foreground">{event.agentId} agent</p>
            </div>
            <span className="text-xs text-muted-foreground">{event.timestamp}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
