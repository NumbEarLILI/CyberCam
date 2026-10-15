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

export function shouldMirrorTrack(facingMode: string | undefined, label: string) {
  if (facingMode === "user") return true;
  if (facingMode === "environment") return false;
  return /front|user|前置|facetime/i.test(label);
}
