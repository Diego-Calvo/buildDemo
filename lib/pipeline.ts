import {
  ActorType,
  ApplicationStage,
  HiringDecision,
  Prisma,
  Role,
  type User,
} from "@prisma/client";
import { appendAudit } from "@/lib/audit";
import { db } from "@/lib/db";

type Flag = { severity?: string };

export type TransitionContext = {
  role: Role | "SYSTEM";
  reason?: string;
  overrideReason?: string;
  redFlags?: readonly Flag[];
  resumeClean?: boolean;
  parseSucceeded?: boolean;
  requisitionId?: string;
  allScorecardsSubmitted?: boolean;
  missingScorecards?: string[];
  decision?: HiringDecision;
  offerWithinBand?: boolean;
  offerJustification?: string;
};

export class PipelineError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "PipelineError";
  }
}

const nextStages: Partial<Record<ApplicationStage, ApplicationStage[]>> = {
  RECEIVED: [ApplicationStage.TRIAGED],
  TRIAGED: [ApplicationStage.RESUME_VALIDATED],
  RESUME_VALIDATED: [ApplicationStage.MATCHED, ApplicationStage.REJECTED],
  MATCHED: [ApplicationStage.RECRUITER_SCREEN, ApplicationStage.REJECTED, ApplicationStage.ON_HOLD],
  RECRUITER_SCREEN: [ApplicationStage.HM_REVIEW, ApplicationStage.REJECTED, ApplicationStage.ON_HOLD],
  HM_REVIEW: [ApplicationStage.INTERVIEWING, ApplicationStage.REJECTED, ApplicationStage.ON_HOLD],
  INTERVIEWING: [ApplicationStage.DECISION, ApplicationStage.WITHDRAWN, ApplicationStage.ON_HOLD],
  DECISION: [ApplicationStage.OFFER_DRAFT, ApplicationStage.REJECTED],
  OFFER_DRAFT: [ApplicationStage.OFFER_PAYROLL_APPROVAL],
  OFFER_PAYROLL_APPROVAL: [ApplicationStage.OFFER_SENT, ApplicationStage.OFFER_DRAFT],
  OFFER_SENT: [ApplicationStage.HIRED, ApplicationStage.WITHDRAWN],
  ON_HOLD: [
    ApplicationStage.MATCHED,
    ApplicationStage.RECRUITER_SCREEN,
    ApplicationStage.HM_REVIEW,
    ApplicationStage.INTERVIEWING,
  ],
};

export function validateTransition(
  from: ApplicationStage,
  to: ApplicationStage,
  context: TransitionContext,
) {
  if (!nextStages[from]?.includes(to)) {
    throw new PipelineError(
      `Cannot move from ${from} to ${to}.`,
      "ILLEGAL_TRANSITION",
      { from, to },
    );
  }
  if (from === ApplicationStage.RECEIVED) {
    if (context.role !== "SYSTEM") {
      throw new PipelineError("Resume triage is performed by automation.", "SYSTEM_ONLY");
    }
    if (!context.resumeClean || !context.parseSucceeded) {
      throw new PipelineError(
        "Resume must pass security scanning and parsing before triage.",
        "RESUME_NOT_READY",
      );
    }
  }
  if (from === ApplicationStage.TRIAGED) {
    if (context.role !== Role.RECRUITER) {
      throw new PipelineError("A recruiter must validate the parsed resume.", "ROLE_REQUIRED");
    }
    const hasBlocking = context.redFlags?.some((flag) => flag.severity === "BLOCKING");
    if (hasBlocking && !context.overrideReason?.trim()) {
      throw new PipelineError(
        "A blocking resume flag requires a recorded override reason.",
        "BLOCKING_FLAG",
      );
    }
  }
  if (from === ApplicationStage.RESUME_VALIDATED) {
    if (context.role !== Role.RECRUITER) {
      throw new PipelineError("A recruiter must select the requisition.", "ROLE_REQUIRED");
    }
    if (to === ApplicationStage.MATCHED && !context.requisitionId) {
      throw new PipelineError("Select one of the proposed requisitions.", "REQUISITION_REQUIRED");
    }
  }
  if (from === ApplicationStage.MATCHED || from === ApplicationStage.RECRUITER_SCREEN) {
    if (context.role !== Role.RECRUITER) {
      throw new PipelineError("This transition requires the assigned recruiter.", "ROLE_REQUIRED");
    }
  }
  if (from === ApplicationStage.HM_REVIEW) {
    if (context.role !== Role.HIRING_MANAGER) {
      throw new PipelineError("The hiring manager must proceed to interviews.", "ROLE_REQUIRED");
    }
  }
  if (from === ApplicationStage.INTERVIEWING && to === ApplicationStage.DECISION) {
    if (context.role !== "SYSTEM") {
      throw new PipelineError("Completion is checked by automation.", "SYSTEM_ONLY");
    }
    if (!context.allScorecardsSubmitted) {
      throw new PipelineError(
        `Missing scorecards: ${(context.missingScorecards ?? []).join(", ")}`,
        "MISSING_SCORECARDS",
        { missing: context.missingScorecards ?? [] },
      );
    }
  }
  if (from === ApplicationStage.DECISION) {
    if (context.role !== Role.HIRING_MANAGER) {
      throw new PipelineError("Only the hiring manager can make the decision.", "ROLE_REQUIRED");
    }
    if (to === ApplicationStage.OFFER_DRAFT && context.decision !== HiringDecision.HIRE) {
      throw new PipelineError("A HIRE decision is required to draft an offer.", "HIRE_REQUIRED");
    }
    if (
      to === ApplicationStage.REJECTED &&
      (context.decision !== HiringDecision.NO_HIRE ||
        (context.reason?.trim().length ?? 0) < 20)
    ) {
      throw new PipelineError(
        "No-hire decisions require a reason of at least 20 characters.",
        "DECISION_REASON_REQUIRED",
      );
    }
  }
  if (from === ApplicationStage.OFFER_DRAFT) {
    if (context.role !== Role.RECRUITER) {
      throw new PipelineError("A recruiter must submit the offer package.", "ROLE_REQUIRED");
    }
    if (!context.offerWithinBand && !context.offerJustification?.trim()) {
      throw new PipelineError(
        "Out-of-band packages require justification.",
        "JUSTIFICATION_REQUIRED",
      );
    }
  }
  if (from === ApplicationStage.OFFER_PAYROLL_APPROVAL && context.role !== Role.PAYROLL) {
    throw new PipelineError("Only Payroll can resolve offer approval.", "ROLE_REQUIRED");
  }
  if (from === ApplicationStage.OFFER_SENT && context.role !== Role.RECRUITER) {
    throw new PipelineError("A recruiter records the candidate outcome.", "ROLE_REQUIRED");
  }
  return true;
}

