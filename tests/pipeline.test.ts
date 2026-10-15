import { describe, expect, it } from "vitest";
import { CAMERAS } from "../src/data/cameras";
import { FILMS } from "../src/data/films";
import { bytesToBase64 } from "../src/lib/bitmap";
import { linearToSrgbByte, srgbByteToLinear } from "../src/lib/color";
import {
  applyCamera,
  applyFilm,
  floatToRgba,
  rawToFloat,
  type CameraProfile,
  type FilmProfile,
} from "../src/lib/develop";
import { decodeRaw, encodeRaw, rgba8ToRaw } from "../src/lib/raw";

const neutralCamera: CameraProfile = {
  exposure: 1,
  vignette: 0,
  contrast: 1,
  softness: 0,
  sharpness: 0,
  glare: 0,
  aspect: 2,
};

const neutralFilm: FilmProfile = {
  matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  contrast: 1,
  toe: 0,
  shoulder: 0,
  saturation: 1,
  grain: 0,
  grainSize: 1,
  halation: 0,
  shadowTint: [0, 0, 0],
  highlightTint: [0, 0, 0],
  monochrome: false,
  monoWarmth: 0,
};

function solidLinear(width: number, height: number, rgb: [number, number, number]) {
  const data = new Uint16Array(width * height * 3);
  const values = rgb.map((channel) => Math.round(channel * 65535));
  for (let i = 0; i < width * height; i++) {
    data[i * 3] = values[0];
    data[i * 3 + 1] = values[1];
    data[i * 3 + 2] = values[2];
  }
  return { width, height, data };
}

function chart() {
  const colors: [number, number, number][] = [
    [0.02, 0.02, 0.02],
    [0.18, 0.18, 0.18],
    [0.55, 0.55, 0.55],
    [0.92, 0.92, 0.92],
    [0.72, 0.28, 0.16],
    [0.75, 0.08, 0.06],
    [0.1, 0.48, 0.14],
    [0.08, 0.16, 0.62],
  ];
  const block = 4;
  const width = colors.length * block;
  const height = block * 2;
  const data = new Uint16Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const color = colors[Math.floor(x / block) % colors.length];
      const i = (y * width + x) * 3;
      data[i] = Math.round(color[0] * 65535);
      data[i + 1] = Math.round(color[1] * 65535);
      data[i + 2] = Math.round(color[2] * 65535);
    }
  }
  return { width, height, data };
}

function pixel(rgba: Uint8ClampedArray, width: number, x: number, y: number) {
  const i = (y * width + x) * 4;
  return { r: rgba[i], g: rgba[i + 1], b: rgba[i + 2] };
}

function meanAbsDiff(a: Uint8ClampedArray, b: Uint8ClampedArray) {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < a.length; i += 4) {
    sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    count += 3;
  }
  return sum / count;
}

function developChart(filmId: string) {
  const film = FILMS.find((item) => item.id === filmId);
  if (!film) throw new Error(filmId);
  const raw = chart();
  const optics = applyCamera(rawToFloat(raw), neutralCamera, 0);
  return applyFilm(optics, film.profile, { grain: false, seed: 1 });
}

describe("files", () => {
  it("encodes bytes as base64 for the Android share sheet", () => {
    expect(bytesToBase64(new Uint8Array([72, 105]))).toBe(btoa("Hi"));
    const bytes = new Uint8Array(40000);
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = index % 251;
    const decoded = Uint8Array.from(atob(bytesToBase64(bytes)), (char) => char.charCodeAt(0));
    expect(Array.from(decoded)).toEqual(Array.from(bytes));
  });
});

describe("color", () => {
  it("converts sRGB bytes to linear light and back", () => {
    expect(srgbByteToLinear(0)).toBe(0);
    expect(srgbByteToLinear(255)).toBeCloseTo(1, 5);
    expect(srgbByteToLinear(128)).toBeCloseTo(0.21586, 4);
    expect(linearToSrgbByte(0)).toBe(0);
    expect(linearToSrgbByte(1)).toBe(255);
    expect(linearToSrgbByte(srgbByteToLinear(118))).toBe(118);
  });
});

