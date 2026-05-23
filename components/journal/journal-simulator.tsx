"use client";

import { useMemo, useState } from "react";
import { Keyboard, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function JournalSimulator() {
  const [text, setText] = useState(
    "I slept badly and keep rewriting the same sentence. My thoughts feel scattered, but I want to reset before the next meeting.",
  );

  const metrics = useMemo(() => {
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    return {
      words,
      typingSpeed: Math.min(210, 120 + words * 2),
      deletionRate: Math.max(8, Math.round(text.length / 12)),
    };
  }, [text]);

  return (
    <Card className="bg-white/[0.03]">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Journal Signal Capture</CardTitle>
        <Keyboard className="h-4 w-4 text-teal-300" />
      </CardHeader>
      <CardContent>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="min-h-40 w-full resize-none rounded-md border border-white/10 bg-black/30 p-4 text-sm leading-6 text-white outline-none ring-0 placeholder:text-muted-foreground focus:border-teal-300/60"
          placeholder="Type a private reflection..."
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Metric label="Words" value={metrics.words.toString()} />
          <Metric label="Typing speed" value={`${metrics.typingSpeed} wpm`} />
          <Metric label="Deletion model" value={`${metrics.deletionRate} edits`} />
        </div>
        <Button className="mt-4 w-full bg-teal-400 text-slate-950 hover:bg-teal-300">
          <Send className="h-4 w-4" />
          Stream Signal Snapshot
        </Button>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/20 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}
