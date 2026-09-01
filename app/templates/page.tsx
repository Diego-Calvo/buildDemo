import { Role } from "@prisma/client";
import { approveTemplate, createTemplateDraft } from "@/app/actions";
import { Card, MetricCard, PageHeader, Table, td, th } from "@/components/ui";
import { assertRole, getCurrentUser } from "@/lib/authz";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function stringList(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

export default async function TemplatesPage() {
  const user = await getCurrentUser();
  assertRole(user, [Role.RECRUITER, Role.HIRING_MANAGER, Role.LEADER, Role.ADMIN]);
  const templateEditors: Role[] = [Role.RECRUITER, Role.ADMIN];

  const templates = await db.jobDescriptionTemplate.findMany({
    include: {
      approvedBy: { select: { name: true, title: true } },
      _count: { select: { requisitions: true } },
    },
    orderBy: [{ family: "asc" }, { title: "asc" }, { version: "desc" }],
  });

  const families = new Set(templates.map((template) => template.family)).size;
  const approvedCount = templates.filter((template) => template.approvedAt).length;
  const latestApproval = templates.reduce<Date | null>((latest, template) => {
    if (!template.approvedAt) return latest;
    return !latest || template.approvedAt > latest ? template.approvedAt : latest;
  }, null);
  const requisitionUses = templates.reduce(
    (total, template) => total + template._count.requisitions,
    0,
  );

  return (
    <>
      <PageHeader
        eyebrow="Governed content"
        title="Approved job templates"
        description="Versioned, compensation-banded role profiles available for consistent requisition creation."
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <MetricCard
          label="Approved templates"
          value={approvedCount}
          detail="Available in the governed library"
          tone="blue"
        />
        <MetricCard
          label="Job families"
          value={families}
          detail="Standardized across LATAM hiring"
        />
        <MetricCard
          label="Requisition uses"
          value={requisitionUses}
          detail={
            latestApproval
              ? `Latest approval ${latestApproval.toLocaleDateString("en-US")}`
              : "No approval recorded"
          }
          tone="emerald"
        />
      </div>

      <Card
        title="Template library"
        description="Only approved versions are shown; compensation values are annual."
      >
        <Table>
          <thead>
            <tr>
              <th className={th}>Role profile</th>
              <th className={th}>Version</th>
              <th className={th}>Required skills</th>
              <th className={th}>Compensation band</th>
              <th className={th}>Approval</th>
              <th className={th}>Usage</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((template) => {
              const formatter = new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: template.currency,
                maximumFractionDigits: 0,
              });
              return (
                <tr key={template.id} className="hover:bg-slate-50">
                  <td className={`${td} min-w-64`}>
                    <div className="font-semibold text-slate-900">{template.title}</div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {template.family} · {template.level}
                    </div>
                    <p className="mt-2 max-w-md text-xs leading-5 text-slate-500">
                      {template.summary}
                    </p>
                  </td>
                  <td className={td}>
                    <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-800">
                      v{template.version}
                    </span>
                    {!template.approvedAt && <div className="mt-2 text-xs font-semibold text-amber-700">DRAFT</div>}
                  </td>
                  <td className={`${td} min-w-52`}>
                    <div className="flex flex-wrap gap-1.5">
                      {stringList(template.mustHave).map((skill) => (
                        <span
                          key={skill}
                          className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                    <div className="mt-2 text-xs text-slate-500">
                      Preferred: {stringList(template.niceToHave).join(", ")}
                    </div>
                  </td>
                  <td className={`${td} whitespace-nowrap font-medium text-slate-800`}>
                    {formatter.format(template.compBandMin)} –{" "}
                    {formatter.format(template.compBandMax)}
                    <div className="text-xs font-normal text-slate-500">
                      {template.currency}
                    </div>
                  </td>
                  <td className={`${td} min-w-44`}>
                    {template.approvedAt ? <><div className="font-medium text-slate-800">
                      {template.approvedBy?.name}
                    </div>
                    <div className="text-xs text-slate-500">
                      {template.approvedAt.toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </div></> : user.role === Role.HIRING_MANAGER ? <form action={approveTemplate}><input type="hidden" name="templateId" value={template.id} /><button className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white">Approve version</button></form> : <span className="text-xs text-amber-700">Awaiting HM approval</span>}
                  </td>
                  <td className={td}>
                    <div className="text-lg font-semibold text-slate-900">
                      {template._count.requisitions}
                    </div>
                    <div className="text-xs text-slate-500">requisitions</div>
                    {template.approvedAt && templateEditors.includes(user.role) && <form action={createTemplateDraft} className="mt-2"><input type="hidden" name="sourceTemplateId" value={template.id} /><button className="text-xs font-semibold text-blue-700 hover:underline">Create next version</button></form>}
                  </td>
                </tr>
              );
            })}
            {templates.length === 0 && (
              <tr>
                <td className={`${td} text-center text-slate-500`} colSpan={6}>
                  No approved templates are available.
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
