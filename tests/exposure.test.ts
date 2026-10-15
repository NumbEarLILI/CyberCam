import { describe, expect, it } from "vitest";
import {
  APERTURE_VALUES,
  BASE_APERTURE,
  BASE_SHUTTER,
  ISO_VALUES,
  exposureStops,
  formatAperture,
  formatShutter,
  isoGrainScale,
  recipeEv,
  stepAperture,
  stepIso,
  stepShutter,
} from "../src/lib/exposure";

describe("exposure dials", () => {
  it("starts neutral on a film's box speed", () => {
    expect(exposureStops(400, 400, BASE_SHUTTER, BASE_APERTURE)).toBe(0);
    expect(exposureStops(160, 160, BASE_SHUTTER, BASE_APERTURE)).toBe(0);
    expect(exposureStops(50, 50, BASE_SHUTTER, BASE_APERTURE)).toBe(0);
  });

  it("adds one stop per click of ISO, shutter, or aperture", () => {
    expect(exposureStops(800, 400, BASE_SHUTTER, BASE_APERTURE)).toBeCloseTo(1);
    expect(exposureStops(200, 400, BASE_SHUTTER, BASE_APERTURE)).toBeCloseTo(-1);
    expect(exposureStops(400, 400, stepShutter(BASE_SHUTTER, -1), BASE_APERTURE)).toBeCloseTo(1);
    expect(exposureStops(400, 400, stepShutter(BASE_SHUTTER, 1), BASE_APERTURE)).toBeCloseTo(-1);
    expect(exposureStops(400, 400, BASE_SHUTTER, stepAperture(BASE_APERTURE, -1))).toBeCloseTo(1);
    expect(exposureStops(400, 400, BASE_SHUTTER, stepAperture(BASE_APERTURE, 1))).toBeCloseTo(-1);
  });

  it("stacks the three dials on top of exposure compensation", () => {
    const iso = stepIso(400, 1);
    const shutter = stepShutter(BASE_SHUTTER, -1);
    const aperture = stepAperture(BASE_APERTURE, 1);
    expect(recipeEv(0.5, 400, { iso, shutter, aperture })).toBeCloseTo(1.5);
  });

  it("leaves older shots that have no dials on their saved compensation", () => {
    expect(recipeEv(1, 400, {})).toBe(1);
  });

  it("stops at the ends of each ladder", () => {
    expect(stepIso(ISO_VALUES[0], -1)).toBe(ISO_VALUES[0]);
    expect(stepIso(ISO_VALUES[ISO_VALUES.length - 1], 1)).toBe(ISO_VALUES[ISO_VALUES.length - 1]);
    expect(stepShutter(1, -1)).toBe(1);
    expect(stepShutter(1 / 2000, 1)).toBe(1 / 2000);
    expect(stepAperture(APERTURE_VALUES[0], -1)).toBe(APERTURE_VALUES[0]);
    expect(stepAperture(16, 1)).toBe(16);
  });

  it("prints shutter and aperture the way a dial does", () => {
    expect(formatShutter(1 / 125)).toBe("1/125");
    expect(formatShutter(1)).toBe("1s");
    expect(formatAperture(2.8)).toBe("f/2.8");
    expect(formatAperture(4)).toBe("f/4");
    expect(formatAperture(11)).toBe("f/11");
  });

  it("adds grain only when ISO is above the box speed", () => {
    expect(isoGrainScale(400, 400)).toBe(1);
    expect(isoGrainScale(100, 400)).toBe(1);
    expect(isoGrainScale(1600, 400)).toBeCloseTo(2);
  });
});
