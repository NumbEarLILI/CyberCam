import { describe, expect, it } from "vitest";
import { hardwareLensLabel, lensLabel, preferredHardwareCamera, shouldMirrorTrack, type HardwareCamera } from "../src/lib/lenses";

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

  it("names each rear sensor when the phone hides them behind one camera", () => {
    const cameras: HardwareCamera[] = [
      { id: "0", facing: "back", equivalent: 24, physical: false },
      { id: "2", facing: "back", equivalent: 13, physical: true },
      { id: "3", facing: "back", equivalent: 24, physical: true },
      { id: "4", facing: "back", equivalent: 70, physical: true },
      { id: "1", facing: "front", equivalent: 24, physical: false },
    ];
    expect(hardwareLensLabel(cameras[0], cameras)).toBe("后置 · 自动");
    expect(hardwareLensLabel(cameras[1], cameras)).toBe("后置 · 超广角 13mm");
    expect(hardwareLensLabel(cameras[2], cameras)).toBe("后置 · 主摄 24mm");
    expect(hardwareLensLabel(cameras[3], cameras)).toBe("后置 · 长焦 70mm");
    expect(hardwareLensLabel(cameras[4], cameras)).toBe("前置摄像头");
    expect(preferredHardwareCamera(cameras)).toBe("0");
  });

  it("keeps unlabeled rear sensors distinct", () => {
    const cameras: HardwareCamera[] = [
      { id: "0", facing: "back", equivalent: 0, physical: false },
      { id: "2", facing: "back", equivalent: 0, physical: true },
      { id: "3", facing: "back", equivalent: 0, physical: true },
    ];
    expect(hardwareLensLabel(cameras[1], cameras)).toBe("后置镜头 1");
    expect(hardwareLensLabel(cameras[2], cameras)).toBe("后置镜头 2");
    expect(hardwareLensLabel(cameras[0], cameras)).toBe("后置 · 自动");
  });

  it("mirrors only the front camera", () => {
    expect(shouldMirrorTrack("user", "")).toBe(true);
    expect(shouldMirrorTrack("environment", "front camera")).toBe(false);
    expect(shouldMirrorTrack(undefined, "FaceTime HD Camera")).toBe(true);
    expect(shouldMirrorTrack(undefined, "Back Camera")).toBe(false);
  });
});
