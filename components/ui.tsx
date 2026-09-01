import type { ApplicationStage } from "@prisma/client";
import { ArrowRight, Clock3 } from "lucide-react";
import Link from "next/link";
import { currentStageSla, formatDuration, type SlaState } from "@/lib/sla";

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
      <div>
        {eyebrow && (
          <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-blue-700">
            {eyebrow}
          </div>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">
          {title}
        </h1>
        {description && <p className="mt-2 max-w-3xl text-sm text-slate-600">{description}</p>}
      </div>
      {action}
    </div>
  );
}

const stageColor: Record<string, string> = {
  RECEIVED: "bg-slate-100 text-slate-700",
  TRIAGED: "bg-cyan-100 text-cyan-800",
  RESUME_VALIDATED: "bg-sky-100 text-sky-800",
  MATCHED: "bg-blue-100 text-blue-800",
  RECRUITER_SCREEN: "bg-indigo-100 text-indigo-800",
  HM_REVIEW: "bg-violet-100 text-violet-800",
  INTERVIEWING: "bg-purple-100 text-purple-800",
  DECISION: "bg-amber-100 text-amber-800",
  OFFER_DRAFT: "bg-orange-100 text-orange-800",
  OFFER_PAYROLL_APPROVAL: "bg-yellow-100 text-yellow-800",
  OFFER_SENT: "bg-lime-100 text-lime-800",
  HIRED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-rose-100 text-rose-800",
  WITHDRAWN: "bg-slate-200 text-slate-700",
  ON_HOLD: "bg-stone-200 text-stone-700",
};

export function StageBadge({ stage }: { stage: ApplicationStage | string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide ${stageColor[stage] ?? stageColor.RECEIVED}`}
    >
      {stage.replaceAll("_", " ")}
    </span>
  );
}

const slaColor: Record<SlaState, string> = {
  GREEN: "border-emerald-200 bg-emerald-50 text-emerald-700",
  AMBER: "border-amber-200 bg-amber-50 text-amber-700",
  RED: "border-red-200 bg-red-50 text-red-700",
};

export function SlaChip({ enteredAt, label = "Current stage" }: { enteredAt: Date; label?: string }) {
  const sla = currentStageSla(enteredAt);
  return (
    <span
      title={`${sla.percentage}% of 7-day current-stage target`}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${slaColor[sla.state]}`}
    >
      <Clock3 className="h-3 w-3" />
      {label}: {sla.state}
    </span>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  tone = "slate",
}: {
  label: string;
  value: string | number;
  detail?: string;
  tone?: "slate" | "blue" | "amber" | "red" | "emerald";
}) {
  const accents = {
    slate: "border-t-slate-400",
    blue: "border-t-blue-600",
    amber: "border-t-amber-500",
    red: "border-t-red-600",
    emerald: "border-t-emerald-600",
  };
  return (
    <div className={`rounded-xl border border-slate-200 border-t-4 bg-white p-5 shadow-sm ${accents[tone]}`}>
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-slate-950">{value}</div>
      {detail && <div className="mt-1 text-xs text-slate-500">{detail}</div>}
    </div>
  );
}

export function Card({
  title,
  description,
  children,
  className = "",
}: {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {(title || description) && (
        <div className="border-b border-slate-100 px-5 py-4">
          {title && <h2 className="font-semibold text-slate-900">{title}</h2>}
          {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Table({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`overflow-x-auto scrollbar-thin ${className}`}>
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  );
}

export function TimeInStage({ enteredAt }: { enteredAt: Date }) {
  return <span className="text-xs text-slate-500">{formatDuration(enteredAt)}</span>;
}

export function PrimaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
    >
      {children}
      <ArrowRight className="h-4 w-4" />
    </Link>
  );
}

export const th = "border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500";
export const td = "border-b border-slate-100 px-4 py-3 align-middle";
