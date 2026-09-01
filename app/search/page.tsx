import Link from "next/link";
import { Card, PageHeader, StageBadge, Table, td, th } from "@/components/ui";
import { applicationScope, getCurrentUser, requisitionScope } from "@/lib/authz";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: { q?: string } }) {
  const user = await getCurrentUser();
  const q = (searchParams.q ?? "").trim();
  const [applications, requisitions] = q ? await Promise.all([
    db.application.findMany({
      where: { AND: [applicationScope(user), { candidate: { fullName: { contains: q } } }] },
      include: { candidate: true, requisition: true },
      take: 20,
    }),
    user.role === "INTERVIEWER" || user.role === "PAYROLL" ? [] : db.requisition.findMany({
      where: { AND: [requisitionScope(user), { OR: [{ code: { contains: q } }, { title: { contains: q } }] }] },
      include: { department: true },
      take: 20,
    }),
  ]) : [[], []];
  return (
    <>
      <PageHeader eyebrow="Global search" title={`Results for “${q}”`} description="Results are filtered server-side to the current role's authorized data scope." />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Candidates"><Table><thead><tr><th className={th}>Candidate</th><th className={th}>Stage</th><th className={th}>Requisition</th></tr></thead><tbody>{applications.map((item) => <tr key={item.id}><td className={td}><Link href={`/candidates/${item.candidateId}`} className="font-semibold text-blue-700">{item.candidate.fullName}</Link></td><td className={td}><StageBadge stage={item.stage} /></td><td className={td}>{item.requisition?.code ?? "Unmatched"}</td></tr>)}</tbody></Table></Card>
        <Card title="Requisitions"><Table><thead><tr><th className={th}>Code</th><th className={th}>Title</th><th className={th}>Department</th></tr></thead><tbody>{requisitions.map((item) => <tr key={item.id}><td className={td}><Link href={`/requisitions/${item.id}`} className="font-semibold text-blue-700">{item.code}</Link></td><td className={td}>{item.title}</td><td className={td}>{item.department.name}</td></tr>)}</tbody></Table></Card>
      </div>
    </>
  );
}
