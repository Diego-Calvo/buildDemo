import { notFound } from "next/navigation";
import { RequisitionKanban } from "@/components/requisition-kanban";
import { Card, MetricCard, PageHeader } from "@/components/ui";
import { getCurrentUser, requisitionScope } from "@/lib/authz";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

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
        <RequisitionKanban
          role={user.role}
          requisitionCode={requisition.code}
          applications={requisition.applications.map((application) => ({
            id: application.id,
            candidateId: application.candidateId,
            stage: application.stage,
            stageEnteredAt: application.stageEnteredAt.toISOString(),
            candidate: {
              fullName: application.candidate.fullName,
              location: application.candidate.location,
            },
          }))}
        />
      </Card>
    </>
  );
}
