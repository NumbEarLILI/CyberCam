import { linearToSrgbByte } from "./color";

export type FloatImage = {
  width: number;
  height: number;
  data: Float32Array;
};

export type CameraProfile = {
  exposure: number;
  vignette: number;
  contrast: number;
  softness: number;
  sharpness: number;
  glare: number;
  aspect: number;
};

export type FilmProfile = {
  matrix: number[];
  contrast: number;
  toe: number;
  shoulder: number;
  saturation: number;
  grain: number;
  grainSize: number;
  halation: number;
  shadowTint: [number, number, number];
  highlightTint: [number, number, number];
  monochrome: boolean;
  monoWarmth: number;
};

export type DevelopOptions = {
  grain?: boolean;
  seed?: number;
  /** Multiplier for the film's grain. 1 is the stock. Higher ISO pushes it up. */
  grainScale?: number;
};

const PIVOT = 0.18;

export function rawToFloat(image: { width: number; height: number; data: Uint16Array }): FloatImage {
  const data = new Float32Array(image.data.length);
  for (let i = 0; i < image.data.length; i += 1) data[i] = image.data[i] / 65535;
  return { width: image.width, height: image.height, data };
}

export function floatToRgba(image: FloatImage): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(image.width * image.height * 4);
  for (let pixel = 0, index = 0; pixel < image.width * image.height; pixel += 1, index += 3) {
    rgba[pixel * 4] = linearToSrgbByte(image.data[index]);
    rgba[pixel * 4 + 1] = linearToSrgbByte(image.data[index + 1]);
    rgba[pixel * 4 + 2] = linearToSrgbByte(image.data[index + 2]);
    rgba[pixel * 4 + 3] = 255;
  }
  return rgba;
}

export function applyCamera(image: FloatImage, camera: CameraProfile, ev = 0): FloatImage {
  const framed = cropToAspect(image, camera.aspect);
  const { width, height } = framed;
  let data = new Float32Array(framed.data.length);
  const gain = camera.exposure * 2 ** ev;
  for (let i = 0; i < framed.data.length; i += 1) {
    const exposed = Math.max(0, framed.data[i] * gain);
    data[i] = PIVOT * (exposed / PIVOT) ** camera.contrast;
  }

  if (camera.sharpness > 0) {
    const blurred = boxBlurRGB(data, width, height, 1);
    const sharp = new Float32Array(data.length);
    for (let i = 0; i < data.length; i += 1) {
      sharp[i] = data[i] + camera.sharpness * (data[i] - blurred[i]);
    }
    data = sharp;
  }

  if (camera.softness > 0) {
    const blurred = boxBlurRGB(data, width, height, 2);
    for (let i = 0; i < data.length; i += 1) {
      data[i] = data[i] * (1 - camera.softness) + blurred[i] * camera.softness;
    }
  }

  if (camera.glare > 0) {
    const radius = Math.max(2, Math.round(Math.min(width, height) * 0.05));
    const blurred = boxBlurRGB(data, width, height, radius);
    for (let i = 0; i < data.length; i += 3) {
      const luma = 0.2126 * blurred[i] + 0.7152 * blurred[i + 1] + 0.0722 * blurred[i + 2];
      const lift = luma * camera.glare;
      data[i] += lift;
      data[i + 1] += lift;
      data[i + 2] += lift;
    }
  }

  if (camera.vignette > 0) {
    for (let y = 0; y < height; y += 1) {
      const ny = ((y + 0.5) / height - 0.5) * 2;
      for (let x = 0; x < width; x += 1) {
        const nx = ((x + 0.5) / width - 0.5) * 2;
        const falloff = Math.min(1, Math.hypot(nx, ny) / Math.SQRT2) ** 1.65;
        const mask = 1 - camera.vignette * falloff;
        const index = (y * width + x) * 3;
        data[index] *= mask;
        data[index + 1] *= mask;
        data[index + 2] *= mask;
      }
    }
  }

  return { width, height, data };
}

