import { ApplicationStage, Role, type Prisma } from "@prisma/client";
import { FunnelChart, StageTimeChart } from "@/components/dashboard-charts";
import {
  Card,
  MetricCard,
  PageHeader,
  SlaChip,
  StageBadge,
  Table,
  td,
  th,
  TimeInStage,
} from "@/components/ui";
import { assertRole, getCurrentUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { currentStageSla } from "@/lib/sla";

export const dynamic = "force-dynamic";

const terminalStages = new Set<ApplicationStage>([
  ApplicationStage.HIRED,
  ApplicationStage.REJECTED,
  ApplicationStage.WITHDRAWN,
]);

const chartStages = [
  ApplicationStage.RECEIVED,
  ApplicationStage.TRIAGED,
  ApplicationStage.RESUME_VALIDATED,
  ApplicationStage.MATCHED,
  ApplicationStage.RECRUITER_SCREEN,
  ApplicationStage.HM_REVIEW,
  ApplicationStage.INTERVIEWING,
  ApplicationStage.DECISION,
  ApplicationStage.OFFER_DRAFT,
  ApplicationStage.OFFER_PAYROLL_APPROVAL,
  ApplicationStage.OFFER_SENT,
];

const stageLabels: Partial<Record<ApplicationStage, string>> = {
  RECEIVED: "Received",
  TRIAGED: "Triaged",
  RESUME_VALIDATED: "Validated",
  MATCHED: "Matched",
  RECRUITER_SCREEN: "Screen",
  HM_REVIEW: "HM review",
  INTERVIEWING: "Interview",
  DECISION: "Decision",
  OFFER_DRAFT: "Offer draft",
  OFFER_PAYROLL_APPROVAL: "Payroll",
  OFFER_SENT: "Offer sent",
};

function startOfUtcWeek(date: Date) {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  return start;
}

export default async function LeaderPage({
  searchParams,
}: {
  searchParams?: {
    department?: string;
    recruiter?: string;
    from?: string;
    to?: string;
  };
}) {
  const user = await getCurrentUser();
  assertRole(user, [Role.LEADER, Role.ADMIN]);
  const department = searchParams?.department ?? "";
  const recruiter = searchParams?.recruiter ?? "";
  const from = searchParams?.from ? new Date(searchParams.from) : undefined;
  const to = searchParams?.to ? new Date(`${searchParams.to}T23:59:59.999Z`) : undefined;
  const applicationWhere: Prisma.ApplicationWhereInput = {
    ...(department ? { requisition: { departmentId: department } } : {}),
    ...(recruiter ? { ownerId: recruiter } : {}),
    ...(from || to
      ? { candidate: { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } }
      : {}),
  };

  const [applications, openRequisitions, stageEvents, departments, recruiters] = await Promise.all([
    db.application.findMany({
      where: applicationWhere,
      include: {
        candidate: true,
        owner: { select: { id: true, name: true } },
        requisition: { select: { title: true, code: true } },
      },
    }),
    db.requisition.findMany({
      where: {
        status: "OPEN",
        ...(department ? { departmentId: department } : {}),
        ...(recruiter ? { recruiterId: recruiter } : {}),
      },
      select: { id: true, openedAt: true },
    }),
    db.stageEvent.findMany({
      where: { application: applicationWhere },
      select: {
        applicationId: true,
        toStage: true,
        createdAt: true,
      },
      orderBy: [{ applicationId: "asc" }, { createdAt: "asc" }],
    }),
    db.department.findMany({ orderBy: { name: "asc" } }),
    db.user.findMany({ where: { role: "RECRUITER" }, orderBy: { name: "asc" } }),
  ]);

  const active = applications.filter((application) => !terminalStages.has(application.stage));
  const breached = active.filter(
    (application) => currentStageSla(application.stageEnteredAt).state === "RED",
  );
  const hires = applications.filter(
    (application) => application.stage === ApplicationStage.HIRED,
  ).length;
  const slaCompliance = active.length
    ? Math.round(((active.length - breached.length) / active.length) * 100)
    : 100;
  const requisitionAging = {
    over30: openRequisitions.filter((req) => req.openedAt && Date.now() - req.openedAt.getTime() > 30 * 86_400_000).length,
    over60: openRequisitions.filter((req) => req.openedAt && Date.now() - req.openedAt.getTime() > 60 * 86_400_000).length,
    over90: openRequisitions.filter((req) => req.openedAt && Date.now() - req.openedAt.getTime() > 90 * 86_400_000).length,
  };

  const ownerCounts = new Map<string, { name: string; count: number }>();
  for (const application of active) {
    const existing = ownerCounts.get(application.owner.id);
    ownerCounts.set(application.owner.id, {
      name: application.owner.name,
      count: (existing?.count ?? 0) + 1,
    });
  }
  const workload = Array.from(ownerCounts.values()).sort((a, b) => b.count - a.count);
  const maxWorkload = Math.max(...workload.map((item) => item.count), 1);

  const sourceCounts = new Map<string, number>();
  for (const application of applications) {
    const source = application.candidate.source.replaceAll("_", " ");
    sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1);
  }
  const sourceMix = Array.from(sourceCounts.entries()).sort((a, b) => b[1] - a[1]);

  const eventsByApplication = new Map<string, typeof stageEvents>();
  for (const event of stageEvents) {
    const events = eventsByApplication.get(event.applicationId) ?? [];
    events.push(event);
    eventsByApplication.set(event.applicationId, events);
  }
  const timeToFillDays = Array.from(eventsByApplication.values())
    .map((events) => {
      const received = events.find((event) => event.toStage === ApplicationStage.RECEIVED);
      const hired = events.find((event) => event.toStage === ApplicationStage.HIRED);
      return received && hired
        ? (hired.createdAt.getTime() - received.createdAt.getTime()) / 86_400_000
        : null;
    })
    .filter((days): days is number => days !== null)
    .sort((a, b) => a - b);
  const medianTimeToFill = timeToFillDays.length
    ? timeToFillDays[Math.floor(timeToFillDays.length / 2)].toFixed(1)
    : "—";
  const durationsByStage = new Map<ApplicationStage, number[]>();
  for (const events of Array.from(eventsByApplication.values())) {
    events.forEach((event, index) => {
      const next = events[index + 1];
      if (!next) return;
      const days = Math.max(
        0,
        (next.createdAt.getTime() - event.createdAt.getTime()) / 86_400_000,
      );
      durationsByStage.set(event.toStage, [
        ...(durationsByStage.get(event.toStage) ?? []),
        days,
      ]);
    });
  }
  for (const application of active) {
    const days = Math.max(
      0,
      (Date.now() - application.stageEnteredAt.getTime()) / 86_400_000,
    );
    durationsByStage.set(application.stage, [
      ...(durationsByStage.get(application.stage) ?? []),
      days,
    ]);
  }
  const stageTimeData = chartStages.map((stage) => {
    const durations = durationsByStage.get(stage) ?? [];
    const average = durations.length
      ? durations.reduce((total, duration) => total + duration, 0) / durations.length
      : 0;
    return { stage: stageLabels[stage] ?? stage, days: Number(average.toFixed(1)) };
  });

  const currentWeek = startOfUtcWeek(new Date());
  const weekStarts = Array.from({ length: 6 }, (_, index) => {
    const week = new Date(currentWeek);
    week.setUTCDate(week.getUTCDate() - (5 - index) * 7);
    return week;
  });
  const funnelData = weekStarts.map((week) => ({
    week: week.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }),
    applications: 0,
    interviews: 0,
    hires: 0,
  }));
  const firstWeek = weekStarts[0].getTime();
  for (const event of stageEvents) {
    const weekIndex = Math.floor(
      (startOfUtcWeek(event.createdAt).getTime() - firstWeek) / (7 * 86_400_000),
    );
    if (weekIndex < 0 || weekIndex >= funnelData.length) continue;
    if (event.toStage === ApplicationStage.RECEIVED) {
      funnelData[weekIndex].applications += 1;
    } else if (event.toStage === ApplicationStage.INTERVIEWING) {
      funnelData[weekIndex].interviews += 1;
    } else if (event.toStage === ApplicationStage.HIRED) {
      funnelData[weekIndex].hires += 1;
    }
  }

  const oldest = [...active]
    .sort((a, b) => a.stageEnteredAt.getTime() - b.stageEnteredAt.getTime())
    .slice(0, 8);

  return (
    <>
      <PageHeader
        eyebrow="Leadership"
        title="Recruiting performance"
        description="Pipeline health, team capacity, source mix, and funnel movement from live workflow data."
        action={
          <form className="flex max-w-4xl flex-wrap items-end gap-2" method="get">
            <label className="text-xs font-medium text-slate-600">Department<select name="department" defaultValue={department} className="mt-1 block"><option value="">All</option>{departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="text-xs font-medium text-slate-600">Recruiter<select name="recruiter" defaultValue={recruiter} className="mt-1 block"><option value="">All</option>{recruiters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="text-xs font-medium text-slate-600">From<input name="from" type="date" defaultValue={searchParams?.from} className="mt-1 block" /></label>
            <label className="text-xs font-medium text-slate-600">To<input name="to" type="date" defaultValue={searchParams?.to} className="mt-1 block" /></label>
            <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">Apply filters</button>
          </form>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard
          label="Active candidates"
          value={active.length}
          detail="Excludes closed outcomes"
          tone="blue"
        />
        <MetricCard
          label="SLA breached"
          value={breached.length}
          detail="More than seven days in stage"
          tone="red"
        />
        <MetricCard
          label="Open requisitions"
          value={openRequisitions.length}
          detail="Approved roles accepting candidates"
          tone="amber"
        />
        <MetricCard
          label="Hires"
          value={hires}
          detail="Recorded in the current data set"
          tone="emerald"
        />
        <MetricCard
          label="SLA compliance"
          value={`${slaCompliance}%`}
          detail="Current-stage target"
          tone={slaCompliance >= 90 ? "emerald" : "amber"}
        />
        <MetricCard
          label="Median time-to-fill"
          value={medianTimeToFill === "—" ? medianTimeToFill : `${medianTimeToFill}d`}
          detail="Received to hired"
        />
      </div>
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><div className="text-xs font-semibold uppercase text-amber-700">Requisitions over 30 days</div><div className="mt-1 text-2xl font-semibold text-amber-900">{requisitionAging.over30}</div></div>
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-4"><div className="text-xs font-semibold uppercase text-orange-700">Requisitions over 60 days</div><div className="mt-1 text-2xl font-semibold text-orange-900">{requisitionAging.over60}</div></div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4"><div className="text-xs font-semibold uppercase text-red-700">Requisitions over 90 days</div><div className="mt-1 text-2xl font-semibold text-red-900">{requisitionAging.over90}</div></div>
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <Card
          title="Average stage time"
          description="Mean elapsed days across completed transitions and current active work."
        >
          <StageTimeChart data={stageTimeData} />
        </Card>
        <Card
          title="Weekly funnel"
          description="Applications received, interviews started, and hires over six weeks."
        >
          <FunnelChart data={funnelData} />
        </Card>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card title="Recruiter workload" description="Active candidates by assigned owner.">
          <div className="space-y-4 p-5">
            {workload.map((item) => (
              <div key={item.name}>
                <div className="mb-1.5 flex justify-between text-sm">
                  <span className="font-medium text-slate-800">{item.name}</span>
                  <span className="text-slate-500">{item.count}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-blue-600"
                    style={{ width: `${(item.count / maxWorkload) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Candidate source mix" description="All applications by acquisition channel.">
          <div className="grid grid-cols-2 gap-3 p-5">
            {sourceMix.map(([source, count]) => (
              <div key={source} className="rounded-lg border border-slate-200 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {source}
                </div>
                <div className="mt-1 text-2xl font-semibold text-slate-950">{count}</div>
                <div className="text-xs text-slate-500">
                  {Math.round((count / applications.length) * 100)}% of pipeline
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card title="Aging pipeline" description="Oldest active records, prioritized for follow-up.">
        <Table>
          <thead>
            <tr>
              <th className={th}>Candidate</th>
              <th className={th}>Role</th>
              <th className={th}>Owner</th>
              <th className={th}>Stage</th>
              <th className={th}>SLA</th>
              <th className={th}>Waiting</th>
            </tr>
          </thead>
          <tbody>
            {oldest.map((application) => (
              <tr key={application.id} className="hover:bg-slate-50">
                <td className={td}>
                  <div className="font-medium text-slate-900">
                    {application.candidate.fullName}
                  </div>
                  <div className="text-xs text-slate-500">
                    {application.candidate.location}
                  </div>
                </td>
                <td className={td}>
                  {application.requisition?.title ?? "Awaiting match"}
                  <div className="text-xs text-slate-500">
                    {application.requisition?.code ?? "Unassigned"}
                  </div>
                </td>
                <td className={td}>{application.owner.name}</td>
                <td className={td}>
                  <StageBadge stage={application.stage} />
                </td>
                <td className={td}>
                  <SlaChip enteredAt={application.stageEnteredAt} />
                </td>
                <td className={td}>
                  <TimeInStage enteredAt={application.stageEnteredAt} />
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
