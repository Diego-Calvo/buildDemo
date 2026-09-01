import { ActorType } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { computeAuditHash, verifyAuditChain, type AuditPayload } from "@/lib/audit";

function row(id: string, previousHash: string) {
  const payload: AuditPayload = {
    id,
    entityType: "Application",
    entityId: "app-1",
    action: "STAGE_TRANSITION",
    actorId: null,
    actorType: ActorType.SYSTEM,
    before: { stage: "RECEIVED" },
    after: { stage: "TRIAGED" },
    ipOrJob: "test",
    createdAt: "2026-09-01T00:00:00.000Z",
  };
  return { ...payload, previousHash, hash: computeAuditHash(previousHash, payload) };
}

describe("audit hash chain", () => {
  it("accepts a valid chain", () => {
    const first = row("1", "GENESIS");
    const second = row("2", first.hash);
    expect(verifyAuditChain([first, second]).valid).toBe(true);
  });
  it("detects edited content", () => {
    const first = row("1", "GENESIS");
    expect(verifyAuditChain([{ ...first, action: "TAMPERED" }]).valid).toBe(false);
  });
  it("detects a broken previous hash", () => {
    expect(verifyAuditChain([row("1", "WRONG")]).valid).toBe(false);
  });
  it("returns the broken row id", () => {
    const first = row("1", "GENESIS");
    const second = { ...row("2", first.hash), hash: "bad" };
    expect(verifyAuditChain([first, second]).brokenAt).toBe("2");
  });
});
