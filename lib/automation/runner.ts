import { AutomationStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { autoAdvance } from "@/lib/automation/auto-advance";
import { autoRouteApplications } from "@/lib/automation/routing";
import { scanAndParsePendingResumes } from "@/lib/automation/resume";
import { monitorSlas } from "@/lib/automation/sla-monitor";
import { findStaleScorecards } from "@/lib/automation/scorecards";

let startupPromise: Promise<unknown> | null = null;

export async function runAllAutomation(jobName = "Run all automation") {
  const startedAt = new Date();
  const id = crypto.randomUUID();
  await db.automationRun.create({
    data: {
      id,
      jobName,
      startedAt,
      status: AutomationStatus.RUNNING,
      itemsProcessed: 0,
      warnings: [],
    },
  });
  const scan = await scanAndParsePendingResumes();
  const routed = await autoRouteApplications();
  const sla = await monitorSlas();
  const stale = await findStaleScorecards();
  const advance = await autoAdvance();
  const warnings = [
    ...scan.warnings.map((name) => `Quarantined: ${name}`),
    ...advance.warnings,
    ...stale.map((item) => `Scorecard overdue: ${item.interviewer.name}`),
  ];
  const itemsProcessed = scan.processed + routed + sla.processed + stale.length + advance.advanced;
  return db.automationRun.update({
    where: { id },
    data: {
      finishedAt: new Date(),
      status: warnings.length ? AutomationStatus.WARNING : AutomationStatus.SUCCESS,
      itemsProcessed,
      warnings,
    },
  });
}

export function ensureStartupAutomation() {
  if (!startupPromise) {
    startupPromise = db.automationRun
      .findFirst({ where: { jobName: "App startup automation" }, orderBy: { startedAt: "desc" } })
      .then((latest) => {
        const recentlyRan =
          latest && Date.now() - latest.startedAt.getTime() < 10 * 60 * 1000;
        return recentlyRan ? latest : runAllAutomation("App startup automation");
      });
  }
  return startupPromise;
}
