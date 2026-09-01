import { Role, ScanStatus } from "@prisma/client";
import {
  runAutomationAction,
  runEvaluationAction,
  runRetentionAction,
  verifyAuditAction,
} from "@/app/actions";
import { CostModel } from "@/components/cost-model";
import { Card, MetricCard, PageHeader, Table, td, th } from "@/components/ui";
import { assertRole, getCurrentUser } from "@/lib/authz";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function jsonMessages(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) return "None";
  return value
    .map((item) => {
      if (typeof item === "object" && item !== null && "message" in item) {
        return String(item.message);
      }
      return String(item);
    })
    .join("; ");
}

function statusClass(status: string) {
  if (status === "SUCCESS") return "bg-emerald-100 text-emerald-800";
  if (status === "FAILED") return "bg-red-100 text-red-800";
  if (status === "WARNING") return "bg-amber-100 text-amber-800";
  return "bg-blue-100 text-blue-800";
}

export default async function OpsPage({
  searchParams,
}: {
  searchParams?: { q?: string; integrity?: string };
}) {
  const user = await getCurrentUser();
  assertRole(user, [Role.ADMIN, Role.LEADER]);

  const query = (searchParams?.q ?? "").trim().slice(0, 100);
  const [runs, resumes, auditRows, auditCount, evaluation, latestAudit] =
    await Promise.all([
      db.automationRun.findMany({ orderBy: { startedAt: "desc" }, take: 8 }),
      db.resume.findMany({ include: { candidate: true }, orderBy: { candidateId: "asc" } }),
      db.auditLog.findMany({
        where: query
          ? {
              OR: [
                { entityType: { contains: query } },
                { entityId: { contains: query } },
                { action: { contains: query } },
                { ipOrJob: { contains: query } },
              ],
            }
          : undefined,
        include: { actor: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 12,
      }),
      db.auditLog.count(),
      db.aIEvaluation.findFirst({ orderBy: { evaluatedAt: "desc" } }),
      db.auditLog.findFirst({ orderBy: { createdAt: "desc" } }),
    ]);

  const quarantined = resumes.filter(
    (resume) => resume.scanStatus === ScanStatus.QUARANTINED,
  );
  const resumesByHash = new Map<string, typeof resumes>();
  for (const resume of resumes) {
    const matching = resumesByHash.get(resume.sha256) ?? [];
    matching.push(resume);
    resumesByHash.set(resume.sha256, matching);
  }
  const duplicateGroups = Array.from(resumesByHash.entries()).filter(
    ([, matching]) => matching.length > 1,
  );
  const warningRuns = runs.filter(
    (run) => run.status === "WARNING" || run.status === "FAILED",
  ).length;
  const integrity = searchParams?.integrity;
  const integrityLabel =
    integrity === "ok"
      ? "Verified"
      : integrity?.startsWith("broken")
        ? "Integrity issue"
        : "Ready to verify";
  const integrityTone =
    integrity === "ok"
      ? "text-emerald-700"
      : integrity?.startsWith("broken")
        ? "text-red-700"
        : "text-slate-700";

  return (
    <>
      <PageHeader
        eyebrow="Recruiting operations"
        title="Automation and controls"
        description="Monitor processing, review exceptions, evaluate AI quality, and maintain auditable controls."
        action={
          <form action={runAutomationAction}>
            <button className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800">
              Run automation
            </button>
          </form>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Automation runs"
          value={runs.length}
          detail="Latest recorded executions"
          tone="blue"
        />
        <MetricCard
          label="Run exceptions"
          value={warningRuns}
          detail="Warnings or failures"
          tone={warningRuns ? "amber" : "emerald"}
        />
        <MetricCard
          label="Quarantined"
          value={quarantined.length}
          detail="Security review required"
          tone={quarantined.length ? "red" : "emerald"}
        />
        <MetricCard
          label="Duplicate groups"
          value={duplicateGroups.length}
          detail="Matched by resume hash"
          tone={duplicateGroups.length ? "amber" : "emerald"}
        />
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-[3fr_2fr]">
        <Card title="Automation runs" description="Most recent background processing activity.">
          <Table>
            <thead>
              <tr>
                <th className={th}>Job</th>
                <th className={th}>Status</th>
                <th className={th}>Started</th>
                <th className={th}>Duration</th>
                <th className={th}>Processed</th>
                <th className={th}>Warnings</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} className="hover:bg-slate-50">
                  <td className={`${td} font-medium text-slate-900`}>{run.jobName}</td>
                  <td className={td}>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClass(run.status)}`}
                    >
                      {run.status}
                    </span>
                  </td>
                  <td className={td}>
                    {run.startedAt.toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className={td}>
                    {run.finishedAt
                      ? `${Math.max(
                          0,
                          Math.round(
                            (run.finishedAt.getTime() - run.startedAt.getTime()) / 1000,
                          ),
                        )}s`
                      : "Running"}
                  </td>
                  <td className={td}>{run.itemsProcessed}</td>
                  <td className={`${td} max-w-xs text-xs text-slate-500`}>
                    {jsonMessages(run.warnings)}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <Card title="AI evaluation" description="Latest benchmark against reviewed samples.">
          {evaluation ? (
            <div className="p-5">
              <div className="mb-5 flex items-start justify-between">
                <div>
                  <div className="font-semibold text-slate-900">{evaluation.provider}</div>
                  <div className="text-xs text-slate-500">
                    {evaluation.task} · {evaluation.sampleSize} samples ·{" "}
                    {evaluation.evaluatedAt.toLocaleDateString("en-US")}
                  </div>
                </div>
                <form action={runEvaluationAction}>
                  <button className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">
                    Run evaluation
                  </button>
                </form>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["Precision", `${Math.round(evaluation.precision * 100)}%`],
                  ["Recall", `${Math.round(evaluation.recall * 100)}%`],
                  ["Human override", `${Math.round(evaluation.humanOverrideRate * 100)}%`],
                  ["Avg. latency", `${evaluation.avgLatencyMs} ms`],
                  ["Estimated cost", `$${evaluation.estCostUsd.toFixed(2)}`],
                  ["Task", evaluation.task],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-slate-50 p-3">
                    <div className="text-xs text-slate-500">{label}</div>
                    <div className="mt-1 font-semibold text-slate-900">{value}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-slate-500">
              No AI evaluation has been recorded.
            </div>
          )}
        </Card>
      </div>

      <Card
        title="Quarantine and duplicate review"
        description="Blocking intake exceptions from security scans and content hashes."
        className="mb-6"
      >
        <Table>
          <thead>
            <tr>
              <th className={th}>Issue</th>
              <th className={th}>Candidate</th>
              <th className={th}>Resume</th>
              <th className={th}>Evidence</th>
            </tr>
          </thead>
          <tbody>
            {quarantined.map((resume) => (
              <tr key={`quarantine-${resume.id}`} className="hover:bg-slate-50">
                <td className={td}>
                  <span className="rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-semibold text-red-800">
                    QUARANTINED
                  </span>
                </td>
                <td className={`${td} font-medium text-slate-900`}>
                  {resume.candidate.fullName}
                </td>
                <td className={td}>{resume.fileName}</td>
                <td className={`${td} max-w-lg text-xs text-slate-500`}>
                  {jsonMessages(resume.redFlags)}
                </td>
              </tr>
            ))}
            {duplicateGroups.flatMap(([hash, matching]) =>
              matching.map((resume) => (
                <tr key={`duplicate-${resume.id}`} className="hover:bg-slate-50">
                  <td className={td}>
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
                      DUPLICATE
                    </span>
                  </td>
                  <td className={`${td} font-medium text-slate-900`}>
                    {resume.candidate.fullName}
                  </td>
                  <td className={td}>{resume.fileName}</td>
                  <td className={`${td} font-mono text-xs text-slate-500`}>
                    {hash.slice(0, 28)}
                  </td>
                </tr>
              )),
            )}
            {quarantined.length === 0 && duplicateGroups.length === 0 && (
              <tr>
                <td className={`${td} text-center text-slate-500`} colSpan={4}>
                  No intake exceptions.
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </Card>

      <div className="mb-6 grid gap-6 xl:grid-cols-[3fr_2fr]">
        <Card title="Audit search" description={`${auditCount} immutable events in the chain.`}>
          <form className="flex gap-2 border-b border-slate-100 p-4" method="get">
            <input
              name="q"
              defaultValue={query}
              placeholder="Search entity, action, ID, or source"
              className="min-w-0 flex-1"
            />
            <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
              Search
            </button>
          </form>
          <Table>
            <thead>
              <tr>
                <th className={th}>Time</th>
                <th className={th}>Entity</th>
                <th className={th}>Action</th>
                <th className={th}>Actor</th>
                <th className={th}>Source</th>
              </tr>
            </thead>
            <tbody>
              {auditRows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className={`${td} whitespace-nowrap text-xs text-slate-500`}>
                    {row.createdAt.toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className={td}>
                    <div className="font-medium text-slate-900">{row.entityType}</div>
                    <div className="max-w-36 truncate text-xs text-slate-500">
                      {row.entityId}
                    </div>
                  </td>
                  <td className={td}>{row.action.replaceAll("_", " ")}</td>
                  <td className={td}>{row.actor?.name ?? row.actorType}</td>
                  <td className={`${td} text-xs text-slate-500`}>{row.ipOrJob}</td>
                </tr>
              ))}
              {auditRows.length === 0 && (
                <tr>
                  <td className={`${td} text-center text-slate-500`} colSpan={5}>
                    No audit events match this search.
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        </Card>

        <Card title="Audit integrity" description="SHA-256 linked event history.">
          <div className="p-5">
            <div className="rounded-lg border border-slate-200 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Chain status
              </div>
              <div className={`mt-1 text-xl font-semibold ${integrityTone}`}>
                {integrityLabel}
              </div>
              <div className="mt-3 text-xs text-slate-500">Latest hash</div>
              <div className="mt-1 break-all font-mono text-xs text-slate-700">
                {latestAudit?.hash ?? "No audit records"}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <form action={verifyAuditAction}>
                <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
                  Verify chain
                </button>
              </form>
              {user.role === Role.ADMIN && (
                <form action={runRetentionAction}>
                  <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    Run retention
                  </button>
                </form>
              )}
            </div>
            <p className="mt-4 text-xs leading-5 text-slate-500">
              Retention anonymizes expired candidate records. Audit entries remain append-only.
            </p>
          </div>
        </Card>
      </div>

      <Card
        title="Operating cost model"
        description="Scenario model for AI processing, infrastructure, storage, and recruiter time."
      >
        <CostModel />
      </Card>
    </>
  );
}
