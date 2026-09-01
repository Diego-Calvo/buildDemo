import { describe, expect, it } from "vitest";
import { checkBand } from "@/lib/offer";

describe("offer band check", () => {
  it.each([
    [50000, 50000, 70000, true, 0],
    [60000, 50000, 70000, true, 0],
    [70000, 50000, 70000, true, 0],
    [45000, 50000, 70000, false, -5000],
    [75000, 50000, 70000, false, 5000],
  ] as const)("checks salary %s", (salary, min, max, withinBand, variance) => {
    expect(checkBand(salary, min, max)).toEqual({ withinBand, variance });
  });
});