describe("raw", () => {
  it("stores neutral linear RGB and round-trips without a look", () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 128, 255]);
    const raw = rgba8ToRaw(rgba, 2, 1);
    expect(raw.data[0]).toBe(65535);
    expect(raw.data[1]).toBe(0);
    expect(raw.data[3]).toBe(0);
    expect(raw.data[4]).toBe(65535);
    const original = raw.data.slice();
    const bytes = encodeRaw(raw, { capturedAt: "2026-10-15T00:00:00.000Z" });
    expect(new TextDecoder().decode(bytes.subarray(0, 6))).toBe("FMRAW1");
    const decoded = decodeRaw(bytes);
    expect(decoded.meta.colorSpace).toBe("linear-srgb");
    expect(decoded.meta.bitDepth).toBe(16);
    expect(decoded.meta.width).toBe(2);
    expect(decoded.meta.height).toBe(1);
    expect(Array.from(decoded.image.data)).toEqual(Array.from(original));
    expect(Array.from(raw.data)).toEqual(Array.from(original));
    expect(() => decodeRaw(new Uint8Array([1, 2, 3, 4]))).toThrow(/FMRAW1/);
  });
});

describe("develop", () => {
  it("keeps a neutral profile from changing a flat gray frame", () => {
    const raw = solidLinear(4, 2, [0.18, 0.18, 0.18]);
    const optics = applyCamera(rawToFloat(raw), neutralCamera, 0);
    const rgba = applyFilm(optics, neutralFilm, { grain: false });
    const sample = pixel(rgba, optics.width, 1, 0);
    const expected = linearToSrgbByte(0.18);
    expect(sample.r).toBeGreaterThanOrEqual(expected - 1);
    expect(sample.r).toBeLessThanOrEqual(expected + 1);
    expect(sample.g).toBe(sample.r);
    expect(sample.b).toBe(sample.r);
  });

  it("crops to the camera aspect during development, not inside the raw file", () => {
    const raw = solidLinear(60, 30, [0.4, 0.2, 0.1]);
    const bytes = encodeRaw(raw, { capturedAt: "2026-10-15T00:00:00.000Z" });
    const decoded = decodeRaw(bytes);
    expect(decoded.image.width).toBe(60);
    expect(decoded.image.height).toBe(30);
    const hassy = CAMERAS.find((camera) => camera.id === "hasselblad-500cm");
    if (!hassy) throw new Error("missing hasselblad");
    const framed = applyCamera(rawToFloat(decoded.image), hassy.profile, 0);
    expect(framed.width).toBe(framed.height);
    const pentax = CAMERAS.find((camera) => camera.id === "pentax-67");
    if (!pentax) throw new Error("missing pentax");
    const sixBySeven = applyCamera(rawToFloat(decoded.image), pentax.profile, 0);
    expect(sixBySeven.width / sixBySeven.height).toBeCloseTo(7 / 6, 2);
  });

  it("darkens corners for strong-vignette cameras and keeps the GR1 open", () => {
    const raw = solidLinear(21, 21, [0.45, 0.45, 0.45]);
    const square: CameraProfile = { ...neutralCamera, aspect: 1 };
    const mju = CAMERAS.find((camera) => camera.id === "olympus-mju-ii")!.profile;
    const gr = CAMERAS.find((camera) => camera.id === "ricoh-gr1")!.profile;
    const mjuImage = applyFilm(applyCamera(rawToFloat(raw), { ...mju, aspect: 1 }, 0), neutralFilm, {
      grain: false,
    });
    const grImage = applyFilm(applyCamera(rawToFloat(raw), { ...gr, aspect: 1 }, 0), neutralFilm, {
      grain: false,
    });
    const plain = applyFilm(applyCamera(rawToFloat(raw), square, 0), neutralFilm, { grain: false });
    const mjuCorner = pixel(mjuImage, 21, 0, 0).r;
    const mjuCenter = pixel(mjuImage, 21, 10, 10).r;
    const grCorner = pixel(grImage, 21, 0, 0).r;
    const grCenter = pixel(grImage, 21, 10, 10).r;
    expect(mjuCenter).toBeGreaterThan(mjuCorner + 18);
    expect(grCenter - grCorner).toBeLessThan(8);
    expect(mjuCorner).toBeLessThan(pixel(plain, 21, 0, 0).r - 10);
  });

  it("keeps the GR1 edge sharper than the Contax T2", () => {
    const width = 16;
    const height = 16;
    const data = new Uint16Array(width * height * 3);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const value = x < width / 2 ? 0 : 65535;
        const i = (y * width + x) * 3;
        data[i] = value;
        data[i + 1] = value;
        data[i + 2] = value;
      }
    }
    const raw = { width, height, data };
    const delta = (id: string) => {
      const camera = CAMERAS.find((item) => item.id === id)!;
      const optics = applyCamera(rawToFloat(raw), { ...camera.profile, aspect: 1, vignette: 0 }, 0);
      const rgba = applyFilm(optics, neutralFilm, { grain: false });
      const dark = pixel(rgba, optics.width, 6, 8).r;
      const bright = pixel(rgba, optics.width, 9, 8).r;
      return bright - dark;
    };
    expect(delta("ricoh-gr1")).toBeGreaterThan(delta("contax-t2") + 25);
  });

  it("gives each film a measurably different color response", () => {
    const renders = FILMS.map((film) => ({ id: film.id, rgba: developChart(film.id) }));
    for (let i = 0; i < renders.length; i++) {
      for (let j = i + 1; j < renders.length; j++) {
        const distance = meanAbsDiff(renders[i].rgba, renders[j].rgba);
        expect(distance, `${renders[i].id} vs ${renders[j].id}`).toBeGreaterThan(8);
      }
    }
  });

  it("matches the signature of the main stocks", () => {
    const gray = solidLinear(4, 2, [0.18, 0.18, 0.18]);
    const grade = (id: string) => {
      const film = FILMS.find((item) => item.id === id)!;
      const rgba = applyFilm(applyCamera(rawToFloat(gray), neutralCamera, 0), film.profile, {
        grain: false,
      });
      return pixel(rgba, 4, 1, 0);
    };
    const portra = grade("portra-400");
    const gold = grade("gold-200");
    const cinestill = grade("cinestill-800t");
    const trix = grade("tri-x-400");
    expect(portra.r).toBeGreaterThan(portra.b + 4);
    expect((gold.r + gold.g) / 2 - gold.b).toBeGreaterThan((portra.r + portra.g) / 2 - portra.b + 4);
    expect(cinestill.b).toBeGreaterThan(cinestill.r + 4);
    expect(Math.abs(trix.r - trix.g)).toBeLessThanOrEqual(2);
    expect(Math.abs(trix.g - trix.b)).toBeLessThanOrEqual(8);

    const red = solidLinear(4, 2, [0.7, 0.05, 0.04]);
    const redGrade = (id: string) => {
      const film = FILMS.find((item) => item.id === id)!;
      const rgba = applyFilm(applyCamera(rawToFloat(red), neutralCamera, 0), film.profile, {
        grain: false,
      });
      const sample = pixel(rgba, 4, 1, 0);
      return sample.r - Math.max(sample.g, sample.b);
    };
    expect(redGrade("velvia-50")).toBeGreaterThan(redGrade("portra-400") + 8);
  });

  it("bleeds red halation from highlights on Cinestill", () => {
    const width = 16;
    const height = 16;
    const data = new Uint16Array(width * height * 3);
    for (let y = 6; y <= 9; y++) {
      for (let x = 6; x <= 9; x++) {
        const i = (y * width + x) * 3;
        data[i] = 65535;
        data[i + 1] = 65535;
        data[i + 2] = 65535;
      }
    }
    const raw = rawToFloat({ width, height, data });
    const film = FILMS.find((item) => item.id === "cinestill-800t")!;
    const withHalo = applyFilm(applyCamera(raw, { ...neutralCamera, aspect: 1 }, 0), film.profile, {
      grain: false,
    });
    const without = applyFilm(
      applyCamera(raw, { ...neutralCamera, aspect: 1 }, 0),
      { ...film.profile, halation: 0 },
      { grain: false },
    );
    const halo = pixel(withHalo, width, 4, 8);
    const flat = pixel(without, width, 4, 8);
    expect(halo.r).toBeGreaterThan(flat.r + 8);
    expect(halo.r).toBeGreaterThan(halo.b);
  });
});

describe("catalog", () => {
  it("ships distinct camera bodies and film stocks", () => {
    expect(CAMERAS.length).toBeGreaterThanOrEqual(8);
    expect(FILMS.length).toBeGreaterThanOrEqual(8);
    expect(new Set(CAMERAS.map((camera) => camera.id)).size).toBe(CAMERAS.length);
    expect(new Set(FILMS.map((film) => film.id)).size).toBe(FILMS.length);
    expect(FILMS.filter((film) => film.profile.monochrome).map((film) => film.id).sort()).toEqual([
      "hp5-plus",
      "tri-x-400",
    ]);
    expect(CAMERAS.some((camera) => camera.profile.aspect === 1)).toBe(true);
    expect(CAMERAS.some((camera) => Math.abs(camera.profile.aspect - 1.5) < 0.001)).toBe(true);
    const preview = floatToRgba(rawToFloat(solidLinear(2, 2, [0.18, 0.18, 0.18])));
    expect(preview[0]).toBe(preview[1]);
    expect(preview[1]).toBe(preview[2]);
  });
});
