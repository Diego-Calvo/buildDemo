import Link from "next/link";
import { applicationScope, getCurrentUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { currentStageSla } from "@/lib/sla";
import { Card, MetricCard, PageHeader, SlaChip, StageBadge, Table, td, th, TimeInStage } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser();
  const scope = applicationScope(user);
  const [applications, notifications] = await Promise.all([
    db.application.findMany({
      where: {
        AND: [
          scope,
          { stage: { notIn: ["HIRED", "REJECTED", "WITHDRAWN"] } },
        ],
      },
      include: { candidate: true, requisition: true },
      orderBy: { stageEnteredAt: "asc" },
      take: 12,
    }),
    db.notification.findMany({
      where: { userId: user.id, readAt: null },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);
  const ordered = applications.sort(
    (a, b) =>
      ["RED", "AMBER", "GREEN"].indexOf(currentStageSla(a.stageEnteredAt).state) -
      ["RED", "AMBER", "GREEN"].indexOf(currentStageSla(b.stageEnteredAt).state),
  );
  const red = applications.filter((item) => currentStageSla(item.stageEnteredAt).state === "RED").length;
  const amber = applications.filter((item) => currentStageSla(item.stageEnteredAt).state === "AMBER").length;
  return (
    <>
      <PageHeader
        eyebrow="Role-aware workspace"
        title={`Good afternoon, ${user.name.split(" ")[0]}`}
        description="Your highest-risk decisions and follow-ups, ordered by SLA exposure."
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="My active work" value={applications.length} detail="Across all workflow stages" tone="blue" />
        <MetricCard label="SLA breached" value={red} detail="Immediate follow-up required" tone="red" />
        <MetricCard label="At risk" value={amber} detail="At least 75% of target" tone="amber" />
        <MetricCard label="Unread alerts" value={notifications.length} detail="Decisions and escalations" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <Card title="My work today" description="Only records visible to your role are queried.">
          <Table>
            <thead><tr><th className={th}>Candidate</th><th className={th}>Stage</th><th className={th}>Role</th><th className={th}>SLA</th><th className={th}>Waiting</th></tr></thead>
            <tbody>
              {ordered.map((application) => (
                <tr key={application.id} className="hover:bg-slate-50">
                  <td className={td}><Link href={`/candidates/${application.candidateId}`} className="font-medium text-blue-700 hover:underline">{application.candidate.fullName}</Link><div className="text-xs text-slate-500">{application.candidate.location}</div></td>
                  <td className={td}><StageBadge stage={application.stage} /></td>
                  <td className={td}>{application.requisition?.title ?? "Awaiting match"}</td>
                  <td className={td}><SlaChip enteredAt={application.stageEnteredAt} /></td>
                  <td className={td}><TimeInStage enteredAt={application.stageEnteredAt} /></td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card title="Notifications" description="Escalations and decisions awaiting you.">
          <div className="divide-y divide-slate-100">
            {notifications.map((notification) => (
              <Link href={notification.href} key={notification.id} className="block p-4 hover:bg-slate-50">
                <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold text-slate-900">{notification.title}</span><span className={`h-2 w-2 rounded-full ${notification.severity === "RED" ? "bg-red-600" : "bg-amber-500"}`} /></div>
                <p className="mt-1 text-xs leading-5 text-slate-500">{notification.body}</p>
              </Link>
            ))}
            {notifications.length === 0 && <div className="p-8 text-center text-sm text-slate-500">No unread notifications for this role.</div>}
          </div>
        </Card>
      </div>
    </>
  );
}
