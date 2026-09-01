"use server";

import { ApplicationStage, HiringDecision, Role } from "@prisma/client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { appendAudit, checkStoredAuditIntegrity } from "@/lib/audit";
import { applicationScope, getCurrentUser, assertRole } from "@/lib/authz";
import { runAIEvaluation } from "@/lib/automation/evaluation";
import { simulateInboxIntake } from "@/lib/automation/intake";
import { anonymizeExpiredCandidates } from "@/lib/automation/retention";
import { runAllAutomation } from "@/lib/automation/runner";
import { db } from "@/lib/db";
import { checkBand } from "@/lib/offer";
import { transition } from "@/lib/pipeline";

export async function switchUser(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  await db.user.findUniqueOrThrow({ where: { id: userId } });
  cookies().set("talentflow-user", userId, {
    sameSite: "lax",
    httpOnly: true,
    path: "/",
  });
  redirect("/");
}

export async function transitionApplication(formData: FormData) {
  const user = await getCurrentUser();
  const applicationId = String(formData.get("applicationId") ?? "");
  const candidateId = String(formData.get("candidateId") ?? "");
  const target = String(formData.get("target") ?? "") as ApplicationStage;
  const reason = String(formData.get("reason") ?? "Required review completed.");
  const application = await db.application.findFirstOrThrow({
    where: { AND: [{ id: applicationId }, applicationScope(user)] },
    include: {
      candidate: { include: { resumes: true } },
      offer: true,
      requisition: { include: { template: true } },
    },
  });
  const resume = application.candidate.resumes[0];
  const redFlags = Array.isArray(resume?.redFlags)
    ? resume.redFlags.filter(
        (flag): flag is { severity?: string } =>
          typeof flag === "object" && flag !== null && !Array.isArray(flag),
      )
    : [];
  await transition(applicationId, target, user, {
    reason,
    overrideReason: String(formData.get("overrideReason") ?? ""),
    redFlags,
    requisitionId:
      String(formData.get("requisitionId") ?? application.requisitionId ?? "") ||
      undefined,
    decision:
      target === ApplicationStage.OFFER_DRAFT
        ? HiringDecision.HIRE
        : target === ApplicationStage.REJECTED &&
            application.stage === ApplicationStage.DECISION
          ? HiringDecision.NO_HIRE
          : undefined,
    offerWithinBand: application.offer?.withinBand ?? true,
    offerJustification: application.offer?.justification ?? undefined,
  });
  revalidatePath(`/candidates/${candidateId}`);
  revalidatePath("/");
}

export async function submitScorecard(formData: FormData) {
  const user = await getCurrentUser();
  assertRole(user, [Role.INTERVIEWER]);
  const interviewId = String(formData.get("interviewId") ?? "");
  const interview = await db.interview.findFirstOrThrow({
    where: { id: interviewId, interviewerId: user.id },
  });
  const rating = Number(formData.get("rating"));
  if (!Number.isInteger(rating) || rating < 1 || rating > 4) {
    throw new Error("Overall rating must be between 1 and 4.");
  }
  const notes = String(formData.get("notes") ?? "").trim();
  if (notes.length < 20) throw new Error("Evidence notes must contain at least 20 characters.");
  await db.scorecard.create({
    data: {
      id: crypto.randomUUID(),
      interviewId,
      overallRating: rating,
      recommendation: String(formData.get("recommendation")) as
        | "STRONG_HIRE"
        | "HIRE"
        | "NO_HIRE"
        | "STRONG_NO_HIRE",
      competencyRatings: {
        "Role expertise": rating,
        "Structured problem solving": rating,
        Collaboration: rating,
      },
      notes,
      submittedAt: new Date(),
    },
  });
  await appendAudit({
    entityType: "Interview",
    entityId: interview.id,
    action: "SCORECARD_SUBMITTED",
    actorId: user.id,
    actorType: "HUMAN",
    before: {},
    after: { overallRating: rating },
    ipOrJob: "server-action",
  });
  revalidatePath("/interviews");
}

export async function reviewOffer(formData: FormData) {
  const user = await getCurrentUser();
  assertRole(user, [Role.PAYROLL]);
  const offerId = String(formData.get("offerId") ?? "");
  const approve = formData.get("decision") === "approve";
  const offer = await db.offerPackage.findUniqueOrThrow({
    where: { id: offerId },
    include: { application: true },
  });
  const comment = String(formData.get("comment") ?? "").trim();
  if (!comment) throw new Error("Payroll must record a review comment.");
  await db.offerPackage.update({
    where: { id: offerId },
    data: {
      status: approve ? "APPROVED" : "REJECTED",
      payrollReviewerId: user.id,
      payrollDecisionAt: new Date(),
      payrollComment: comment,
    },
  });
  await transition(
    offer.applicationId,
    approve ? ApplicationStage.OFFER_SENT : ApplicationStage.OFFER_DRAFT,
    user,
    { reason: comment },
  );
  revalidatePath("/payroll");
}

