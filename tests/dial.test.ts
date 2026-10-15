import { describe, expect, it } from "vitest";
import { advanceDial, projectMove } from "../src/lib/dial";

describe("camera dial", () => {
  it("turns one stop per slot and keeps the leftover movement", () => {
    expect(advanceDial(3, 9, 52, 52)).toEqual({ index: 4, carry: 0, steps: 1 });
    expect(advanceDial(3, 9, 70, 52)).toEqual({ index: 4, carry: 18, steps: 1 });
    expect(advanceDial(3, 9, -104, 52)).toEqual({ index: 1, carry: 0, steps: -2 });
  });

  it("stops at the ends and resists a little past them", () => {
    expect(advanceDial(0, 9, -40, 52)).toMatchObject({ index: 0, steps: 0 });
    expect(advanceDial(0, 9, -40, 52).carry).toBe(-18);
    expect(advanceDial(8, 9, 80, 52)).toMatchObject({ index: 8, steps: 0, carry: 18 });
  });

  it("follows the finger toward the next stop, including a vertical dial", () => {
    expect(projectMove(30, 0, 52, 0)).toBeCloseTo(30);
    expect(projectMove(-20, 0, 52, 0)).toBeCloseTo(-20);
    expect(projectMove(0, 40, 0, 48)).toBeCloseTo(40);
    expect(projectMove(0, -10, 0, 48)).toBeCloseTo(-10);
  });
});
