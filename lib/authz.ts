import { Role, type Prisma, type User } from "@prisma/client";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

export const ROLE_LABELS: Record<Role, string> = {
  COORDINATOR: "Recruiting Coordinator",
  RECRUITER: "Recruiter",
  HIRING_MANAGER: "Hiring Manager",
  INTERVIEWER: "Interviewer",
  PAYROLL: "Payroll / Compensation",
  LEADER: "Recruiting Leader",
  ADMIN: "Recruiting Ops / IT Admin",
};

export const NAV_BY_ROLE: Record<Role, string[]> = {
  COORDINATOR: ["/", "/intake", "/requisitions"],
  RECRUITER: ["/", "/intake", "/requisitions", "/interviews", "/templates"],
  HIRING_MANAGER: ["/", "/hiring-manager", "/requisitions", "/interviews", "/templates"],
  INTERVIEWER: ["/", "/interviews"],
  PAYROLL: ["/", "/payroll"],
  LEADER: ["/", "/leader", "/requisitions", "/templates", "/ops"],
  ADMIN: ["/", "/ops", "/admin/settings", "/templates", "/requisitions"],
};

export class AuthorizationError extends Error {
  constructor(message = "You do not have access to this information.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export async function getCurrentUser(): Promise<User> {
  const requestedId = cookies().get("talentflow-user")?.value;
  const user = requestedId
    ? await db.user.findUnique({ where: { id: requestedId } })
    : null;
  return (
    user ??
    (await db.user.findUniqueOrThrow({ where: { id: "recruiter-valentina" } }))
  );
}

export function assertRole(user: User, allowed: Role[]) {
  if (!allowed.includes(user.role)) {
    throw new AuthorizationError();
  }
}

export function requisitionScope(user: User): Prisma.RequisitionWhereInput {
  if (user.role === Role.HIRING_MANAGER) return { hiringManagerId: user.id };
  if (user.role === Role.RECRUITER) return { recruiterId: user.id };
  if (user.role === Role.INTERVIEWER || user.role === Role.PAYROLL) {
    throw new AuthorizationError();
  }
  return {};
}

export function applicationScope(user: User): Prisma.ApplicationWhereInput {
  switch (user.role) {
    case Role.HIRING_MANAGER:
      return { requisition: { hiringManagerId: user.id } };
    case Role.INTERVIEWER:
      return { interviews: { some: { interviewerId: user.id } } };
    case Role.PAYROLL:
      return { offer: { isNot: null } };
    case Role.RECRUITER:
      return { ownerId: user.id };
    default:
      return {};
  }
}

export function maySeeInterviewNotes(user: User, interviewerId?: string) {
  const privileged: Role[] = [
    Role.RECRUITER,
    Role.HIRING_MANAGER,
    Role.LEADER,
    Role.ADMIN,
  ];
  return (
    privileged.includes(user.role) ||
    (user.role === Role.INTERVIEWER && user.id === interviewerId)
  );
}

export function maySeeCompensation(user: User) {
  const allowed: Role[] = [
    Role.RECRUITER,
    Role.HIRING_MANAGER,
    Role.PAYROLL,
    Role.LEADER,
    Role.ADMIN,
  ];
  return allowed.includes(user.role);
}
