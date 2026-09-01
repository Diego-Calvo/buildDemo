import { describe, expect, it } from "vitest";
import { ApplicationStage as Stage, HiringDecision, Role } from "@prisma/client";
import { PipelineError, validateTransition } from "@/lib/pipeline";

describe("pipeline transitions", () => {
  const validCases = [
    [Stage.RECEIVED, Stage.TRIAGED, { role: "SYSTEM", resumeClean: true, parseSucceeded: true }],
    [Stage.TRIAGED, Stage.RESUME_VALIDATED, { role: Role.RECRUITER, redFlags: [] }],
    [Stage.RESUME_VALIDATED, Stage.MATCHED, { role: Role.RECRUITER, requisitionId: "req-1" }],
    [Stage.MATCHED, Stage.RECRUITER_SCREEN, { role: Role.RECRUITER }],
    [Stage.RECRUITER_SCREEN, Stage.HM_REVIEW, { role: Role.RECRUITER }],
    [Stage.HM_REVIEW, Stage.INTERVIEWING, { role: Role.HIRING_MANAGER }],
    [Stage.INTERVIEWING, Stage.DECISION, { role: "SYSTEM", allScorecardsSubmitted: true }],
    [Stage.DECISION, Stage.OFFER_DRAFT, { role: Role.HIRING_MANAGER, decision: HiringDecision.HIRE }],
    [Stage.DECISION, Stage.REJECTED, { role: Role.HIRING_MANAGER, decision: HiringDecision.NO_HIRE, reason: "Evidence did not meet the role requirements." }],
    [Stage.OFFER_DRAFT, Stage.OFFER_PAYROLL_APPROVAL, { role: Role.RECRUITER, offerWithinBand: true }],
    [Stage.OFFER_PAYROLL_APPROVAL, Stage.OFFER_SENT, { role: Role.PAYROLL }],
    [Stage.OFFER_SENT, Stage.HIRED, { role: Role.RECRUITER }],
  ] as const;

  it.each(validCases)("allows %s to %s", (from, to, context) => {
    expect(validateTransition(from, to, context)).toBe(true);
  });

  const invalidCases = [
    [Stage.RECEIVED, Stage.TRIAGED, { role: Role.RECRUITER }, "SYSTEM_ONLY"],
    [Stage.TRIAGED, Stage.RESUME_VALIDATED, { role: Role.RECRUITER, redFlags: [{ severity: "BLOCKING" }] }, "BLOCKING_FLAG"],
    [Stage.RESUME_VALIDATED, Stage.MATCHED, { role: Role.RECRUITER }, "REQUISITION_REQUIRED"],
    [Stage.HM_REVIEW, Stage.INTERVIEWING, { role: Role.RECRUITER }, "ROLE_REQUIRED"],
    [Stage.INTERVIEWING, Stage.DECISION, { role: "SYSTEM", allScorecardsSubmitted: false }, "MISSING_SCORECARDS"],
    [Stage.DECISION, Stage.REJECTED, { role: Role.HIRING_MANAGER, decision: HiringDecision.NO_HIRE, reason: "Too short" }, "DECISION_REASON_REQUIRED"],
    [Stage.OFFER_DRAFT, Stage.OFFER_PAYROLL_APPROVAL, { role: Role.RECRUITER, offerWithinBand: false }, "JUSTIFICATION_REQUIRED"],
    [Stage.OFFER_PAYROLL_APPROVAL, Stage.OFFER_SENT, { role: Role.HIRING_MANAGER }, "ROLE_REQUIRED"],
  ] as const;

  it.each(invalidCases)("blocks %s to %s", (from, to, context, code) => {
    try {
      validateTransition(from, to, context);
      throw new Error("Expected transition to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(PipelineError);
      expect((error as PipelineError).code).toBe(code);
    }
  });
});
