export function srgbByteToLinear(byte: number): number {
  const channel = byte / 255;
  if (channel <= 0.04045) return channel / 12.92;
  return ((channel + 0.055) / 1.055) ** 2.4;
}

export function linearToSrgbByte(linear: number): number {
  const x = linear < 0 ? 0 : linear > 1 ? 1 : linear;
  const encoded = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(encoded * 255)));
}
