/** Full-stop ISO ladder, plus 160 so a 160 film can sit on its box speed. */
export const ISO_VALUES = [50, 100, 160, 200, 400, 800, 1600, 3200, 6400] as const;

export const SHUTTER_VALUES = [
  { seconds: 1, label: "1s" },
  { seconds: 1 / 2, label: "1/2" },
  { seconds: 1 / 4, label: "1/4" },
  { seconds: 1 / 8, label: "1/8" },
  { seconds: 1 / 15, label: "1/15" },
  { seconds: 1 / 30, label: "1/30" },
  { seconds: 1 / 60, label: "1/60" },
  { seconds: 1 / 125, label: "1/125" },
  { seconds: 1 / 250, label: "1/250" },
  { seconds: 1 / 500, label: "1/500" },
  { seconds: 1 / 1000, label: "1/1000" },
  { seconds: 1 / 2000, label: "1/2000" },
] as const;

export const APERTURE_VALUES = [1.4, 2, 2.8, 4, 5.6, 8, 11, 16] as const;

/** Neutral point: these dials add zero stops on top of exposure compensation. */
export const BASE_SHUTTER = 1 / 125;
export const BASE_APERTURE = 4;

export function formatShutter(seconds: number) {
  return nearest(SHUTTER_VALUES, seconds, (item) => item.seconds).label;
}

export function formatAperture(value: number) {
  const matched = nearest([...APERTURE_VALUES], value, (item) => item);
  return `f/${Number.isInteger(matched) ? matched : matched.toFixed(1)}`;
}

export function stepIso(iso: number, delta: number) {
  return step(ISO_VALUES, iso, delta, (item) => item);
}

export function stepShutter(seconds: number, delta: number) {
  return step(SHUTTER_VALUES, seconds, delta, (item) => item.seconds).seconds;
}

export function stepAperture(value: number, delta: number) {
  return step(APERTURE_VALUES, value, delta, (item) => item);
}

/**
 * Stops added by the dials. Higher ISO, a slower shutter, or a wider aperture
 * makes the frame brighter. Each shutter or aperture click is one stop.
 * The ISO term is relative to the loaded film's box speed.
 */
export function exposureStops(iso: number, boxIso: number, shutterSeconds: number, aperture: number) {
  const isoStops = Math.log2(iso / boxIso);
  const shutterStops = indexOf(SHUTTER_VALUES, BASE_SHUTTER, (item) => item.seconds) - indexOf(SHUTTER_VALUES, shutterSeconds, (item) => item.seconds);
  const apertureStops = indexOf(APERTURE_VALUES, BASE_APERTURE, (item) => item) - indexOf(APERTURE_VALUES, aperture, (item) => item);
  return isoStops + shutterStops + apertureStops;
}

/** Extra grain when the dial is faster than the film's box speed. */
export function isoGrainScale(iso: number, boxIso: number) {
  return Math.sqrt(Math.max(1, iso / boxIso));
}

export function recipeEv(
  compensation: number,
  boxIso: number,
  dials: { iso?: number; shutter?: number; aperture?: number },
) {
  if (dials.iso == null || dials.shutter == null || dials.aperture == null) return compensation;
  return compensation + exposureStops(dials.iso, boxIso, dials.shutter, dials.aperture);
}

function step<T>(values: readonly T[], current: number, delta: number, key: (item: T) => number) {
  const index = indexOf(values, current, key);
  const next = Math.max(0, Math.min(values.length - 1, index + delta));
  return values[next];
}

function indexOf<T>(values: readonly T[], current: number, key: (item: T) => number) {
  let best = 0;
  let bestDistance = Infinity;
  values.forEach((item, index) => {
    const distance = Math.abs(Math.log(key(item)) - Math.log(current));
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

function nearest<T>(values: readonly T[], current: number, key: (item: T) => number) {
  return values[indexOf(values, current, key)];
}
