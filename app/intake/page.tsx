import { Role } from "@prisma/client";
import Link from "next/link";
import { bulkAssignApplications, simulateIntakeAction } from "@/app/actions";
import { Card, PageHeader, SlaChip, StageBadge, Table, td, th, TimeInStage } from "@/components/ui";
import { assertRole, getCurrentUser } from "@/lib/authz";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function IntakePage() {
  const user = await getCurrentUser();
  assertRole(user, [Role.COORDINATOR, Role.RECRUITER, Role.ADMIN]);
  const [applications, recruiters] = await Promise.all([
    db.application.findMany({
      where: { stage: { in: ["RECEIVED", "TRIAGED", "RESUME_VALIDATED"] } },
      include: { candidate: { include: { resumes: true } }, owner: true },
      orderBy: { stageEnteredAt: "asc" },
    }),
    db.user.findMany({ where: { role: Role.RECRUITER }, orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <PageHeader
        eyebrow="Shared mailbox intake"
        title="Candidate intake queue"
        description="Security scan, parsing confidence, risk flags, routing, and SLA exposure in one controlled queue."
        action={
          user.role !== Role.RECRUITER ? (
            <form action={simulateIntakeAction}>
              <button className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800">
                Simulate 3 inbox CVs
              </button>
            </form>
          ) : undefined
        }
      />
      <Card>
        <form action={bulkAssignApplications}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
            <div className="text-sm text-slate-600">{applications.length} candidates awaiting intake completion</div>
            <div className="flex gap-2">
              <select name="recruiterId" aria-label="Assign selected candidates">
                {recruiters.map((recruiter) => <option key={recruiter.id} value={recruiter.id}>{recruiter.name}</option>)}
              </select>
              <button className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">Bulk assign</button>
            </div>
          </div>
          <Table>
            <thead><tr><th className={th}><span className="sr-only">Select</span></th><th className={th}>Candidate</th><th className={th}>Received</th><th className={th}>Security</th><th className={th}>AI profile</th><th className={th}>Risk flags</th><th className={th}>Owner</th><th className={th}>SLA</th></tr></thead>
            <tbody>
              {applications.map((application) => {
                const resume = application.candidate.resumes[0];
                const flags = Array.isArray(resume?.redFlags) ? resume.redFlags : [];
                return (
                  <tr key={application.id} className="hover:bg-slate-50">
                    <td className={td}><input type="checkbox" name="applicationId" value={application.id} aria-label={`Select ${application.candidate.fullName}`} /></td>
                    <td className={td}><Link className="font-semibold text-blue-700 hover:underline" href={`/candidates/${application.candidateId}`}>{application.candidate.fullName}</Link><div className="mt-1 text-xs text-slate-500">{application.candidate.source.replaceAll("_", " ")} · {application.candidate.email}</div></td>
                    <td className={td}><StageBadge stage={application.stage} /><div className="mt-1"><TimeInStage enteredAt={application.stageEnteredAt} /></div></td>
                    <td className={td}><span className={`rounded-full px-2 py-1 text-xs font-semibold ${resume?.scanStatus === "CLEAN" ? "bg-emerald-100 text-emerald-700" : resume?.scanStatus === "QUARANTINED" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{resume?.scanStatus ?? "NO RESUME"}</span></td>
                    <td className={td}><div className="font-medium">{Math.round((resume?.aiConfidence ?? 0) * 100)}% confidence</div><div className="text-xs text-slate-500">{Array.isArray(resume?.parsedSkills) ? resume.parsedSkills.slice(0, 3).join(", ") : "Parsing pending"}</div></td>
                    <td className={td}>{flags.length ? <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">{flags.length} flag{flags.length > 1 ? "s" : ""}</span> : <span className="text-xs text-slate-500">No flags</span>}</td>
                    <td className={td}><div className="font-medium">{application.owner.name}</div><div className="text-xs text-slate-500">Auto-routed</div></td>
                    <td className={td}><SlaChip enteredAt={application.stageEnteredAt} label="Intake" /></td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </form>
      </Card>
    </>
  );
}
