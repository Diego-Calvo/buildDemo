import { CandidateSource, ScanStatus } from "@prisma/client";
import { db } from "@/lib/db";

const samples = [
  ["Alejandra Mora", "alejandra.mora", "Bogotá, Colombia", ["Operations", "Excel"]],
  ["Felipe Acosta", "felipe.acosta", "Lima, Peru", ["Logistics", "Power BI"]],
  ["Renata Souza", "renata.souza", "São Paulo, Brazil", ["TypeScript", "SQL"]],
] as const;

export async function simulateInboxIntake(count: number) {
  const retention = new Date();
  retention.setMonth(retention.getMonth() + 24);
  for (let index = 0; index < count; index += 1) {
    const sample = samples[index % samples.length];
    const suffix = `${Date.now()}-${index}`;
    const candidateId = `candidate-intake-${suffix}`;
    await db.candidate.create({
      data: {
        id: candidateId,
        fullName: sample[0],
        email: `${sample[1]}.${suffix}@example.com`,
        phone: `+57 310 555 ${String(1000 + index)}`,
        location: sample[2],
        source: CandidateSource.EMAIL_INBOX,
        consentGiven: true,
        consentAt: new Date(),
        retentionUntil: retention,
        resumes: {
          create: {
            id: `resume-intake-${suffix}`,
            fileName: `${sample[1]}.pdf`,
            mimeType: "application/pdf",
            sizeBytes: 245000,
            sha256: "pending",
            scanStatus: ScanStatus.PENDING,
            parsedText: `${sample[0]} has 5 years of experience in ${sample[3].join(", ")}.`,
            parsedSkills: [],
            parsedYearsExp: 0,
            parsedTitles: [],
            redFlags: [],
            aiConfidence: 0,
          },
        },
        applications: {
          create: {
            id: `application-intake-${suffix}`,
            stage: "RECEIVED",
            stageEnteredAt: new Date(),
            ownerId: "recruiter-valentina",
            matchSuggestions: [],
          },
        },
      },
    });
  }
  return count;
}