export async function runAutomationAction() {
  const user = await getCurrentUser();
  assertRole(user, [Role.ADMIN, Role.LEADER]);
  await runAllAutomation();
  revalidatePath("/ops");
  revalidatePath("/");
}

export async function simulateIntakeAction() {
  const user = await getCurrentUser();
  assertRole(user, [Role.ADMIN, Role.COORDINATOR]);
  await simulateInboxIntake(3);
  await runAllAutomation("Inbox intake automation");
  revalidatePath("/intake");
}

export async function bulkAssignApplications(formData: FormData) {
  const user = await getCurrentUser();
  assertRole(user, [Role.COORDINATOR, Role.RECRUITER]);
  const recruiterId = String(formData.get("recruiterId") ?? "");
  const applicationIds = formData.getAll("applicationId").map(String);
  await db.user.findFirstOrThrow({ where: { id: recruiterId, role: Role.RECRUITER } });
  if (applicationIds.length === 0) throw new Error("Select at least one application.");
  await db.application.updateMany({
    where: { id: { in: applicationIds }, stage: { in: ["RECEIVED", "TRIAGED"] } },
    data: { ownerId: recruiterId },
  });
  revalidatePath("/intake");
}

export async function runEvaluationAction() {
  const user = await getCurrentUser();
  assertRole(user, [Role.ADMIN, Role.LEADER]);
  await runAIEvaluation();
  revalidatePath("/ops");
}

export async function runRetentionAction() {
  const user = await getCurrentUser();
  assertRole(user, [Role.ADMIN]);
  await anonymizeExpiredCandidates();
  revalidatePath("/ops");
}

export async function verifyAuditAction() {
  const user = await getCurrentUser();
  assertRole(user, [Role.ADMIN, Role.LEADER]);
  const result = await checkStoredAuditIntegrity();
  redirect(`/ops?integrity=${result.valid ? "ok" : `broken-${result.brokenAt ?? "unknown"}`}`);
}

export async function updateSettings(formData: FormData) {
  const user = await getCurrentUser();
  assertRole(user, [Role.ADMIN]);
  const keys = ["retentionMonths", "consentText", "manualHourlyCostUsd", "hostingMonthlyUsd"];
  for (const key of keys) {
    const value = String(formData.get(key) ?? "").trim();
    if (!value) throw new Error(`${key} cannot be empty.`);
    await db.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }
  revalidatePath("/admin/settings");
}

export async function updateAdminControls(formData: FormData) {
  const user = await getCurrentUser();
  assertRole(user, [Role.ADMIN]);
  const [policies, users] = await Promise.all([
    db.slaPolicy.findMany({ select: { id: true } }),
    db.user.findMany({ select: { id: true } }),
  ]);
  for (const policy of policies) {
    const targetHours = Number(formData.get(`targetHours-${policy.id}`));
    const warnAtPct = Number(formData.get(`warnAtPct-${policy.id}`));
    if (!Number.isFinite(targetHours) || targetHours < 1) {
      throw new Error("SLA target hours must be positive.");
    }
    if (!Number.isFinite(warnAtPct) || warnAtPct < 1 || warnAtPct > 100) {
      throw new Error("SLA warning percentage must be between 1 and 100.");
    }
    await db.slaPolicy.update({
      where: { id: policy.id },
      data: { targetHours: Math.round(targetHours), warnAtPct: Math.round(warnAtPct) },
    });
  }
  const allowedRoles = new Set(Object.values(Role));
  for (const account of users) {
    const role = String(formData.get(`role-${account.id}`) ?? "");
    if (allowedRoles.has(role as Role)) {
      await db.user.update({ where: { id: account.id }, data: { role: role as Role } });
    }
  }
  revalidatePath("/admin/settings");
}

