import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import type { HardwareCamera, HardwareFacing } from "./lenses";
import { decodeBase64 } from "./native-frames";

type DeviceCamerasPlugin = {
  list(): Promise<{ cameras: HardwareCamera[] }>;
  start(options: { id: string }): Promise<void>;
  stop(): Promise<void>;
  capture(): Promise<{ jpeg: string }>;
  addListener(eventName: "frame", listener: (event: { jpeg: string; rotation?: number }) => void): Promise<PluginListenerHandle>;
  addListener(eventName: "orientation", listener: (event: { orientation: number }) => void): Promise<PluginListenerHandle>;
};

const DeviceCameras = registerPlugin<DeviceCamerasPlugin>("DeviceCameras");

export function nativeCamerasSupported() {
  return Capacitor.isNativePlatform();
}

export async function listHardwareCameras() {
  const result = await DeviceCameras.list();
  return (result.cameras ?? []).filter((camera) => isFacing(camera.facing) && camera.id);
}

export function startHardwareCamera(id: string) {
  return DeviceCameras.start({ id });
}

export function stopHardwareCamera() {
  return DeviceCameras.stop().catch(() => undefined);
}

export function captureHardwareStill() {
  return DeviceCameras.capture().then((result) => result.jpeg);
}

export type HardwareFrame = { jpeg: string; rotation: number };

export function onHardwareFrame(listener: (frame: HardwareFrame) => void) {
  return DeviceCameras.addListener("frame", (event) => {
    if (event.jpeg) listener({ jpeg: event.jpeg, rotation: Number(event.rotation) || 0 });
  });
}

export function onHardwareOrientation(listener: (orientation: number) => void) {
  return DeviceCameras.addListener("orientation", (event) => {
    if (Number.isFinite(event.orientation)) listener(event.orientation);
  });
}

/** Draws a camera JPEG upright. Preview frames arrive in sensor orientation and carry a clockwise rotation. */
export async function drawHardwareFrame(
  canvas: HTMLCanvasElement | null,
  jpeg: string,
  rotation = 0,
  shouldDraw: () => boolean = () => true,
) {
  if (!canvas || !jpeg) return false;
  const bitmap = await createImageBitmap(new Blob([decodeBase64(jpeg) as BlobPart], { type: "image/jpeg" }));
  try {
    if (!shouldDraw()) return false;
    const turn = ((Math.round(rotation / 90) % 4) + 4) % 4;
    const width = turn % 2 ? bitmap.height : bitmap.width;
    const height = turn % 2 ? bitmap.width : bitmap.height;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    if (turn === 0) {
      ctx.drawImage(bitmap, 0, 0);
    } else {
      ctx.save();
      ctx.translate(width / 2, height / 2);
      ctx.rotate((turn * Math.PI) / 2);
      ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
      ctx.restore();
    }
    return true;
  } finally {
    bitmap.close();
  }
}

function isFacing(value: string): value is HardwareFacing {
  return value === "back" || value === "front" || value === "external";
}
