"use client";

import { motion } from "framer-motion";
import { Bot, RadioTower } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Agent } from "@/lib/types";
import { cn } from "@/lib/utils";

const statusTone = {
  idle: "bg-slate-400",
  monitoring: "bg-sky-300",
  analyzing: "bg-amber-300",
  intervening: "bg-teal-300",
  escalated: "bg-red-300",
  running: "bg-sky-300",
  complete: "bg-teal-300",
};

interface AgentWorkflowProps {
  agents: Agent[];
}

export function AgentWorkflow({ agents }: AgentWorkflowProps) {
  return (
    <Card className="bg-white/[0.03]">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Multi-Agent Orchestration</CardTitle>
        <RadioTower className="h-4 w-4 text-teal-300" />
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 lg:grid-cols-4">
          {agents.map((agent, index) => (
            <motion.div
              key={agent.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.08 }}
              className="relative rounded-md border border-white/10 bg-black/20 p-4"
            >
              <div className="mb-4 flex items-center justify-between">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-white/10">
                  <Bot className="h-4 w-4 text-teal-200" />
                </div>
                <span className={cn("h-2.5 w-2.5 rounded-full", statusTone[agent.status])} />
              </div>
              <h3 className="text-sm font-semibold text-white">{agent.name}</h3>
              <p className="mt-1 min-h-10 text-xs leading-5 text-muted-foreground">{agent.role}</p>
              <div className="mt-4 flex items-center justify-between">
                <Badge variant="outline">{agent.status}</Badge>
                <span className="text-xs text-muted-foreground">{agent.confidence}% confidence</span>
              </div>
              <div className="mt-4 border-t border-white/10 pt-3">
                <p className="text-xs text-muted-foreground">{agent.lastAction}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
