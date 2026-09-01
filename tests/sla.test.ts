import { describe, expect, it } from "vitest";
import { businessHoursBetween, slaState } from "@/lib/sla";

describe("SLA math", () => {
  it("counts a weekday", () => {
    expect(businessHoursBetween(new Date("2026-08-31T00:00:00Z"), new Date("2026-09-01T00:00:00Z"))).toBe(24);
  });
  it("skips Saturday and Sunday", () => {
    expect(businessHoursBetween(new Date("2026-09-04T00:00:00Z"), new Date("2026-09-07T00:00:00Z"))).toBe(24);
  });
  it("handles a weekend-only range", () => {
    expect(businessHoursBetween(new Date("2026-09-05T00:00:00Z"), new Date("2026-09-06T23:00:00Z"))).toBe(0);
  });
  it("handles reversed dates", () => {
    expect(businessHoursBetween(new Date("2026-09-02"), new Date("2026-09-01"))).toBe(0);
  });
  it.each([
    [1, 10, "GREEN"],
    [7.5, 10, "AMBER"],
    [10, 10, "AMBER"],
    [10.1, 10, "RED"],
  ] as const)("classifies %s of %s as %s", (elapsed, target, state) => {
    expect(slaState(elapsed, target)).toBe(state);
  });
});
