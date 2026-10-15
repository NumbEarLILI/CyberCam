import { describe, expect, it } from "vitest";
import { fitSize } from "../src/lib/bitmap";
import { frameSize, orientedAspect, sensorConstraints, SENSOR_HEIGHT, SENSOR_WIDTH, STILL_MAX_EDGE } from "../src/lib/frame";

describe("frame orientation", () => {
  it("turns a landscape film gate upright in portrait and leaves square gates square", () => {
    expect(orientedAspect(1.5, true)).toBeCloseTo(2 / 3);
    expect(orientedAspect(1.5, false)).toBe(1.5);
    expect(orientedAspect(1, true)).toBe(1);
    expect(orientedAspect(7 / 6, true)).toBeCloseTo(6 / 7);
    expect(orientedAspect(6 / 7, false)).toBeCloseTo(7 / 6);
  });

  it("fills the short side of the screen with that gate", () => {
    const portrait = frameSize(374, 760, 2 / 3);
    expect(portrait.width).toBeCloseTo(374);
    expect(portrait.height).toBeCloseTo(561);
    expect(portrait.height).toBeGreaterThan(portrait.width);
    const landscape = frameSize(760, 320, 1.5);
    expect(landscape.height).toBeCloseTo(320);
    expect(landscape.width).toBeCloseTo(480);
    expect(landscape.width).toBeGreaterThan(landscape.height);
  });

  it("asks the camera for a 4:3 frame at the sensor's high resolution", () => {
    const open = sensorConstraints(null);
    expect(open.width).toEqual({ ideal: SENSOR_WIDTH });
    expect(open.height).toEqual({ ideal: SENSOR_HEIGHT });
    expect(SENSOR_WIDTH / SENSOR_HEIGHT).toBeCloseTo(4 / 3);
    expect(STILL_MAX_EDGE).toBe(4096);
    expect(fitSize(4000, 3000, STILL_MAX_EDGE)).toEqual({ width: 4000, height: 3000 });
    expect(Math.max(...Object.values(fitSize(8000, 6000, STILL_MAX_EDGE)))).toBe(4096);
    expect(open).not.toHaveProperty("aspectRatio");
    expect(sensorConstraints("cam-2").deviceId).toEqual({ exact: "cam-2" });
  });
});
