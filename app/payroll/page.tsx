import { Role } from "@prisma/client";
import Link from "next/link";
import { reviewOffer } from "@/app/actions";
import { Card, PageHeader } from "@/components/ui";
import { assertRole, getCurrentUser } from "@/lib/authz";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function PayrollPage() {
  const user = await getCurrentUser();
  assertRole(user, [Role.PAYROLL]);
  const offers = await db.offerPackage.findMany({
    where: { status: "PENDING_PAYROLL" },
    include: {
      application: {
        include: {
          candidate: { select: { fullName: true, location: true } },
          requisition: { include: { template: true, department: true } },
        },
      },
    },
    orderBy: { startDate: "asc" },
  });
  return (
    <>
      <PageHeader eyebrow="Compensation control" title="Offer approval queue" description="Payroll sees compensation and job-band context only. Interview notes are never queried on this page." />
      <div className="grid gap-5 xl:grid-cols-2">
        {offers.map((offer) => {
          const template = offer.application.requisition?.template;
          if (!template) return null;
          const range = template.compBandMax - template.compBandMin;
          const position = Math.max(0, Math.min(100, ((offer.baseSalary - template.compBandMin) / range) * 100));
          return (
            <Card key={offer.id}>
              <div className="p-5">
                <div className="flex items-start justify-between"><div><Link href={`/candidates/${offer.application.candidateId}`} className="font-semibold text-blue-700">{offer.application.candidate.fullName}</Link><div className="text-xs text-slate-500">{offer.application.requisition?.title} · {offer.application.requisition?.department.name}</div></div><span className={`rounded-full px-2 py-1 text-xs font-semibold ${offer.withinBand ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>{offer.withinBand ? "WITHIN BAND" : "OUT OF BAND"}</span></div>
                <div className="mt-5 rounded-xl bg-slate-50 p-4">
                  <div className="flex justify-between text-xs text-slate-500"><span>${template.compBandMin.toLocaleString()}</span><span>Band</span><span>${template.compBandMax.toLocaleString()}</span></div>
                  <div className="relative mt-2 h-3 rounded-full bg-slate-200"><div className="absolute top-1/2 h-5 w-2 -translate-y-1/2 rounded bg-blue-700" style={{ left: `calc(${position}% - 4px)` }} /></div>
                  <div className="mt-3 text-center text-2xl font-semibold">${offer.baseSalary.toLocaleString()} <span className="text-xs font-normal text-slate-500">{offer.currency} base</span></div>
                  <div className="mt-2 grid grid-cols-3 text-center text-xs"><div><span className="text-slate-500">Bonus</span><div className="font-semibold">{offer.bonusPct}%</div></div><div><span className="text-slate-500">Sign-on</span><div className="font-semibold">${offer.signOn.toLocaleString()}</div></div><div><span className="text-slate-500">Start</span><div className="font-semibold">{offer.startDate.toLocaleDateString()}</div></div></div>
                </div>
                {!offer.withinBand && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"><strong>Recruiter justification:</strong> {offer.justification}</div>}
                <form action={reviewOffer} className="mt-4">
                  <input type="hidden" name="offerId" value={offer.id} />
                  <textarea name="comment" required rows={2} className="w-full" placeholder="Required compensation review comment" />
                  <div className="mt-2 flex justify-end gap-2"><button name="decision" value="reject" className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700">Return to recruiter</button><button name="decision" value="approve" className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">Approve and send</button></div>
                </form>
              </div>
            </Card>
          );
        })}
        {offers.length === 0 && <Card><div className="p-10 text-center text-sm text-slate-500">No offer packages are waiting for Payroll.</div></Card>}
      </div>
    </>
  );
}
