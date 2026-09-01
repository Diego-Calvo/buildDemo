import { createHash } from "node:crypto";
import { getAIProvider } from "@/lib/ai";
import { appendAudit } from "@/lib/audit";
import { db } from "@/lib/db";

const allowedTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const deniedHashes = new Set(["known-malware-demo-hash"]);

export function scanResumeFile(input: {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  content: string;
}) {
  const sha256 = createHash("sha256").update(input.content).digest("hex");
  const macroEnabled = input.fileName.toLowerCase().endsWith(".docm");
  const clean =
    allowedTypes.has(input.mimeType) &&
    input.sizeBytes <= 10 * 1024 * 1024 &&
    !macroEnabled &&
    !deniedHashes.has(sha256);
  return {
    sha256,
    status: clean ? ("CLEAN" as const) : ("QUARANTINED" as const),
    reason: clean
      ? "File type, size, macro, and hash checks passed."
      : "File failed type, size, macro, or hash validation.",
  };
}

export async function scanAndParsePendingResumes() {
  const pending = await db.resume.findMany({ where: { scanStatus: "PENDING" } });
  const provider = getAIProvider();
  const warnings: string[] = [];
  for (const resume of pending) {
    const scan = scanResumeFile({
      fileName: resume.fileName,
      mimeType: resume.mimeType,
      sizeBytes: resume.sizeBytes,
      content: resume.parsedText,
    });
    const parsed =
      scan.status === "CLEAN" ? await provider.parseResume(resume.parsedText) : null;
    await db.resume.update({
      where: { id: resume.id },
      data: {
        scanStatus: scan.status,
        sha256: scan.sha256,
        parsedSkills: parsed?.skills ?? [],
        parsedYearsExp: parsed?.yearsExperience ?? 0,
        parsedTitles: parsed?.titles ?? [],
        redFlags: parsed?.redFlags ?? [],
        aiConfidence: parsed?.confidence ?? 0,
      },
    });
    if (scan.status === "QUARANTINED") warnings.push(resume.fileName);
    await appendAudit({
      entityType: "Resume",
      entityId: resume.id,
      action: "SECURITY_SCAN",
      actorId: null,
      actorType: "SYSTEM",
      before: { scanStatus: "PENDING" },
      after: { scanStatus: scan.status },
      ipOrJob: "automation:resume-scan",
    });
  }
  return { processed: pending.length, warnings };
}
