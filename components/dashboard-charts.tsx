"use client";

import {
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

export function StageTimeChart({ data }: { data: Array<{ stage: string; days: number }> }) {
  return (
    <div className="h-72 p-4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="stage" tick={{ fontSize: 10 }} interval={0} angle={-18} height={60} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Bar dataKey="days" fill="#2563eb" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function FunnelChart({ data }: { data: Array<{ week: string; applications: number; interviews: number; hires: number }> }) {
  return (
    <div className="h-72 p-4">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="week" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Line type="monotone" dataKey="applications" stroke="#2563eb" strokeWidth={2} />
          <Line type="monotone" dataKey="interviews" stroke="#7c3aed" strokeWidth={2} />
          <Line type="monotone" dataKey="hires" stroke="#059669" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
