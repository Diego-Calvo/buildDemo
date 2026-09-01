import Link from "next/link";
import { Card, PageHeader, PrimaryLink, Table, td, th } from "@/components/ui";
import { getCurrentUser, requisitionScope } from "@/lib/authz";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function RequisitionsPage() {
  const user = await getCurrentUser();
  const requisitions = await db.requisition.findMany({
    where: requisitionScope(user),
    include: {
      department: true,
      hiringManager: true,
      recruiter: true,
      applications: { select: { stage: true } },
    },
    orderBy: [{ status: "asc" }, { openedAt: "asc" }],
  });
  return (
    <>
      <PageHeader
        eyebrow="Standardized demand"
        title="Requisitions"
        description="Aging, ownership, openings, and complete pipeline coverage from approved templates."
        action={<PrimaryLink href="/requisitions/new">New from template</PrimaryLink>}
      />
      <Card>
        <Table>
          <thead><tr><th className={th}>Requisition</th><th className={th}>Department</th><th className={th}>Status / age</th><th className={th}>Openings</th><th className={th}>Pipeline</th><th className={th}>Hiring manager</th><th className={th}>Recruiter</th></tr></thead>
          <tbody>
            {requisitions.map((req) => {
              const age = req.openedAt ? Math.floor((Date.now() - req.openedAt.getTime()) / 86_400_000) : 0;
              const active = req.applications.filter((app) => !["HIRED", "REJECTED", "WITHDRAWN"].includes(app.stage)).length;
              return (
                <tr key={req.id} className="hover:bg-slate-50">
                  <td className={td}><Link href={`/requisitions/${req.id}`} className="font-semibold text-blue-700 hover:underline">{req.code}</Link><div className="mt-1 text-xs text-slate-600">{req.title} · {req.location}</div></td>
                  <td className={td}>{req.department.name}</td>
                  <td className={td}><span className="text-xs font-semibold">{req.status.replaceAll("_", " ")}</span><div className={`mt-1 text-xs ${age > 90 ? "font-semibold text-red-600" : age > 30 ? "text-amber-600" : "text-slate-500"}`}>{req.openedAt ? `${age} days open` : "Awaiting approval"}</div></td>
                  <td className={td}>{req.openingsCount}</td>
                  <td className={td}><div className="font-semibold">{active} active</div><div className="text-xs text-slate-500">{req.applications.length} total candidates</div></td>
                  <td className={td}>{req.hiringManager.name}</td>
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
