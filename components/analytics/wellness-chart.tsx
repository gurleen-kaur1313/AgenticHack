"use client";

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

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MoodPoint } from "@/lib/types";

interface WellnessChartProps {
  data: MoodPoint[];
}

export function WellnessChart({ data }: WellnessChartProps) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
      <Card className="bg-white/[0.03]">
        <CardHeader>
          <CardTitle>Mood, Stress, Anxiety</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
              <XAxis dataKey="time" stroke="rgba(255,255,255,0.4)" tickLine={false} axisLine={false} />
              <YAxis stroke="rgba(255,255,255,0.4)" tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  background: "#0b1120",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 8,
                  color: "#fff",
                }}
              />
              <Line type="monotone" dataKey="mood" stroke="#2dd4bf" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="stress" stroke="#f59e0b" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="anxiety" stroke="#f87171" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="bg-white/[0.03]">
        <CardHeader>
          <CardTitle>Stress Load</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="stress" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#14b8a6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
              <XAxis dataKey="time" stroke="rgba(255,255,255,0.4)" tickLine={false} axisLine={false} />
              <YAxis stroke="rgba(255,255,255,0.4)" tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  background: "#0b1120",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 8,
                  color: "#fff",
                }}
              />
              <Area type="monotone" dataKey="stress" stroke="#14b8a6" fill="url(#stress)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
