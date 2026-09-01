import { Role, type ApplicationStage } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { transitionApplication } from "@/app/actions";
import { Card, MetricCard, PageHeader, SlaChip, StageBadge, TimeInStage } from "@/components/ui";
import { getCurrentUser, requisitionScope } from "@/lib/authz";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const columns: ApplicationStage[] = [
  "MATCHED",
  "RECRUITER_SCREEN",
  "HM_REVIEW",
  "INTERVIEWING",
  "DECISION",
  "OFFER_DRAFT",
  "OFFER_PAYROLL_APPROVAL",
  "OFFER_SENT",
];

export default async function RequisitionDetailPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  let scope;
  try {
    scope = requisitionScope(user);
  } catch {
    notFound();
  }
  const requisition = await db.requisition.findFirst({
    where: { AND: [{ id: params.id }, scope] },
    include: {
      department: true,
      template: true,
      hiringManager: true,
      recruiter: true,
      applications: {
        where: { stage: { notIn: ["HIRED", "REJECTED", "WITHDRAWN"] } },
        include: { candidate: true },
        orderBy: { stageEnteredAt: "asc" },
      },
    },
  });
  if (!requisition) notFound();
  const age = requisition.openedAt ? Math.floor((Date.now() - requisition.openedAt.getTime()) / 86_400_000) : 0;
  return (
    <>
      <PageHeader eyebrow={`${requisition.code} · ${requisition.department.name}`} title={requisition.title} description={`Template v${requisition.template.version} · ${requisition.location} · Hiring manager: ${requisition.hiringManager.name} · Recruiter: ${requisition.recruiter.name}`} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Status" value={requisition.status.replaceAll("_", " ")} detail={`${requisition.openingsCount} opening(s)`} tone="blue" />
        <MetricCard label="Days open" value={age} detail="From approved open date" tone={age > 90 ? "red" : age > 30 ? "amber" : "slate"} />
        <MetricCard label="Active candidates" value={requisition.applications.length} detail="Excludes terminal outcomes" />
        <MetricCard label="Interviewing" value={requisition.applications.filter((item) => item.stage === "INTERVIEWING").length} detail="Structured scorecard loop" tone="emerald" />
      </div>
      <Card title="Application kanban" description="Cards expose only legal role actions. Every move is validated again by the server-side state machine.">
        <div className="flex gap-4 overflow-x-auto p-4 scrollbar-thin">
          {columns.map((stage) => {
            const applications = requisition.applications.filter((item) => item.stage === stage);
            return (
              <div key={stage} className="w-72 shrink-0 rounded-xl bg-slate-100 p-3">
                <div className="mb-3 flex items-center justify-between"><StageBadge stage={stage} /><span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-500">{applications.length}</span></div>
                <div className="space-y-3">
                  {applications.map((application) => {
                    const target =
                      user.role === Role.RECRUITER && stage === "MATCHED" ? "RECRUITER_SCREEN" :
                      user.role === Role.RECRUITER && stage === "RECRUITER_SCREEN" ? "HM_REVIEW" :
                      user.role === Role.HIRING_MANAGER && stage === "HM_REVIEW" ? "INTERVIEWING" :
                      null;
                    return (
                      <article key={application.id} draggable={Boolean(target)} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                        <Link href={`/candidates/${application.candidateId}`} className="font-semibold text-slate-900 hover:text-blue-700">{application.candidate.fullName}</Link>
                        <div className="mt-1 text-xs text-slate-500">{application.candidate.location}</div>
                        <div className="mt-3 flex items-center justify-between"><SlaChip enteredAt={application.stageEnteredAt} /><TimeInStage enteredAt={application.stageEnteredAt} /></div>
                        {target && (
                          <form action={transitionApplication} className="mt-3">
                            <input type="hidden" name="applicationId" value={application.id} />
                            <input type="hidden" name="candidateId" value={application.candidateId} />
                            <input type="hidden" name="target" value={target} />
                            <input type="hidden" name="reason" value={`Advanced from ${requisition.code} kanban.`} />
                            <button className="w-full rounded-lg border border-blue-200 bg-blue-50 px-2 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100">Advance to {target.replaceAll("_", " ")}</button>
                          </form>
                        )}
                      </article>
                    );
                  })}
                  {applications.length === 0 && <div className="rounded-lg border border-dashed border-slate-300 p-5 text-center text-xs text-slate-400">No candidates</div>}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}
