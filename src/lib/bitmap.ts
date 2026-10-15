import { zoomSourceRect } from "./zoom";

export function fitSize(width: number, height: number, maxEdge: number) {
  const edge = Math.max(width, height);
  if (edge <= maxEdge) return { width: Math.max(1, width), height: Math.max(1, height) };
  const scale = maxEdge / edge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function readSource(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  mirror: boolean,
  maxEdge: number,
  zoom = 1,
): ImageData {
  const rect = zoomSourceRect(sourceWidth, sourceHeight, zoom);
  const size = fitSize(rect.width, rect.height, maxEdge);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("无法读取画面");
  if (mirror) {
    ctx.translate(size.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(source, rect.x, rect.y, rect.width, rect.height, 0, 0, size.width, size.height);
  return ctx.getImageData(0, 0, size.width, size.height);
}

/** Clockwise quarter-turns. Quarter 0 returns the same buffer. */
export function rotateRgba(rgba: Uint8ClampedArray, width: number, height: number, quarters: number) {
  const turns = ((quarters % 4) + 4) % 4;
  if (turns === 0) return { data: rgba, width, height };
  const nextWidth = turns % 2 === 0 ? width : height;
  const nextHeight = turns % 2 === 0 ? height : width;
  const out = new Uint8ClampedArray(nextWidth * nextHeight * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let nx = x;
      let ny = y;
      if (turns === 1) {
        nx = height - 1 - y;
        ny = x;
      } else if (turns === 2) {
        nx = width - 1 - x;
        ny = height - 1 - y;
      } else {
        nx = y;
        ny = width - 1 - x;
      }
      const from = (y * width + x) * 4;
      const to = (ny * nextWidth + nx) * 4;
      out[to] = rgba[from];
      out[to + 1] = rgba[from + 1];
      out[to + 2] = rgba[from + 2];
      out[to + 3] = rgba[from + 3];
    }
  }
  return { data: out, width: nextWidth, height: nextHeight };
}

export function toImageData(rgba: Uint8ClampedArray, width: number, height: number) {
  const buffer = new ArrayBuffer(rgba.byteLength);
  new Uint8ClampedArray(buffer).set(rgba);
  return new ImageData(new Uint8ClampedArray(buffer), width, height);
}

export function copyBytes(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export function rgbaToBlob(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  type: "image/jpeg" | "image/png" = "image/jpeg",
  quality = 0.92,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("无法导出图像"));
  ctx.putImageData(toImageData(rgba, width, height), 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error("无法导出图像"));
      else resolve(blob);
    }, type, quality);
  });
}

export function bytesToBase64(bytes: Uint8Array) {
  const chunkSize = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

export async function downloadBuffer(buffer: ArrayBuffer, filename: string, type: string) {
  const { Capacitor } = await import("@capacitor/core");
  if (Capacitor.isNativePlatform()) {
    const { Directory, Filesystem } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    const safeName = filename.replace(/[^\w.\-]+/g, "_");
    await Filesystem.writeFile({
      path: safeName,
      data: bytesToBase64(new Uint8Array(buffer)),
      directory: Directory.Cache,
    });
    const { uri } = await Filesystem.getUri({ path: safeName, directory: Directory.Cache });
    try {
      await Share.share({ title: safeName, files: [uri], dialogTitle: "保存文件" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!/cancel/i.test(message)) throw error;
    }
    return;
  }

  const url = URL.createObjectURL(new Blob([buffer], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
