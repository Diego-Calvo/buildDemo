import { createRequisition } from "@/app/actions";
import { Card, PageHeader } from "@/components/ui";
import { getCurrentUser, requisitionScope } from "@/lib/authz";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function NewRequisitionPage() {
  const user = await getCurrentUser();
  requisitionScope(user);
  const [templates, departments, managers, recruiters] = await Promise.all([
    db.jobDescriptionTemplate.findMany({
      where: { approvedAt: { not: null }, approvedById: { not: null } },
      orderBy: { title: "asc" },
    }),
    db.department.findMany({ orderBy: { name: "asc" } }),
    db.user.findMany({ where: { role: "HIRING_MANAGER" }, orderBy: { name: "asc" } }),
    db.user.findMany({ where: { role: "RECRUITER" }, orderBy: { name: "asc" } }),
  ]);
  const defaultDate = new Date(Date.now() + 45 * 86_400_000).toISOString().slice(0, 10);
  return (
    <>
      <PageHeader eyebrow="Controlled job descriptions" title="Create requisition from template" description="Free-text job descriptions are not permitted. Select an approved, versioned template and define operational details." />
      <Card className="max-w-4xl">
        <form action={createRequisition} className="grid gap-5 p-6 md:grid-cols-2">
          <label className="text-sm font-medium">Approved template<select name="templateId" required className="mt-1 w-full">{templates.map((item) => <option key={item.id} value={item.id}>{item.title} — {item.level} (v{item.version})</option>)}</select></label>
          <label className="text-sm font-medium">Department<select name="departmentId" required className="mt-1 w-full">{departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="text-sm font-medium">Hiring manager<select name="hiringManagerId" defaultValue={user.role === "HIRING_MANAGER" ? user.id : managers[0]?.id} required className="mt-1 w-full">{managers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="text-sm font-medium">Recruiter<select name="recruiterId" defaultValue={user.role === "RECRUITER" ? user.id : recruiters[0]?.id} required className="mt-1 w-full">{recruiters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="text-sm font-medium">Target start date<input name="targetStartDate" type="date" defaultValue={defaultDate} required className="mt-1 w-full" /></label>
          <label className="text-sm font-medium">Location<input name="location" defaultValue="LATAM / Hybrid" required className="mt-1 w-full" /></label>
          <label className="text-sm font-medium">Priority<select name="priority" className="mt-1 w-full"><option>NORMAL</option><option>HIGH</option><option>CRITICAL</option></select></label>
          <label className="text-sm font-medium">Openings<input name="openingsCount" type="number" min="1" defaultValue="1" required className="mt-1 w-full" /></label>
          <div className="md:col-span-2 flex justify-end"><button className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Create requisition</button></div>
        </form>
      </Card>
    </>
  );
}
