import { ApplicationStage, Role } from "@prisma/client";
import { CheckCircle2, FileText, LockKeyhole, ShieldAlert } from "lucide-react";
import { notFound } from "next/navigation";
import { submitOffer, transitionApplication } from "@/app/actions";
import { Card, PageHeader, SlaChip, StageBadge, TimeInStage } from "@/components/ui";
import { applicationScope, getCurrentUser, maySeeCompensation } from "@/lib/authz";
import { db } from "@/lib/db";
import { validTargets } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

type Suggestion = { requisitionId: string; score: number; rationale: string };
type Flag = { code?: string; severity?: string; message?: string; linkedCandidateId?: string };

export default async function CandidatePage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  const auditRoles: Role[] = [Role.ADMIN, Role.LEADER];
  const fullEvidenceRoles: Role[] = [
    Role.RECRUITER,
    Role.HIRING_MANAGER,
    Role.LEADER,
    Role.ADMIN,
  ];
  const application = await db.application.findFirst({
    where: { AND: [{ candidateId: params.id }, applicationScope(user)] },
    include: {
      candidate: { include: { resumes: { include: { validatedBy: true } } } },
      requisition: { include: { template: true, department: true, hiringManager: true } },
      owner: true,
      decisionBy: true,
      offer: true,
      interviews: { include: { interviewer: true, scorecard: true }, orderBy: { scheduledAt: "asc" } },
      stageEvents: { include: { actor: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!application) notFound();
  const [policies, openRequisitions, auditRows] = await Promise.all([
    db.slaPolicy.findMany(),
    db.requisition.findMany({ where: { status: "OPEN" }, select: { id: true, code: true, title: true } }),
    auditRoles.includes(user.role)
      ? db.auditLog.findMany({ where: { entityId: application.id }, include: { actor: true }, orderBy: { createdAt: "desc" } })
      : Promise.resolve([]),
  ]);
  const resume = application.candidate.resumes[0];
  const flags = (Array.isArray(resume?.redFlags) ? resume.redFlags : []) as Flag[];
  const suggestions = (Array.isArray(application.matchSuggestions) ? application.matchSuggestions : []) as Suggestion[];
  const reqById = new Map(openRequisitions.map((req) => [req.id, req]));
  const missing = application.interviews.filter((item) => item.status === "COMPLETED" && !item.scorecard);
  const interviewerSubmitted = application.interviews.some((item) => item.interviewerId === user.id && item.scorecard);
  const showComp = maySeeCompensation(user);
  const payrollOnly = user.role === Role.PAYROLL;
  const showAllInterviewEvidence = fullEvidenceRoles.includes(user.role) || interviewerSubmitted;
  const targets = validTargets(application.stage);
  const defaultStart = application.offer?.startDate.toISOString().slice(0, 10) ?? new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        eyebrow={application.requisition ? `${application.requisition.code} · ${application.requisition.department.name}` : "Candidate intake"}
        title={application.candidate.fullName}
        description={payrollOnly ? "Compensation-scoped candidate record. Profile and interview evidence are restricted." : `${application.candidate.location} · Owner: ${application.owner.name} · Source: ${application.candidate.source.replaceAll("_", " ")}`}
        action={<div className="flex flex-wrap items-center justify-end gap-2"><StageBadge stage={application.stage} /><TimeInStage enteredAt={application.stageEnteredAt} />{policies.map((policy) => <SlaChip key={policy.id} enteredAt={application.stageEnteredAt} label={policy.name} />)}</div>}
      />

      {!payrollOnly && (
        <nav className="mb-6 flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2 text-sm shadow-sm">
          {["profile", "resume", "match", "interviews", ...(showComp ? ["offer"] : []), "timeline", ...(auditRoles.includes(user.role) ? ["audit"] : [])].map((tab) => (
            <a key={tab} href={`#${tab}`} className="rounded-lg px-3 py-2 font-medium capitalize text-slate-600 hover:bg-slate-100 hover:text-slate-900">{tab}</a>
          ))}
        </nav>
      )}

      {!payrollOnly && (
        <div className="space-y-6">
          <Card title="Profile" description="AI-parsed data remains editable only at the controlled validation step." className="scroll-mt-24" >
            <div id="profile" className="grid gap-5 p-5 md:grid-cols-4 scroll-mt-24">
              <div><div className="text-xs font-semibold uppercase text-slate-500">Email</div><div className="mt-1 text-sm">{application.candidate.email}</div></div>
              <div><div className="text-xs font-semibold uppercase text-slate-500">Phone</div><div className="mt-1 text-sm">{application.candidate.phone}</div></div>
              <div><div className="text-xs font-semibold uppercase text-slate-500">Consent</div><div className="mt-1 flex items-center gap-1 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Captured {application.candidate.consentAt?.toLocaleDateString()}</div></div>
              <div><div className="text-xs font-semibold uppercase text-slate-500">Retention until</div><div className="mt-1 text-sm">{application.candidate.retentionUntil.toLocaleDateString()}</div></div>
              <div className="md:col-span-2"><div className="text-xs font-semibold uppercase text-slate-500">Parsed titles</div><div className="mt-2 flex flex-wrap gap-2">{(Array.isArray(resume?.parsedTitles) ? resume.parsedTitles : []).map((title) => <span key={String(title)} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs">{String(title)}</span>)}</div></div>
              <div className="md:col-span-2"><div className="text-xs font-semibold uppercase text-slate-500">Parsed skills</div><div className="mt-2 flex flex-wrap gap-2">{(Array.isArray(resume?.parsedSkills) ? resume.parsedSkills : []).map((skill) => <span key={String(skill)} className="rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-700">{String(skill)}</span>)}</div></div>
            </div>
          </Card>

          <Card title="Resume security and validation" description="Parsed text is rendered as plain text. Embedded HTML and AI instructions cannot execute.">
            <div id="resume" className="grid gap-5 p-5 lg:grid-cols-[1.5fr_1fr] scroll-mt-24">
              <div>
                <div className="mb-3 flex items-center gap-3"><FileText className="h-5 w-5 text-slate-500" /><div><div className="font-semibold">{resume?.fileName}</div><div className="text-xs text-slate-500">{((resume?.sizeBytes ?? 0) / 1024).toFixed(0)} KB · SHA-256: {resume?.sha256.slice(0, 24)}…</div></div><span className={`ml-auto rounded-full px-2.5 py-1 text-xs font-semibold ${resume?.scanStatus === "CLEAN" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{resume?.scanStatus}</span></div>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-4 font-sans text-xs leading-5 text-slate-200">{resume?.parsedText}</pre>
              </div>
              <div><div className="flex items-center justify-between"><h3 className="font-semibold">Risk flags</h3><span className="text-xs text-slate-500">{Math.round((resume?.aiConfidence ?? 0) * 100)}% parse confidence</span></div><div className="mt-3 space-y-3">{flags.map((flag, index) => <div key={`${flag.code}-${index}`} className={`rounded-lg border p-3 text-xs ${flag.severity === "BLOCKING" ? "border-red-200 bg-red-50 text-red-800" : flag.severity === "WARN" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-blue-200 bg-blue-50 text-blue-800"}`}><div className="flex items-center gap-2 font-semibold"><ShieldAlert className="h-4 w-4" />{flag.severity} · {flag.code}</div><p className="mt-1">{flag.message}</p></div>)}{flags.length === 0 && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">No resume risk flags detected.</div>}</div></div>
            </div>
          </Card>

          <Card title="Requisition match" description="Deterministic top-three suggestions combine must-have skills, level, and location. A recruiter retains the choice.">
            <div id="match" className="grid gap-4 p-5 md:grid-cols-3 scroll-mt-24">
              {suggestions.map((suggestion, index) => {
                const req = reqById.get(suggestion.requisitionId);
                return <div key={suggestion.requisitionId} className={`rounded-xl border p-4 ${application.requisitionId === suggestion.requisitionId ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}><div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase text-slate-500">#{index + 1} match</span><span className="text-xl font-semibold text-blue-700">{suggestion.score}%</span></div><h3 className="mt-2 font-semibold">{req?.code ?? suggestion.requisitionId}</h3><div className="text-sm text-slate-600">{req?.title ?? "Requisition"}</div><p className="mt-3 text-xs leading-5 text-slate-500">{suggestion.rationale}</p>{user.role === Role.RECRUITER && application.stage === ApplicationStage.RESUME_VALIDATED && <form action={transitionApplication} className="mt-3"><input type="hidden" name="applicationId" value={application.id} /><input type="hidden" name="candidateId" value={application.candidateId} /><input type="hidden" name="target" value="MATCHED" /><input type="hidden" name="requisitionId" value={suggestion.requisitionId} /><input type="hidden" name="reason" value={`Recruiter selected ${req?.code ?? suggestion.requisitionId} from AI suggestions.`} /><button className="w-full rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white">Select this match</button></form>}</div>;
              })}
            </div>
          </Card>

          <Card title="Interview loop" description="Interviewers see only their evidence until submission, then the complete loop.">
            <div id="interviews" className="divide-y divide-slate-100 scroll-mt-24">
              {application.interviews.map((interview) => {
                const visible = showAllInterviewEvidence || interview.interviewerId === user.id;
                return <div key={interview.id} className="grid gap-3 p-5 md:grid-cols-[1fr_1fr_2fr]"><div><div className="font-semibold">{interview.type.replaceAll("_", " ")}</div><div className="text-xs text-slate-500">{interview.scheduledAt.toLocaleString()} · {interview.durationMin} min</div></div><div><div className="text-sm font-medium">{interview.interviewer.name}</div><div className="text-xs text-slate-500">{interview.status}</div></div><div>{interview.scorecard && visible ? <div className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800"><strong>{interview.scorecard.overallRating}/4 · {interview.scorecard.recommendation.replaceAll("_", " ")}</strong><p className="mt-1">{interview.scorecard.notes}</p></div> : interview.scorecard ? <div className="flex items-center gap-2 rounded-lg bg-slate-100 p-3 text-xs text-slate-600"><LockKeyhole className="h-4 w-4" /> Evidence unlocks after you submit your scorecard.</div> : <div className="rounded-lg bg-amber-50 p-3 text-xs font-medium text-amber-800">Scorecard missing — owed by {interview.interviewer.name}</div>}</div></div>;
              })}
            </div>
          </Card>
        </div>
      )}

      {showComp && (
        <Card title="Offer package and band control" description="Hiring decisions remain with the manager; compensation approval remains with Payroll." className="mt-6">
          <div id="offer" className="p-5 scroll-mt-24">
            {application.requisition ? <div className="mb-4 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-3"><div><div className="text-xs text-slate-500">Template band</div><div className="font-semibold">${application.requisition.template.compBandMin.toLocaleString()}–${application.requisition.template.compBandMax.toLocaleString()}</div></div><div><div className="text-xs text-slate-500">Current base</div><div className="font-semibold">{application.offer ? `$${application.offer.baseSalary.toLocaleString()}` : "Not drafted"}</div></div><div><div className="text-xs text-slate-500">Payroll status</div><div className="font-semibold">{application.offer?.status.replaceAll("_", " ") ?? "NOT STARTED"}</div></div></div> : <p className="text-sm text-slate-500">Match the candidate to a requisition before drafting an offer.</p>}
            {user.role === Role.RECRUITER && application.stage === ApplicationStage.OFFER_DRAFT && application.requisition && <form action={submitOffer} className="grid gap-4 md:grid-cols-3"><input type="hidden" name="applicationId" value={application.id} /><label className="text-xs font-medium">Base salary<input type="number" name="baseSalary" defaultValue={application.offer?.baseSalary ?? application.requisition.template.compBandMin} required className="mt-1 w-full" /></label><label className="text-xs font-medium">Start date<input type="date" name="startDate" defaultValue={defaultStart} required className="mt-1 w-full" /></label><label className="text-xs font-medium">Out-of-band justification<input name="justification" defaultValue={application.offer?.justification ?? ""} className="mt-1 w-full" /></label><div className="md:col-span-3 flex justify-end"><button className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white">Submit to Payroll</button></div></form>}
          </div>
        </Card>
      )}

      {!payrollOnly && (
        <>
          <Card title="Candidate timeline" description="Human and system transitions are visually distinguished." className="mt-6">
            <div id="timeline" className="p-5 scroll-mt-24">
              <div className="relative ml-3 border-l-2 border-slate-200 pl-6">
                {application.stageEvents.map((event) => <div key={event.id} className="relative pb-6"><span className={`absolute -left-[31px] top-1 h-3 w-3 rounded-full ring-4 ring-white ${event.actorType === "SYSTEM" ? "bg-blue-600" : "bg-slate-700"}`} /><div className="flex flex-wrap items-center gap-2"><StageBadge stage={event.toStage} /><span className="text-xs font-semibold text-slate-600">{event.actorType === "SYSTEM" ? "Automation" : event.actor?.name}</span><span className="text-xs text-slate-400">{event.createdAt.toLocaleString()}</span></div><p className="mt-1 text-xs text-slate-600">{event.reason}</p></div>)}
              </div>
            </div>
          </Card>
          {auditRoles.includes(user.role) && <Card title="Raw audit rows" description="Append-only, hash-chained evidence for operational and legal review." className="mt-6"><div id="audit" className="max-h-96 overflow-auto divide-y divide-slate-100 scroll-mt-24">{auditRows.map((row) => <div key={row.id} className="grid gap-2 p-4 text-xs md:grid-cols-[1fr_1fr_2fr]"><div><div className="font-semibold">{row.action}</div><div className="text-slate-500">{row.createdAt.toLocaleString()}</div></div><div>{row.actor?.name ?? "System"}<div className="text-slate-500">{row.ipOrJob}</div></div><code className="truncate rounded bg-slate-100 p-2 text-[10px]">{row.hash}</code></div>)}</div></Card>}
        </>
      )}

      <div className="sticky bottom-4 z-10 mt-6 rounded-xl border border-slate-300 bg-white/95 p-4 shadow-xl backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Valid actions</div><div className="mt-1 text-sm text-slate-600">{targets.length ? `From ${application.stage.replaceAll("_", " ")} based on role and prerequisites.` : "This application is in a terminal state."}</div></div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {user.role === Role.RECRUITER && application.stage === ApplicationStage.TRIAGED && <form action={transitionApplication} className="flex gap-2"><input type="hidden" name="applicationId" value={application.id} /><input type="hidden" name="candidateId" value={application.candidateId} /><input type="hidden" name="target" value="RESUME_VALIDATED" /><input type="hidden" name="reason" value="Recruiter reviewed and accepted the parsed profile." />{flags.some((flag) => flag.severity === "BLOCKING") && <input name="overrideReason" required placeholder="Required override reason" />}<button className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white">Validate resume</button></form>}
            {user.role === Role.RECRUITER && application.stage === ApplicationStage.MATCHED && <Action application={application} target="RECRUITER_SCREEN" label="Start recruiter screen" reason="Recruiter initiated candidate screen." />}
            {user.role === Role.RECRUITER && application.stage === ApplicationStage.RECRUITER_SCREEN && <Action application={application} target="HM_REVIEW" label="Send to hiring manager" reason="Recruiter screen completed with evidence to proceed." />}
            {user.role === Role.HIRING_MANAGER && application.stage === ApplicationStage.HM_REVIEW && <Action application={application} target="INTERVIEWING" label="Proceed to interviews" reason="Hiring manager approved the structured interview loop." />}
            {application.stage === ApplicationStage.INTERVIEWING && <button disabled title={`${missing.length} scorecards missing: ${missing.map((item) => item.interviewer.name).join(", ")}`} className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-500">{missing.length ? `${missing.length} scorecard(s) missing` : "Awaiting automatic advance"}</button>}
            {user.role === Role.HIRING_MANAGER && application.stage === ApplicationStage.DECISION && <><Action application={application} target="OFFER_DRAFT" label="Hire — draft offer" reason="Hiring manager selected HIRE based on structured evidence." /><form action={transitionApplication} className="flex gap-2"><input type="hidden" name="applicationId" value={application.id} /><input type="hidden" name="candidateId" value={application.candidateId} /><input type="hidden" name="target" value="REJECTED" /><input name="reason" minLength={20} required placeholder="Controlled reason + legal detail" /><button className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700">No hire</button></form></>}
            {user.role === Role.RECRUITER && application.stage === ApplicationStage.OFFER_SENT && <><Action application={application} target="HIRED" label="Record accepted — hired" reason="Candidate accepted the approved offer." /><Action application={application} target="WITHDRAWN" label="Record declined" reason="Candidate declined the approved offer after review." secondary /></>}
            {targets.length > 0 && !["TRIAGED", "RESUME_VALIDATED", "MATCHED", "RECRUITER_SCREEN", "HM_REVIEW", "INTERVIEWING", "DECISION", "OFFER_DRAFT", "OFFER_PAYROLL_APPROVAL", "OFFER_SENT"].includes(application.stage) && <button disabled title="No transition is available for the current role." className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-500">No action for this role</button>}
          </div>
        </div>
      </div>
    </>
  );
}

function Action({
  application,
  target,
  label,
  reason,
  secondary = false,
}: {
  application: { id: string; candidateId: string };
  target: ApplicationStage;
  label: string;
  reason: string;
  secondary?: boolean;
}) {
  return (
    <form action={transitionApplication}>
      <input type="hidden" name="applicationId" value={application.id} />
      <input type="hidden" name="candidateId" value={application.candidateId} />
      <input type="hidden" name="target" value={target} />
      <input type="hidden" name="reason" value={reason} />
      <button className={secondary ? "rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700" : "rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white"}>{label}</button>
    </form>
  );
}
