export type Hold = "portrait" | "left" | "right" | "upside";

/** Android OrientationEventListener: 0 portrait, 90 left side up, 180 upside down, 270 right side up. */
export function holdFromOrientation(degrees: number): Hold {
  const normalized = ((degrees % 360) + 360) % 360;
  const quarter = Math.round(normalized / 90) % 4;
  if (quarter === 1) return "left";
  if (quarter === 2) return "upside";
  if (quarter === 3) return "right";
  return "portrait";
}

/**
 * Physical tilt from DeviceOrientationEvent.
 * Flat on a table returns null so the last upright hold stays put.
 * gamma > 0 means the right side is down, which is the left side up.
 */
export function holdFromTilt(beta: number | null, gamma: number | null): Hold | null {
  if (beta == null || gamma == null || !Number.isFinite(beta) || !Number.isFinite(gamma)) return null;
  const absBeta = Math.abs(beta);
  const absGamma = Math.abs(gamma);
  if (absBeta < 25 && absGamma < 25) return null;
  if (absGamma >= 45 && absBeta <= 40) return gamma > 0 ? "left" : "right";
  if (beta >= 150 || beta <= -40) return "upside";
  if (beta >= 40 && beta <= 140) return "portrait";
  return null;
}

/** The page itself only counter-rotates labels when the viewport stayed portrait. */
export function visibleHold(device: Hold, viewportPortrait: boolean): Hold {
  return viewportPortrait ? device : "portrait";
}

/**
 * Clockwise quarter-turns that put world-up at the top of a saved still.
 * The live viewfinder is already upright for the person holding the phone,
 * because the preview is glued to the portrait screen. The file is not.
 */
export function stillQuarter(hold: Hold): 0 | 1 | 2 | 3 {
  if (hold === "left") return 1;
  if (hold === "upside") return 2;
  if (hold === "right") return 3;
  return 0;
}
