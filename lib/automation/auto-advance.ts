import { transition } from "@/lib/pipeline";
import { db } from "@/lib/db";

export async function autoAdvance() {
  const candidates = await db.application.findMany({
    where: { stage: { in: ["RECEIVED", "INTERVIEWING"] } },
    include: {
      candidate: { include: { resumes: true } },
      interviews: { include: { scorecard: true } },
    },
  });
  let advanced = 0;
  const warnings: string[] = [];
  for (const application of candidates) {
    if (application.stage === "RECEIVED") {
      const resume = application.candidate.resumes[0];
      if (resume?.scanStatus === "CLEAN" && resume.aiConfidence > 0) {
        await transition(application.id, "TRIAGED", null, {
          role: "SYSTEM",
          resumeClean: true,
          parseSucceeded: true,
          reason: "Security scan and deterministic parsing completed.",
        });
        advanced += 1;
      } else {
        warnings.push(`${application.candidate.fullName}: resume not ready`);
      }
    } else {
      const completed = application.interviews.filter(
        (interview) => interview.status === "COMPLETED",
      );
      const missing = completed.filter((interview) => !interview.scorecard);
      if (completed.length > 0 && missing.length === 0) {
        await transition(application.id, "DECISION", null, {
          role: "SYSTEM",
          allScorecardsSubmitted: true,
          reason: "All scheduled interviews have submitted scorecards.",
        });
        advanced += 1;
      } else {
        warnings.push(`${application.candidate.fullName}: ${missing.length} scorecard(s) missing`);
      }
    }
  }
  return { advanced, warnings };
}
