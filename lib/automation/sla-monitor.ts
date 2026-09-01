import { currentStageSla } from "@/lib/sla";
import { db } from "@/lib/db";

export async function monitorSlas() {
  const active = await db.application.findMany({
    where: { stage: { notIn: ["HIRED", "REJECTED", "WITHDRAWN"] } },
    include: { candidate: true },
  });
  let warnings = 0;
  for (const application of active) {
    const sla = currentStageSla(application.stageEnteredAt);
    if (sla.state === "GREEN") continue;
    warnings += 1;
    const id = `sla-${application.id}-${sla.state.toLowerCase()}`;
    await db.notification.upsert({
      where: { id },
      update: {
        body: `${application.candidate.fullName} is at ${sla.percentage}% of the current-stage SLA.`,
      },
      create: {
        id,
        userId: application.ownerId,
        title: `${sla.state === "RED" ? "SLA breached" : "SLA at risk"}`,
        body: `${application.candidate.fullName} is at ${sla.percentage}% of the current-stage SLA.`,
        severity: sla.state,
        href: `/candidates/${application.candidateId}`,
      },
    });
    if (sla.state === "RED") {
      await db.notification.upsert({
        where: { id: `${id}-leader` },
        update: {},
        create: {
          id: `${id}-leader`,
          userId: "leader-rafael",
          title: "Escalated SLA breach",
          body: `${application.candidate.fullName} requires leadership follow-up.`,
          severity: "RED",
          href: `/candidates/${application.candidateId}`,
        },
      });
    }
  }
  return { processed: active.length, warnings };
}
