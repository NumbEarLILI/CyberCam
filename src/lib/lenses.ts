export type Lens = {
  deviceId: string;
  label: string;
};

export function lensLabel(raw: string, index: number) {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return `摄像头 ${index + 1}`;
  const front = /front|user|前置|facetime/i.test(text);
  const back = /back|rear|environment|后置/i.test(text);
  const side = front ? "前置" : back ? "后置" : "";
  if (!side) return text;
  const detail = text
    .replace(/camera\s*2\s*/gi, "")
    .replace(/,?\s*facing\s*(back|front|environment|user)/gi, "")
    .replace(/[,\s]+/g, " ")
    .trim();
  if (!detail || /^\d+$/.test(detail) || /^(back|front|rear|user) camera$/i.test(detail)) {
    return `${side}摄像头 ${index + 1}`;
  }
  return `${side} · ${detail}`;
}

export type HardwareFacing = "back" | "front" | "external";

export type HardwareCamera = {
  id: string;
  facing: HardwareFacing;
  /** 35mm-equivalent focal length in millimeters. 0 when the camera does not report it. */
  equivalent: number;
  /** A physical sensor hidden behind a logical camera, opened on its own. */
  physical: boolean;
};

export function hardwareLensLabel(camera: HardwareCamera, cameras: HardwareCamera[]) {
  const side = camera.facing === "front" ? "前置" : camera.facing === "back" ? "后置" : "外接";
  const group = cameras.filter((item) => item.facing === camera.facing).sort(compareHardware);
  if (group.length <= 1) return `${side}摄像头`;
  if (!camera.physical && group.some((item) => item.physical)) return `${side} · 自动`;
  if (camera.equivalent <= 0) {
    const unknowns = group.filter((item) => item.equivalent <= 0 && (item.physical || !group.some((sibling) => sibling.physical)));
    const index = Math.max(0, unknowns.findIndex((item) => item.id === camera.id));
    return `${side}镜头 ${index + 1}`;
  }
  const role = hardwareRole(camera, specificCameras(group));
  const same = specificCameras(group).filter((item) => item.equivalent > 0 && hardwareRole(item, specificCameras(group)) === role && Math.round(item.equivalent) === Math.round(camera.equivalent));
  const suffix = same.length > 1 ? ` ${camera.id}` : "";
  return `${side} · ${role} ${Math.round(camera.equivalent)}mm${suffix}`;
}

export function preferredHardwareCamera(cameras: HardwareCamera[]) {
  const backs = cameras.filter((camera) => camera.facing === "back");
  const pool = backs.length > 0 ? backs : cameras;
  return pool.find((camera) => !camera.physical)?.id ?? pool[0]?.id ?? null;
}

function specificCameras(group: HardwareCamera[]) {
  const specific = group.filter((item) => item.physical);
  return specific.length > 0 ? specific : group;
}

function hardwareRole(camera: HardwareCamera, group: HardwareCamera[]) {
  const known = group.filter((item) => item.equivalent > 0).sort((a, b) => a.equivalent - b.equivalent);
  if (camera.equivalent <= 0 || known.length <= 1) return "镜头";
  const widest = known[0];
  const longest = known[known.length - 1];
  if (camera.id === widest.id && widest.equivalent <= known[1].equivalent * 0.8) return "超广角";
  if (camera.id === longest.id && longest.equivalent >= known[known.length - 2].equivalent * 1.5) return "长焦";
  const primary = known.slice().sort((a, b) => Math.abs(a.equivalent - 26) - Math.abs(b.equivalent - 26))[0];
  return camera.id === primary.id ? "主摄" : "镜头";
}

function compareHardware(a: HardwareCamera, b: HardwareCamera) {
  if (a.physical !== b.physical) return a.physical ? 1 : -1;
  if (a.equivalent <= 0 && b.equivalent <= 0) return a.id.localeCompare(b.id);
  if (a.equivalent <= 0) return 1;
  if (b.equivalent <= 0) return -1;
  return a.equivalent - b.equivalent || a.id.localeCompare(b.id);
}

export function shouldMirrorTrack(facingMode: string | undefined, label: string) {
  if (facingMode === "user") return true;
  if (facingMode === "environment") return false;
  return /front|user|前置|facetime/i.test(label);
}
