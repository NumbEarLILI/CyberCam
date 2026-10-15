/** Longest edge kept for a still. High enough to use a phone sensor, small enough to develop on the device. */
export const STILL_MAX_EDGE = 2560;

/** Ask the camera for its native 4:3 field instead of a 16:9 1080p crop. */
export const SENSOR_WIDTH = 3840;
export const SENSOR_HEIGHT = 2880;

export function framedProfile<T extends { aspect: number }>(profile: T, portrait: boolean | undefined): T {
  return { ...profile, aspect: orientedAspect(profile.aspect, Boolean(portrait)) };
}

export function orientedAspect(aspect: number, portrait: boolean) {
  if (!(aspect > 0)) return 1;
  if (portrait && aspect > 1) return 1 / aspect;
  if (!portrait && aspect < 1) return 1 / aspect;
  return aspect;
}

export function frameSize(availableWidth: number, availableHeight: number, aspect: number) {
  const width = Math.max(0, availableWidth);
  const height = Math.max(0, availableHeight);
  if (width < 2 || height < 2 || !(aspect > 0)) return { width: 0, height: 0 };
  const byHeight = height * aspect;
  if (byHeight <= width) return { width: byHeight, height };
  return { width, height: width / aspect };
}

export function sensorConstraints(deviceId: string | null): MediaTrackConstraints {
  const size = { width: { ideal: SENSOR_WIDTH }, height: { ideal: SENSOR_HEIGHT } };
  if (deviceId) return { ...size, deviceId: { exact: deviceId } };
  return { ...size, facingMode: { ideal: "environment" } };
}
