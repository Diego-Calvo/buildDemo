import { db } from "@/lib/db";

export async function findStaleScorecards() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return db.interview.findMany({
    where: {
      status: "COMPLETED",
      scheduledAt: { lt: cutoff },
      scorecard: null,
    },
    include: {
      interviewer: true,
      application: { include: { candidate: true, requisition: true } },
    },
  });
}
