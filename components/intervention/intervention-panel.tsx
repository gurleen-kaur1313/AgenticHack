import { CheckCircle2, Clock3, PlayCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Intervention } from "@/lib/types";

const statusIcon = {
  active: PlayCircle,
  queued: Clock3,
  completed: CheckCircle2,
};

const priorityVariant = {
  routine: "outline",
  recommended: "warning",
  immediate: "danger",
} as const;

interface InterventionPanelProps {
  interventions: Intervention[];
}

export function InterventionPanel({ interventions }: InterventionPanelProps) {
  return (
    <Card className="bg-white/[0.03]">
      <CardHeader>
        <CardTitle>Autonomous Interventions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {interventions.map((intervention) => {
          const Icon = statusIcon[intervention.status];

          return (
            <div key={intervention.id} className="rounded-md border border-white/10 bg-black/20 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-white/10">
                    <Icon className="h-4 w-4 text-teal-200" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">{intervention.title}</h3>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{intervention.triggeredBy}</p>
                  </div>
                </div>
                <Badge variant={priorityVariant[intervention.priority]}>{intervention.priority}</Badge>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
                <span className="text-xs text-muted-foreground">{intervention.durationMinutes} min protocol</span>
                <Button variant="outline" size="sm">
                  Deploy
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
