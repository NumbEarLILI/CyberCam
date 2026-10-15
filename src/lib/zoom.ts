export const ZOOM_MIN = 1;
export const ZOOM_MAX = 4;

export function clampZoom(value: number) {
  const clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, value));
  return Math.round(clamped * 10) / 10;
}

export function stepZoom(value: number, direction: 1 | -1) {
  return clampZoom(direction > 0 ? value * 1.25 : value / 1.25);
}

/** Center crop of the source, in source pixels. Zoom 1 returns the full frame. */
export function zoomSourceRect(width: number, height: number, zoom: number) {
  const scale = clampZoom(zoom);
  const cropWidth = width / scale;
  const cropHeight = height / scale;
  return {
    x: (width - cropWidth) / 2,
    y: (height - cropHeight) / 2,
    width: cropWidth,
    height: cropHeight,
  };
}

/** Shrink the cover crop so the finder matches zoomSourceRect, then the camera aspect. */
export function zoomedCover(cover: [number, number], zoom: number): [number, number] {
  const scale = clampZoom(zoom);
  return [cover[0] / scale, cover[1] / scale];
}

export function formatZoom(value: number) {
  return `${clampZoom(value).toFixed(1)}×`;
}
