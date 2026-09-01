import { Role } from "@prisma/client";
import Link from "next/link";
import { Card, MetricCard, PageHeader, SlaChip, StageBadge, Table, td, th } from "@/components/ui";
import { assertRole, getCurrentUser } from "@/lib/authz";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function HiringManagerPage() {
  const user = await getCurrentUser();
  assertRole(user, [Role.HIRING_MANAGER]);
  const requisitions = await db.requisition.findMany({
    where: { hiringManagerId: user.id, status: { in: ["OPEN", "ON_HOLD"] } },
    include: {
      applications: {
        where: { stage: { notIn: ["HIRED", "REJECTED", "WITHDRAWN"] } },
        include: { candidate: true },
        orderBy: { stageEnteredAt: "asc" },
      },
      department: true,
      recruiter: true,
    },
    orderBy: { openedAt: "asc" },
  });
  const pending = requisitions.flatMap((req) => req.applications).filter((app) => ["HM_REVIEW", "DECISION"].includes(app.stage));
  const waiting = requisitions.flatMap((req) => req.applications).sort((a, b) => a.stageEnteredAt.getTime() - b.stageEnteredAt.getTime())[0];
  return (
    <>
      <PageHeader eyebrow="Hiring manager cockpit" title={`${user.name}'s requisition portfolio`} description="A dense operating view designed to support 20 or more concurrent requisitions without losing decisions or SLA risk." />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Active requisitions" value={requisitions.length} detail="Open and on hold" tone="blue" />
        <MetricCard label="Awaiting my decision" value={pending.length} detail="Review and hire / no-hire" tone="amber" />
        <MetricCard label="Active candidates" value={requisitions.reduce((sum, req) => sum + req.applications.length, 0)} detail="Across my portfolio" />
        <MetricCard label="Oldest waiting" value={waiting ? `${Math.floor((Date.now() - waiting.stageEnteredAt.getTime()) / 86_400_000)}d` : "0d"} detail={waiting?.candidate.fullName ?? "No candidate waiting"} tone="red" />
      </div>
      <Card>
        <Table>
          <thead><tr><th className={th}>Requisition</th><th className={th}>Age</th><th className={th}>Funnel</th><th className={th}>Oldest candidate waiting</th><th className={th}>Pending decision</th><th className={th}>SLA heat</th><th className={th}>Recruiter</th></tr></thead>
          <tbody>
            {requisitions.map((req) => {
              const oldest = req.applications[0];
              const decisionCount = req.applications.filter((app) => ["HM_REVIEW", "DECISION"].includes(app.stage)).length;
              return (
                <tr key={req.id} className="hover:bg-slate-50">
                  <td className={td}><Link href={`/requisitions/${req.id}`} className="font-semibold text-blue-700 hover:underline">{req.code}</Link><div className="text-xs text-slate-500">{req.title} · {req.department.name}</div></td>
                  <td className={td}>{req.openedAt ? `${Math.floor((Date.now() - req.openedAt.getTime()) / 86_400_000)}d` : "Draft"}</td>
                  <td className={td}><div className="font-semibold">{req.applications.length} active</div><div className="text-xs text-slate-500">{req.applications.filter((a) => a.stage === "INTERVIEWING").length} interviewing</div></td>
                  <td className={td}>{oldest ? <><Link href={`/candidates/${oldest.candidateId}`} className="font-medium text-blue-700">{oldest.candidate.fullName}</Link><div className="mt-1"><StageBadge stage={oldest.stage} /></div></> : <span className="text-slate-400">No active candidates</span>}</td>
                  <td className={td}><span className={decisionCount ? "font-semibold text-amber-700" : "text-slate-500"}>{decisionCount}</span></td>
                  <td className={td}>{oldest ? <SlaChip enteredAt={oldest.stageEnteredAt} /> : "—"}</td>
                  <td className={td}>{req.recruiter.name}</td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
