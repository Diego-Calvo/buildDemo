import { appendAudit } from "@/lib/audit";
import { db } from "@/lib/db";

export async function anonymizeExpiredCandidates() {
  const expired = await db.candidate.findMany({
    where: { retentionUntil: { lt: new Date() }, fullName: { not: "REDACTED" } },
  });
  for (const candidate of expired) {
    await db.candidate.update({
      where: { id: candidate.id },
      data: {
        fullName: "REDACTED",
        email: `redacted-${candidate.id}@invalid.local`,
        phone: "REDACTED",
        location: "REDACTED",
      },
    });
    await appendAudit({
      entityType: "Candidate",
      entityId: candidate.id,
      action: "PII_ANONYMIZED",
      actorId: null,
      actorType: "SYSTEM",
      before: { fullName: candidate.fullName, email: candidate.email },
      after: { fullName: "REDACTED", email: "REDACTED" },
      ipOrJob: "automation:data-retention",
    });
  }
  return expired.length;
}