export async function createRequisition(formData: FormData) {
  const user = await getCurrentUser();
  assertRole(user, [Role.RECRUITER, Role.HIRING_MANAGER, Role.ADMIN]);
  const templateId = String(formData.get("templateId") ?? "");
  const departmentId = String(formData.get("departmentId") ?? "");
  const hiringManagerId = String(formData.get("hiringManagerId") ?? "");
  const recruiterId = String(formData.get("recruiterId") ?? "");
  const template = await db.jobDescriptionTemplate.findUniqueOrThrow({ where: { id: templateId } });
  const count = await db.requisition.count();
  await db.requisition.create({
    data: {
      id: crypto.randomUUID(),
      code: `REQ-2026-${String(142 + count).padStart(4, "0")}`,
      title: template.title,
      departmentId,
      hiringManagerId,
      recruiterId,
      templateId,
      status: user.role === Role.HIRING_MANAGER ? "OPEN" : "DRAFT",
      openedAt: user.role === Role.HIRING_MANAGER ? new Date() : null,
      targetStartDate: new Date(String(formData.get("targetStartDate"))),
      priority: String(formData.get("priority") ?? "NORMAL"),
      location: String(formData.get("location") ?? "LATAM / Hybrid"),
      openingsCount: Number(formData.get("openingsCount") ?? 1),
    },
  });
  redirect("/requisitions");
}

export async function createTemplateDraft(formData: FormData) {
  const user = await getCurrentUser();
  assertRole(user, [Role.RECRUITER, Role.ADMIN]);
  const sourceId = String(formData.get("sourceTemplateId") ?? "");
  const source = await db.jobDescriptionTemplate.findUniqueOrThrow({ where: { id: sourceId } });
  const latest = await db.jobDescriptionTemplate.findFirst({
    where: { family: source.family, level: source.level, title: source.title },
    orderBy: { version: "desc" },
  });
  const draft = await db.jobDescriptionTemplate.create({
    data: {
      id: crypto.randomUUID(),
      family: source.family,
      level: source.level,
      title: source.title,
      summary: source.summary,
      responsibilities: source.responsibilities ?? [],
      mustHave: source.mustHave ?? [],
      niceToHave: source.niceToHave ?? [],
      compBandMin: source.compBandMin,
      compBandMax: source.compBandMax,
      currency: source.currency,
      version: (latest?.version ?? source.version) + 1,
    },
  });
  await appendAudit({
    entityType: "JobDescriptionTemplate",
    entityId: draft.id,
    action: "TEMPLATE_VERSION_CREATED",
    actorId: user.id,
    actorType: "HUMAN",
    before: { sourceId },
    after: { version: draft.version },
    ipOrJob: "server-action",
  });
  revalidatePath("/templates");
}

export async function approveTemplate(formData: FormData) {
  const user = await getCurrentUser();
  assertRole(user, [Role.HIRING_MANAGER]);
  const templateId = String(formData.get("templateId") ?? "");
  await db.jobDescriptionTemplate.update({
    where: { id: templateId },
    data: { approvedById: user.id, approvedAt: new Date() },
  });
  await appendAudit({
    entityType: "JobDescriptionTemplate",
    entityId: templateId,
    action: "TEMPLATE_APPROVED",
    actorId: user.id,
    actorType: "HUMAN",
    before: { approved: false },
    after: { approved: true },
    ipOrJob: "server-action",
  });
  revalidatePath("/templates");
}

export async function submitOffer(formData: FormData) {
  const user = await getCurrentUser();
  assertRole(user, [Role.RECRUITER]);
  const applicationId = String(formData.get("applicationId") ?? "");
  const application = await db.application.findFirstOrThrow({
    where: { id: applicationId, ownerId: user.id },
    include: { requisition: { include: { template: true } }, offer: true },
  });
  if (!application.requisition) throw new Error("A requisition is required.");
  const salary = Number(formData.get("baseSalary"));
  const band = checkBand(
    salary,
    application.requisition.template.compBandMin,
    application.requisition.template.compBandMax,
  );
  const justification = String(formData.get("justification") ?? "").trim();
  if (!band.withinBand && !justification) {
    throw new Error("Out-of-band offers require justification.");
  }
  await db.offerPackage.upsert({
    where: { applicationId },
    update: { baseSalary: salary, withinBand: band.withinBand, justification, status: "PENDING_PAYROLL" },
    create: {
      id: crypto.randomUUID(),
      applicationId,
      baseSalary: salary,
      bonusPct: 10,
      equity: 0,
      signOn: 0,
      startDate: new Date(String(formData.get("startDate"))),
      currency: application.requisition.template.currency,
      withinBand: band.withinBand,
      justification,
      status: "PENDING_PAYROLL",
    },
  });
  await transition(applicationId, ApplicationStage.OFFER_PAYROLL_APPROVAL, user, {
    reason: "Offer package submitted to Payroll.",
    offerWithinBand: band.withinBand,
    offerJustification: justification,
  });
  revalidatePath(`/candidates/${application.candidateId}`);
}