export async function transition(
  applicationId: string,
  to: ApplicationStage,
  actor: User | null,
  context: Omit<TransitionContext, "role"> & { role?: "SYSTEM" },
) {
  const application = await db.application.findUniqueOrThrow({
    where: { id: applicationId },
    include: { interviews: { include: { scorecard: true, interviewer: true } }, offer: true },
  });
  const role = context.role === "SYSTEM" ? "SYSTEM" : actor?.role;
  if (!role) throw new PipelineError("An actor is required.", "ACTOR_REQUIRED");
  if (actor?.role === Role.RECRUITER && application.ownerId !== actor.id) {
    throw new PipelineError("Only the assigned recruiter can move this candidate.", "OWNER_REQUIRED");
  }
  if (
    actor?.role === Role.HIRING_MANAGER &&
    application.requisitionId &&
    !(await db.requisition.findFirst({
      where: { id: application.requisitionId, hiringManagerId: actor.id },
      select: { id: true },
    }))
  ) {
    throw new PipelineError("This candidate belongs to another hiring manager.", "OWNER_REQUIRED");
  }
  const missing = application.interviews
    .filter((interview) => interview.status === "COMPLETED" && !interview.scorecard)
    .map((interview) => interview.interviewer.name);
  const completeContext: TransitionContext = {
    ...context,
    role,
    allScorecardsSubmitted: context.allScorecardsSubmitted ?? missing.length === 0,
    missingScorecards: context.missingScorecards ?? missing,
  };
  validateTransition(application.stage, to, completeContext);
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.application.update({
      where: { id: applicationId },
      data: {
        stage: to,
        previousStage:
          to === ApplicationStage.ON_HOLD ? application.stage : application.previousStage,
        stageEnteredAt: now,
        requisitionId: context.requisitionId ?? application.requisitionId,
        decision: context.decision ?? application.decision,
        decisionById: context.decision ? actor?.id : application.decisionById,
        decisionAt: context.decision ? now : application.decisionAt,
        decisionReason: context.reason ?? application.decisionReason,
      },
    });
    await tx.stageEvent.create({
      data: {
        id: crypto.randomUUID(),
        applicationId,
        fromStage: application.stage,
        toStage: to,
        actorId: actor?.id,
        actorType: actor ? ActorType.HUMAN : ActorType.SYSTEM,
        reason: context.reason ?? "Transition requirements completed.",
        createdAt: now,
      },
    });
  });
  await appendAudit({
    entityType: "Application",
    entityId: applicationId,
    action: "STAGE_TRANSITION",
    actorId: actor?.id ?? null,
    actorType: actor ? ActorType.HUMAN : ActorType.SYSTEM,
    before: { stage: application.stage },
    after: { stage: to },
    ipOrJob: actor ? "server-action" : "automation:auto-advance",
  });
}

export function validTargets(stage: ApplicationStage) {
  return nextStages[stage] ?? [];
}

export function sanitizeJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