export function applyFilm(image: FloatImage, film: FilmProfile, options: DevelopOptions = {}): Uint8ClampedArray {
  const { width, height } = image;
  const rgb = new Float32Array(image.data.length);
  const matrix = film.matrix;
  for (let i = 0; i < image.data.length; i += 3) {
    const r = image.data[i];
    const g = image.data[i + 1];
    const b = image.data[i + 2];
    let nr = matrix[0] * r + matrix[1] * g + matrix[2] * b;
    let ng = matrix[3] * r + matrix[4] * g + matrix[5] * b;
    let nb = matrix[6] * r + matrix[7] * g + matrix[8] * b;
    nr = tone(nr, film);
    ng = tone(ng, film);
    nb = tone(nb, film);
    if (film.monochrome) {
      const y = Math.max(0, 0.2126 * nr + 0.7152 * ng + 0.0722 * nb);
      nr = y * (1 + 0.015 * film.monoWarmth);
      ng = y;
      nb = y * (1 - 0.1 * film.monoWarmth);
    } else {
      const y = 0.2126 * nr + 0.7152 * ng + 0.0722 * nb;
      const shadow = Math.min(1, Math.max(0, 1 - y));
      const high = Math.min(1, Math.max(0, y));
      nr += film.shadowTint[0] * shadow + film.highlightTint[0] * high;
      ng += film.shadowTint[1] * shadow + film.highlightTint[1] * high;
      nb += film.shadowTint[2] * shadow + film.highlightTint[2] * high;
      const luma = 0.2126 * nr + 0.7152 * ng + 0.0722 * nb;
      nr = luma + (nr - luma) * film.saturation;
      ng = luma + (ng - luma) * film.saturation;
      nb = luma + (nb - luma) * film.saturation;
    }
    rgb[i] = nr;
    rgb[i + 1] = ng;
    rgb[i + 2] = nb;
  }

  if (film.halation > 0) {
    const mask = new Float32Array(width * height);
    for (let pixel = 0, index = 0; pixel < width * height; pixel += 1, index += 3) {
      const luma = Math.max(0, 0.2126 * rgb[index] + 0.7152 * rgb[index + 1] + 0.0722 * rgb[index + 2]);
      const t = Math.min(1, Math.max(0, (luma - 0.58) / 0.5));
      mask[pixel] = t * t * (3 - 2 * t);
    }
    const radius = Math.max(3, Math.round(Math.min(width, height) * 0.085));
    const blurred = boxBlur1(mask, width, height, radius);
    for (let pixel = 0, index = 0; pixel < width * height; pixel += 1, index += 3) {
      const glow = blurred[pixel] * film.halation;
      rgb[index] += glow * 1.25;
      rgb[index + 1] += glow * 0.2;
      rgb[index + 2] += glow * 0.05;
    }
  }

  if (options.grain !== false && film.grain > 0) {
    const seed = options.seed ?? 1;
    const size = Math.max(1, film.grainSize);
    for (let y = 0; y < height; y += 1) {
      const gy = Math.floor(y / size);
      for (let x = 0; x < width; x += 1) {
        const gx = Math.floor(x / size);
        const n = hash01(gx, gy, seed) - 0.5;
        const n2 = hash01(gx, gy, seed + 17) - 0.5;
        const index = (y * width + x) * 3;
        const luma = Math.max(0, 0.2126 * rgb[index] + 0.7152 * rgb[index + 1] + 0.0722 * rgb[index + 2]);
        const weight = 0.4 + 0.6 * Math.sin(Math.min(luma, 1) * Math.PI);
        const amp = film.grain * 0.2 * weight * (options.grainScale ?? 1);
        if (film.monochrome) {
          rgb[index] += n * amp;
          rgb[index + 1] += n * amp;
          rgb[index + 2] += n * amp;
        } else {
          rgb[index] += n * amp;
          rgb[index + 1] += (n * 0.65 + n2 * 0.35) * amp;
          rgb[index + 2] += n2 * amp;
        }
      }
    }
  }

  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let pixel = 0, index = 0; pixel < width * height; pixel += 1, index += 3) {
    rgba[pixel * 4] = linearToSrgbByte(rgb[index]);
    rgba[pixel * 4 + 1] = linearToSrgbByte(rgb[index + 1]);
    rgba[pixel * 4 + 2] = linearToSrgbByte(rgb[index + 2]);
    rgba[pixel * 4 + 3] = 255;
  }
  return rgba;
}

