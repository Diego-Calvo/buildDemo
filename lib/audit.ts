import { ActorType, Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";

export type AuditPayload = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  actorId: string | null;
  actorType: ActorType;
  before: Prisma.InputJsonValue | null;
  after: Prisma.InputJsonValue | null;
  ipOrJob: string;
  createdAt: string;
};

export function computeAuditHash(previousHash: string, payload: AuditPayload) {
  return createHash("sha256")
    .update(`${previousHash}:${JSON.stringify(payload)}`)
    .digest("hex");
}

export function verifyAuditChain(
  rows: Array<AuditPayload & { previousHash: string; hash: string }>,
) {
  let previousHash = "GENESIS";
  for (const row of rows) {
    const { previousHash: recordedPrevious, hash, ...payload } = row;
    if (
      recordedPrevious !== previousHash ||
      computeAuditHash(previousHash, payload) !== hash
    ) {
      return { valid: false, brokenAt: row.id };
    }
    previousHash = hash;
  }
  return { valid: true, brokenAt: null };
}

export async function appendAudit(
  payload: Omit<AuditPayload, "id" | "createdAt">,
) {
  const links = await db.auditLog.findMany({
    select: { hash: true, previousHash: true },
  });
  const referencedHashes = new Set(links.map((link) => link.previousHash));
  const tail = links.find((link) => !referencedHashes.has(link.hash));
  const previousHash = tail?.hash ?? "GENESIS";
  const id = crypto.randomUUID();
  const createdAt = new Date();
  const complete: AuditPayload = {
    id,
    ...payload,
    createdAt: createdAt.toISOString(),
  };
  const hash = computeAuditHash(previousHash, complete);
  return db.auditLog.create({
    data: {
      ...complete,
      before: complete.before ?? Prisma.JsonNull,
      after: complete.after ?? Prisma.JsonNull,
      createdAt,
      previousHash,
      hash,
    },
  });
}

export async function checkStoredAuditIntegrity() {
  const rows = await db.auditLog.findMany({
    orderBy: { id: "asc" },
  });
  const mapped = rows.map((row) => ({
      id: row.id,
      entityType: row.entityType,
      entityId: row.entityId,
      action: row.action,
      actorId: row.actorId,
      actorType: row.actorType,
      before: row.before as Prisma.InputJsonValue | null,
      after: row.after as Prisma.InputJsonValue | null,
      ipOrJob: row.ipOrJob,
      createdAt: row.createdAt.toISOString(),
      previousHash: row.previousHash,
      hash: row.hash,
    }));
  const ordered = [];
  let previousHash = "GENESIS";
  while (ordered.length < mapped.length) {
    const next = mapped.find((row) => row.previousHash === previousHash);
    if (!next) return { valid: false, brokenAt: null };
    ordered.push(next);
    previousHash = next.hash;
  }
  return verifyAuditChain(ordered);
}
