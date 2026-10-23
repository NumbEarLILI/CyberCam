import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import type { HardwareCamera, HardwareFacing } from "./lenses";

type DeviceCamerasPlugin = {
  list(): Promise<{ cameras: HardwareCamera[] }>;
  start(options: { id: string }): Promise<void>;
  stop(): Promise<void>;
  capture(): Promise<{ jpeg: string }>;
  addListener(eventName: "frame", listener: (event: { jpeg: string }) => void): Promise<PluginListenerHandle>;
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

export function onHardwareFrame(listener: (jpeg: string) => void) {
  return DeviceCameras.addListener("frame", (event) => {
    if (event.jpeg) listener(event.jpeg);
  });
}

export function onHardwareOrientation(listener: (orientation: number) => void) {
  return DeviceCameras.addListener("orientation", (event) => {
    if (Number.isFinite(event.orientation)) listener(event.orientation);
  });
}

export async function drawHardwareFrame(canvas: HTMLCanvasElement | null, jpeg: string) {
  if (!canvas || !jpeg) return;
  const bytes = Uint8Array.from(atob(jpeg), (char) => char.charCodeAt(0));
  const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/jpeg" }));
  try {
    if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
    }
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
  } finally {
    bitmap.close();
  }
}

function isFacing(value: string): value is HardwareFacing {
  return value === "back" || value === "front" || value === "external";
}
