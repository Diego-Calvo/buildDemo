import { AITask } from "@prisma/client";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { getAIProvider } from "@/lib/ai";
import { db } from "@/lib/db";

type ResumeFixture = {
  summary: string;
  skills: string[];
  yearsExperience: number;
  groundTruth: {
    expectedSkills: string[];
    redFlags: string[];
  };
};

function parseFixture(content: string, fileName: string): ResumeFixture {
  const value: unknown = JSON.parse(content);
  if (
    typeof value !== "object" ||
    value === null ||
    !("summary" in value) ||
    typeof value.summary !== "string" ||
    !("skills" in value) ||
    !Array.isArray(value.skills) ||
    !value.skills.every((skill) => typeof skill === "string") ||
    !("yearsExperience" in value) ||
    typeof value.yearsExperience !== "number" ||
    !("groundTruth" in value) ||
    typeof value.groundTruth !== "object" ||
    value.groundTruth === null ||
    !("expectedSkills" in value.groundTruth) ||
    !Array.isArray(value.groundTruth.expectedSkills) ||
    !value.groundTruth.expectedSkills.every((skill) => typeof skill === "string") ||
    !("redFlags" in value.groundTruth) ||
    !Array.isArray(value.groundTruth.redFlags) ||
    !value.groundTruth.redFlags.every((flag) => typeof flag === "string")
  ) {
    throw new Error(`Invalid AI evaluation fixture: ${fileName}.`);
  }
  return {
    summary: value.summary,
    skills: value.skills,
    yearsExperience: value.yearsExperience,
    groundTruth: {
      expectedSkills: value.groundTruth.expectedSkills,
      redFlags: value.groundTruth.redFlags,
    },
  };
}

export async function runAIEvaluation() {
  const provider = getAIProvider();
  const fixtureDirectory = path.join(process.cwd(), "fixtures", "resumes");
  const fixtureFiles = (await readdir(fixtureDirectory))
    .filter((file) => file.endsWith(".json"))
    .sort();
  const fixtures = await Promise.all(
    fixtureFiles.map(async (file) =>
      parseFixture(
        await readFile(path.join(fixtureDirectory, file), "utf8"),
        file,
      ),
    ),
  );
  if (fixtures.length !== 20) {
    throw new Error(`AI evaluation requires 20 fixtures; found ${fixtures.length}.`);
  }
  const started = performance.now();
  const samples = await Promise.all(
    fixtures.map((fixture) =>
      provider.parseResume(
        `${fixture.summary}\nSkills: ${fixture.skills.join(", ")}\n${fixture.yearsExperience} years of experience.`,
      ),
    ),
  );
  let truePositives = 0;
  let predicted = 0;
  let expected = 0;
  let missedFlags = 0;
  samples.forEach((sample, index) => {
    const expectedSkills = new Set(
      fixtures[index].groundTruth.expectedSkills.map((skill) => skill.toLowerCase()),
    );
    predicted += sample.skills.length;
    expected += expectedSkills.size;
    truePositives += sample.skills.filter((skill) =>
      expectedSkills.has(skill.toLowerCase()),
    ).length;
    if (
      fixtures[index].groundTruth.redFlags.length > 0 &&
      sample.redFlags.length === 0
    ) {
      missedFlags += 1;
    }
  });
  return db.aIEvaluation.create({
    data: {
      id: crypto.randomUUID(),
      provider: provider.name,
      task: AITask.PARSE,
      sampleSize: fixtures.length,
      precision: predicted ? truePositives / predicted : 0,
      recall: expected ? truePositives / expected : 0,
      humanOverrideRate: missedFlags / fixtures.length,
      avgLatencyMs: Math.max(1, Math.round((performance.now() - started) / fixtures.length)),
      estCostUsd: provider.name === "MockAIProvider" ? 0 : 0.08,
    },
  });
}
