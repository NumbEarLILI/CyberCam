import { srgbByteToLinear } from "./color";

export type RawImage = {
  width: number;
  height: number;
  data: Uint16Array;
};

export type RawMeta = {
  capturedAt: string;
  width: number;
  height: number;
  colorSpace: "linear-srgb";
  channels: 3;
  bitDepth: 16;
};

const MAGIC = "FMRAW1";

export function rgba8ToRaw(rgba: Uint8ClampedArray, width: number, height: number): RawImage {
  const data = new Uint16Array(width * height * 3);
  for (let pixel = 0, source = 0; pixel < width * height; pixel += 1, source += 4) {
    data[pixel * 3] = Math.round(srgbByteToLinear(rgba[source]) * 65535);
    data[pixel * 3 + 1] = Math.round(srgbByteToLinear(rgba[source + 1]) * 65535);
    data[pixel * 3 + 2] = Math.round(srgbByteToLinear(rgba[source + 2]) * 65535);
  }
  return { width, height, data };
}

export function encodeRaw(image: RawImage, meta: { capturedAt: string }): Uint8Array {
  const header = {
    capturedAt: meta.capturedAt,
    width: image.width,
    height: image.height,
    colorSpace: "linear-srgb" as const,
    channels: 3 as const,
    bitDepth: 16 as const,
  };
  let json = new TextEncoder().encode(JSON.stringify(header));
  if ((json.length + 10) % 2 !== 0) {
    json = new TextEncoder().encode(`${JSON.stringify(header)} `);
  }
  const pixelBytes = image.data.length * 2;
  const out = new Uint8Array(10 + json.length + pixelBytes);
  out.set(new TextEncoder().encode(MAGIC), 0);
  const view = new DataView(out.buffer);
  view.setUint32(6, json.length, true);
  out.set(json, 10);
  const pixelStart = 10 + json.length;
  new Uint16Array(out.buffer, pixelStart, image.data.length).set(image.data);
  return out;
}

export function decodeRaw(bytes: Uint8Array): { image: RawImage; meta: RawMeta } {
  if (bytes.length < 10 || new TextDecoder().decode(bytes.subarray(0, 6)) !== MAGIC) {
    throw new Error("不是 FMRAW1 线性 RAW");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(6, true);
  const jsonStart = 10;
  const jsonEnd = jsonStart + jsonLength;
  if (jsonEnd > bytes.length) throw new Error("不是 FMRAW1 线性 RAW");
  const meta = JSON.parse(new TextDecoder().decode(bytes.subarray(jsonStart, jsonEnd))) as RawMeta;
  const pixelStart = jsonEnd;
  const count = meta.width * meta.height * 3;
  if (pixelStart + count * 2 > bytes.length) throw new Error("不是 FMRAW1 线性 RAW");
  const data = new Uint16Array(count);
  data.set(new Uint16Array(bytes.buffer, bytes.byteOffset + pixelStart, count));
  return {
    meta,
    image: { width: meta.width, height: meta.height, data },
  };
}
