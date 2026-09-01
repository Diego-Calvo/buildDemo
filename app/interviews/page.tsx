import { Role } from "@prisma/client";
import Link from "next/link";
import { submitScorecard } from "@/app/actions";
import { Card, PageHeader, StageBadge } from "@/components/ui";
import { assertRole, getCurrentUser } from "@/lib/authz";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function InterviewsPage() {
  const user = await getCurrentUser();
  assertRole(user, [Role.INTERVIEWER, Role.RECRUITER, Role.HIRING_MANAGER]);
  const interviews = await db.interview.findMany({
    where:
      user.role === Role.INTERVIEWER
        ? { interviewerId: user.id }
        : user.role === Role.RECRUITER
          ? { application: { ownerId: user.id } }
          : { application: { requisition: { hiringManagerId: user.id } } },
    include: {
      scorecard: true,
      interviewer: true,
      application: { include: { candidate: true, requisition: true } },
    },
    orderBy: { scheduledAt: "desc" },
    take: 30,
  });
  const due = interviews.filter((item) => item.status === "COMPLETED" && !item.scorecard);
  return (
    <>
      <PageHeader eyebrow="Structured evidence" title="Interviews and scorecards" description="Competency-level evidence is mandatory before a candidate can advance to a decision." />
      {due.length > 0 && <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><strong>{due.length} scorecard{due.length > 1 ? "s are" : " is"} overdue.</strong> Completed interviews must be documented within 24 hours.</div>}
      <div className="grid gap-5 xl:grid-cols-2">
        {interviews.map((interview) => (
          <Card key={interview.id}>
            <div className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div><Link href={`/candidates/${interview.application.candidateId}`} className="font-semibold text-blue-700 hover:underline">{interview.application.candidate.fullName}</Link><div className="mt-1 text-xs text-slate-500">{interview.application.requisition?.title ?? "Unmatched"} · {interview.type.replaceAll("_", " ")}</div></div>
                <StageBadge stage={interview.application.stage} />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3 rounded-lg bg-slate-50 p-3 text-xs"><div><span className="text-slate-500">Scheduled</span><div className="mt-1 font-medium">{interview.scheduledAt.toLocaleString()}</div></div><div><span className="text-slate-500">Interviewer</span><div className="mt-1 font-medium">{interview.interviewer.name}</div></div><div><span className="text-slate-500">Status</span><div className="mt-1 font-medium">{interview.status}</div></div></div>
              {interview.scorecard ? (
                <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm"><div className="font-semibold text-emerald-800">Scorecard submitted · {interview.scorecard.overallRating}/4 · {interview.scorecard.recommendation.replaceAll("_", " ")}</div>{(user.role !== Role.INTERVIEWER || user.id === interview.interviewerId) && <p className="mt-1 text-xs text-emerald-700">{interview.scorecard.notes}</p>}</div>
              ) : user.role === Role.INTERVIEWER && user.id === interview.interviewerId ? (
                <form action={submitScorecard} className="mt-4 grid gap-3">
                  <input type="hidden" name="interviewId" value={interview.id} />
                  <div className="grid grid-cols-2 gap-3"><label className="text-xs font-medium">Overall rating (1–4)<select name="rating" defaultValue="3" className="mt-1 w-full"><option value="1">1 — Below</option><option value="2">2 — Mixed</option><option value="3">3 — Meets</option><option value="4">4 — Exceeds</option></select></label><label className="text-xs font-medium">Recommendation<select name="recommendation" defaultValue="HIRE" className="mt-1 w-full"><option>STRONG_HIRE</option><option>HIRE</option><option>NO_HIRE</option><option>STRONG_NO_HIRE</option></select></label></div>
                  <label className="text-xs font-medium">Competency evidence<textarea name="notes" required minLength={20} rows={3} className="mt-1 w-full" placeholder="Document observed behavior and evidence against the rubric." /></label>
                  <button className="justify-self-end rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white">Submit scorecard</button>
                </form>
              ) : <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-800">Scorecard owed by {interview.interviewer.name}</div>}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
