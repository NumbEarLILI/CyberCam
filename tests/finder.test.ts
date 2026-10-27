import { describe, expect, it } from "vitest";
import { coverScale, nextPreviewEdge, nextRefresh, PREVIEW_MAX, PREVIEW_MIN } from "../src/lib/finder";

const HZ60 = 1000 / 60;

describe("finder pace", () => {
  it("keeps the preview size through a single stutter", () => {
    let state = { edge: 1280, slow: 0, fast: 0 };
    state = nextPreviewEdge(state.edge, 60, state.slow, state.fast, HZ60);
    state = nextPreviewEdge(state.edge, HZ60, state.slow, state.fast, HZ60);
    state = nextPreviewEdge(state.edge, 60, state.slow, state.fast, HZ60);
    expect(state.edge).toBe(1280);
  });

  it("shrinks the preview after a run of slow frames and keeps a floor", () => {
    let state = { edge: 1280, slow: 0, fast: 0 };
    for (let i = 0; i < 3; i += 1) state = nextPreviewEdge(state.edge, 50, state.slow, state.fast, HZ60);
    expect(state.edge).toBe(1280);
    state = nextPreviewEdge(state.edge, 50, state.slow, state.fast, HZ60);
    expect(state.edge).toBe(Math.round(1280 * 0.8));
    expect(state.slow).toBe(0);
    for (let i = 0; i < 40; i += 1) state = nextPreviewEdge(state.edge, 50, state.slow, state.fast, HZ60);
    expect(state.edge).toBe(PREVIEW_MIN);
  });

  it("grows back on a 60 Hz display once frames keep up", () => {
    let state = { edge: PREVIEW_MIN, slow: 0, fast: 0 };
    for (let i = 0; i < 29; i += 1) state = nextPreviewEdge(state.edge, HZ60, state.slow, state.fast, HZ60);
    expect(state.edge).toBe(PREVIEW_MIN);
    state = nextPreviewEdge(state.edge, HZ60, state.slow, state.fast, HZ60);
    expect(state.edge).toBe(Math.round(PREVIEW_MIN * 1.2));
    expect(nextPreviewEdge(PREVIEW_MAX, HZ60, 0, 40, HZ60).edge).toBe(PREVIEW_MAX);
  });

  it("learns the display interval from the shortest recent gaps", () => {
    let refresh = HZ60;
    refresh = nextRefresh(refresh, 1000 / 120);
    expect(refresh).toBeCloseTo(1000 / 120);
    refresh = nextRefresh(refresh, 60);
    expect(refresh).toBeLessThan(9);
    expect(nextRefresh(refresh, 1)).toBeGreaterThanOrEqual(4);
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
