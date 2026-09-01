import { db } from "@/lib/db";

export async function autoRouteApplications() {
  const applications = await db.application.findMany({
    where: { stage: "RECEIVED" },
    include: { owner: true },
  });
  const recruiters = await db.user.findMany({
    where: { role: "RECRUITER" },
    include: {
      _count: {
        select: {
          ownedApplications: {
            where: { stage: { notIn: ["HIRED", "REJECTED", "WITHDRAWN"] } },
          },
        },
      },
    },
  });
  let changed = 0;
  for (const application of applications) {
    const leastLoaded = recruiters
      .slice()
      .sort(
        (a, b) =>
          a._count.ownedApplications - b._count.ownedApplications ||
          a.name.localeCompare(b.name),
      )[0];
    if (leastLoaded && leastLoaded.id !== application.ownerId) {
      await db.application.update({
        where: { id: application.id },
        data: { ownerId: leastLoaded.id },
      });
      leastLoaded._count.ownedApplications += 1;
      changed += 1;
    }
  }
  return changed;
}
