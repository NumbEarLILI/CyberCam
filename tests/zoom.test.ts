import { describe, expect, it } from "vitest";
import { coverScale } from "../src/lib/finder";
import { clampZoom, formatZoom, stepZoom, zoomedCover, zoomSourceRect } from "../src/lib/zoom";

describe("zoom", () => {
  it("keeps zoom between 1× and 4× and rounds to a tenth", () => {
    expect(clampZoom(0.2)).toBe(1);
    expect(clampZoom(4.4)).toBe(4);
    expect(clampZoom(1.26)).toBe(1.3);
    expect(stepZoom(1, 1)).toBe(1.3);
    expect(stepZoom(1.3, -1)).toBe(1);
    expect(stepZoom(4, 1)).toBe(4);
    expect(formatZoom(1)).toBe("1.0×");
    expect(formatZoom(1.25)).toBe("1.3×");
  });

  it("center-crops the source by the zoom factor", () => {
    expect(zoomSourceRect(1920, 1080, 1)).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
    const zoomed = zoomSourceRect(1920, 1080, 2);
    expect(zoomed.x).toBeCloseTo(480);
    expect(zoomed.y).toBeCloseTo(270);
    expect(zoomed.width).toBeCloseTo(960);
    expect(zoomed.height).toBeCloseTo(540);
  });

  it("matches the finder cover after the camera aspect crop", () => {
    const sourceWidth = 1920;
    const sourceHeight = 1080;
    const frameAspect = 1.5;
    const zoom = 2;
    const cover = zoomedCover(coverScale(sourceWidth / sourceHeight, frameAspect), zoom);
    const rect = zoomSourceRect(sourceWidth, sourceHeight, zoom);
    const zoomedAspect = rect.width / rect.height;
    const visibleWidth = zoomedAspect > frameAspect ? rect.height * frameAspect : rect.width;
    const visibleHeight = zoomedAspect > frameAspect ? rect.height : rect.width / frameAspect;
    expect(visibleWidth / sourceWidth).toBeCloseTo(cover[0]);
    expect(visibleHeight / sourceHeight).toBeCloseTo(cover[1]);
    expect(cover[0]).toBeCloseTo(0.421875);
    expect(cover[1]).toBeCloseTo(0.5);
  });
});