function tone(x: number, film: FilmProfile) {
  const raised = x <= 0 ? 0 : PIVOT * (x / PIVOT) ** film.contrast;
  const compressed =
    film.shoulder > 0 ? raised / (1 + film.shoulder * Math.max(0, raised - 0.45)) : raised;
  return compressed * (1 - film.toe) + film.toe;
}

function cropToAspect(image: FloatImage, aspect: number): FloatImage {
  const current = image.width / image.height;
  if (Math.abs(current - aspect) < 0.001) return image;
  if (current > aspect) {
    const width = Math.min(image.width, Math.max(1, Math.round(image.height * aspect)));
    const x0 = Math.floor((image.width - width) / 2);
    const data = new Float32Array(width * image.height * 3);
    for (let y = 0; y < image.height; y += 1) {
      const source = (y * image.width + x0) * 3;
      data.set(image.data.subarray(source, source + width * 3), y * width * 3);
    }
    return { width, height: image.height, data };
  }
  const height = Math.min(image.height, Math.max(1, Math.round(image.width / aspect)));
  const y0 = Math.floor((image.height - height) / 2);
  const data = new Float32Array(image.width * height * 3);
  data.set(image.data.subarray(y0 * image.width * 3, (y0 + height) * image.width * 3));
  return { width: image.width, height, data };
}

function boxBlurRGB(src: Float32Array, width: number, height: number, radius: number) {
  if (radius < 1) return src;
  const tmp = new Float32Array(src.length);
  const dst = new Float32Array(src.length);
  const windowSize = radius * 2 + 1;
  for (let y = 0; y < height; y += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      let sum = 0;
      for (let k = -radius; k <= radius; k += 1) {
        const x = clamp(k, 0, width - 1);
        sum += src[(y * width + x) * 3 + channel];
      }
      for (let x = 0; x < width; x += 1) {
        tmp[(y * width + x) * 3 + channel] = sum / windowSize;
        sum -= src[(y * width + clamp(x - radius, 0, width - 1)) * 3 + channel];
        sum += src[(y * width + clamp(x + radius + 1, 0, width - 1)) * 3 + channel];
      }
    }
  }
  for (let x = 0; x < width; x += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      let sum = 0;
      for (let k = -radius; k <= radius; k += 1) {
        const y = clamp(k, 0, height - 1);
        sum += tmp[(y * width + x) * 3 + channel];
      }
      for (let y = 0; y < height; y += 1) {
        dst[(y * width + x) * 3 + channel] = sum / windowSize;
        sum -= tmp[(clamp(y - radius, 0, height - 1) * width + x) * 3 + channel];
        sum += tmp[(clamp(y + radius + 1, 0, height - 1) * width + x) * 3 + channel];
      }
    }
  }
  return dst;
}

function boxBlur1(src: Float32Array, width: number, height: number, radius: number) {
  const tmp = new Float32Array(src.length);
  const dst = new Float32Array(src.length);
  const windowSize = radius * 2 + 1;
  for (let y = 0; y < height; y += 1) {
    let sum = 0;
    for (let k = -radius; k <= radius; k += 1) sum += src[y * width + clamp(k, 0, width - 1)];
    for (let x = 0; x < width; x += 1) {
      tmp[y * width + x] = sum / windowSize;
      sum -= src[y * width + clamp(x - radius, 0, width - 1)];
      sum += src[y * width + clamp(x + radius + 1, 0, width - 1)];
    }
  }
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let k = -radius; k <= radius; k += 1) sum += tmp[clamp(k, 0, height - 1) * width + x];
    for (let y = 0; y < height; y += 1) {
      dst[y * width + x] = sum / windowSize;
      sum -= tmp[clamp(y - radius, 0, height - 1) * width + x];
      sum += tmp[clamp(y + radius + 1, 0, height - 1) * width + x];
    }
  }
  return dst;
}

function hash01(x: number, y: number, seed: number) {
  let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function clamp(value: number, min: number, max: number) {
  return value < min ? min : value > max ? max : value;
}
