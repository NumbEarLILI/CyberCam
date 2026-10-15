import { describe, expect, it } from "vitest";
import { rotateRgba } from "../src/lib/bitmap";
import { holdFromOrientation, holdFromTilt, stillQuarter, visibleHold } from "../src/lib/hold";

describe("holding the phone", () => {
  it("snaps the Android orientation angle to a side", () => {
    expect(holdFromOrientation(0)).toBe("portrait");
    expect(holdFromOrientation(44)).toBe("portrait");
    expect(holdFromOrientation(46)).toBe("left");
    expect(holdFromOrientation(90)).toBe("left");
    expect(holdFromOrientation(180)).toBe("upside");
    expect(holdFromOrientation(270)).toBe("right");
    expect(holdFromOrientation(360)).toBe("portrait");
    expect(holdFromOrientation(-90)).toBe("right");
  });

  it("reads a tilt as landscape only when the phone is actually on its side", () => {
    expect(holdFromTilt(90, 0)).toBe("portrait");
    expect(holdFromTilt(10, 70)).toBe("left");
    expect(holdFromTilt(10, -70)).toBe("right");
    expect(holdFromTilt(170, 5)).toBe("upside");
    expect(holdFromTilt(5, 5)).toBeNull();
    expect(holdFromTilt(null, 80)).toBeNull();
  });

  it("leaves labels alone when the viewport already rotated", () => {
    expect(visibleHold("left", true)).toBe("left");
    expect(visibleHold("left", false)).toBe("portrait");
  });

  it("turns a saved still so world-up is at the top of the file", () => {
    expect(stillQuarter("portrait")).toBe(0);
    expect(stillQuarter("left")).toBe(1);
    expect(stillQuarter("upside")).toBe(2);
    expect(stillQuarter("right")).toBe(3);
  });

  it("rotates pixels clockwise", () => {
    const rgba = new Uint8ClampedArray([
      10, 0, 0, 255, 20, 0, 0, 255,
      30, 0, 0, 255, 40, 0, 0, 255,
    ]);
    const turned = rotateRgba(rgba, 2, 2, 1);
    expect(turned.width).toBe(2);
    expect(turned.height).toBe(2);
    expect([...turned.data.filter((_, index) => index % 4 === 0)]).toEqual([30, 10, 40, 20]);
    const home = rotateRgba(turned.data, turned.width, turned.height, 3);
    expect([...home.data.filter((_, index) => index % 4 === 0)]).toEqual([10, 20, 30, 40]);
    expect(rotateRgba(rgba, 2, 2, 0).data).toBe(rgba);
  });
});
