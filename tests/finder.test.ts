import { describe, expect, it } from "vitest";
import { coverScale, nextPreviewEdge } from "../src/lib/finder";

describe("finder pace", () => {
  it("shrinks the preview after repeated slow frames and keeps a floor", () => {
    const once = nextPreviewEdge(960, 40, 0, 0);
    expect(once.edge).toBe(960);
    expect(once.slow).toBe(1);
    const twice = nextPreviewEdge(once.edge, 40, once.slow, once.fast);
    expect(twice.edge).toBe(Math.round(960 * 0.7));
    expect(twice.slow).toBe(0);
    let edge = 320;
    let slow = 1;
    const floored = nextPreviewEdge(edge, 40, slow, 0);
    expect(floored.edge).toBe(320);
  });

  it("grows the preview only after a run of fast frames", () => {
    let state = { edge: 480, slow: 0, fast: 0 };
    for (let i = 0; i < 29; i += 1) state = nextPreviewEdge(state.edge, 8, state.slow, state.fast);
    expect(state.edge).toBe(480);
    state = nextPreviewEdge(state.edge, 8, state.slow, state.fast);
    expect(state.edge).toBe(Math.round(480 * 1.2));
    expect(nextPreviewEdge(960, 8, 0, 40).edge).toBe(960);
  });
});

describe("finder crop", () => {
  it("center-crops a wider source into the camera frame", () => {
    expect(coverScale(1.5, 1.5)).toEqual([1, 1]);
    const square = coverScale(1200 / 800, 1);
    expect(square[1]).toBe(1);
    expect(square[0]).toBeCloseTo(2 / 3);
    const left = (0 - 0.5) * square[0] + 0.5;
    const right = (1 - 0.5) * square[0] + 0.5;
    expect(left).toBeCloseTo(1 / 6);
    expect(right).toBeCloseTo(5 / 6);
  });

  it("center-crops a taller source when the frame is wider", () => {
    const frame = coverScale(1, 1.5);
    expect(frame[0]).toBe(1);
    expect(frame[1]).toBeCloseTo(1 / 1.5);
    const top = (0 - 0.5) * frame[1] + 0.5;
    expect(top).toBeCloseTo(1 / 6);
  });
});
