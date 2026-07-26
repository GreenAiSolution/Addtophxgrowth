"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface SeriesPoint {
  date: string;
  spend: number;
  leads: number;
  revenue: number;
  clicks: number;
  conversions: number;
}

const AXIS = { stroke: "hsl(215 20% 55%)", fontSize: 11, fontFamily: "var(--font-jetbrains-mono)" };

function tooltipStyle() {
  return {
    background: "hsl(230 28% 7%)",
    border: "1px solid hsl(220 22% 18%)",
    borderRadius: 8,
    fontSize: 12,
    fontFamily: "var(--font-jetbrains-mono)",
  };
}

export function AdCharts({ series, ranges, activeDays }: { series: SeriesPoint[]; ranges: number[]; activeDays: number }) {
  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {ranges.map((d) => (
          <a
            key={d}
            href={`?days=${d}`}
            className={`rounded-md border px-3 py-1.5 font-mono text-xs transition-colors ${
              d === activeDays ? "border-cyan/60 bg-cyan/10 text-cyan" : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {d}d
          </a>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Spend (daily)">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={series} margin={{ left: 4, right: 8, top: 8 }}>
              <defs>
                <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(187 92% 55%)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="hsl(187 92% 55%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 22% 16%)" />
              <XAxis dataKey="date" tick={AXIS} tickFormatter={(d) => d.slice(5)} minTickGap={24} />
              <YAxis tick={AXIS} tickFormatter={(v) => `$${Math.round(v / 100)}`} width={44} />
              <Tooltip contentStyle={tooltipStyle()} formatter={(v: number) => `$${(v / 100).toFixed(0)}`} />
              <Area type="monotone" dataKey="spend" stroke="hsl(187 92% 55%)" fill="url(#spendFill)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Leads (daily)">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={series} margin={{ left: 4, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 22% 16%)" />
              <XAxis dataKey="date" tick={AXIS} tickFormatter={(d) => d.slice(5)} minTickGap={24} />
              <YAxis tick={AXIS} width={32} />
              <Tooltip contentStyle={tooltipStyle()} />
              <Bar dataKey="leads" fill="hsl(265 78% 65%)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Revenue vs Spend">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={series} margin={{ left: 4, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 22% 16%)" />
              <XAxis dataKey="date" tick={AXIS} tickFormatter={(d) => d.slice(5)} minTickGap={24} />
              <YAxis tick={AXIS} tickFormatter={(v) => `$${Math.round(v / 100)}`} width={44} />
              <Tooltip contentStyle={tooltipStyle()} formatter={(v: number) => `$${(v / 100).toFixed(0)}`} />
              <Line type="monotone" dataKey="revenue" stroke="hsl(315 90% 62%)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="spend" stroke="hsl(187 92% 55%)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Conversions (daily)">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={series} margin={{ left: 4, right: 8, top: 8 }}>
              <defs>
                <linearGradient id="convFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(315 90% 62%)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="hsl(315 90% 62%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 22% 16%)" />
              <XAxis dataKey="date" tick={AXIS} tickFormatter={(d) => d.slice(5)} minTickGap={24} />
              <YAxis tick={AXIS} width={32} />
              <Tooltip contentStyle={tooltipStyle()} />
              <Area type="monotone" dataKey="conversions" stroke="hsl(315 90% 62%)" fill="url(#convFill)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="hud-panel p-4">
      <div className="hud-label mb-3">{title}</div>
      {children}
    </div>
  );
}
