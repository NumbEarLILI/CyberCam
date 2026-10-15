import { describe, expect, it } from "vitest";
import { lensLabel, shouldMirrorTrack } from "../src/lib/lenses";

describe("camera devices", () => {
  it("names unlabeled cameras by their order", () => {
    expect(lensLabel("", 0)).toBe("摄像头 1");
    expect(lensLabel("   ", 2)).toBe("摄像头 3");
  });

  it("keeps several front and back cameras distinct", () => {
    expect(lensLabel("camera2 0, facing back", 0)).toBe("后置摄像头 1");
    expect(lensLabel("camera2 1, facing back", 1)).toBe("后置摄像头 2");
    expect(lensLabel("camera2 2, facing front", 2)).toBe("前置摄像头 3");
    expect(lensLabel("Back Camera", 0)).toBe("后置摄像头 1");
  });

  it("keeps a specific camera name", () => {
    expect(lensLabel("USB Capture", 0)).toBe("USB Capture");
    expect(lensLabel("FaceTime HD Camera", 0)).toBe("前置 · FaceTime HD Camera");
  });

  it("mirrors only the front camera", () => {
    expect(shouldMirrorTrack("user", "")).toBe(true);
    expect(shouldMirrorTrack("environment", "front camera")).toBe(false);
    expect(shouldMirrorTrack(undefined, "FaceTime HD Camera")).toBe(true);
    expect(shouldMirrorTrack(undefined, "Back Camera")).toBe(false);
  });
});
