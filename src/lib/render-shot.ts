import { getCamera } from "../data/cameras";
import { getFilm } from "../data/films";
import { rotateRgba } from "./bitmap";
import { applyCamera, applyFilm, floatToRgba, rawToFloat } from "./develop";
import { isoGrainScale, recipeEv } from "./exposure";
import { framedProfile } from "./frame";
import { decodeRaw } from "./raw";

export type DevelopSource = {
  seed: number;
  portrait?: boolean;
  turn?: number;
};

export type DevelopRecipe = {
  cameraId: string;
  filmId: string;
  ev: number;
  iso?: number;
  shutter?: number;
  aperture?: number;
};

export type RgbaImage = { data: Uint8ClampedArray; width: number; height: number };

export function renderFilmImage(raw: ArrayBuffer, source: DevelopSource, recipe: DevelopRecipe): RgbaImage {
  const camera = getCamera(recipe.cameraId);
  const film = getFilm(recipe.filmId);
  const decoded = decodeRaw(new Uint8Array(raw));
  const optics = applyCamera(
    rawToFloat(decoded.image),
    framedProfile(camera.profile, source.portrait),
    recipeEv(recipe.ev, film.iso, recipe),
  );
  const rgba = applyFilm(optics, film.profile, {
    seed: source.seed,
    grainScale: recipe.iso == null ? 1 : isoGrainScale(recipe.iso, film.iso),
  });
  return rotateRgba(rgba, optics.width, optics.height, source.turn ?? 0);
}

export function renderRawImage(raw: ArrayBuffer, source: DevelopSource): RgbaImage {
  const decoded = decodeRaw(new Uint8Array(raw));
  return rotateRgba(floatToRgba(rawToFloat(decoded.image)), decoded.image.width, decoded.image.height, source.turn ?? 0);
}

export function renderOpticsImage(raw: ArrayBuffer, source: DevelopSource, recipe: DevelopRecipe): RgbaImage {
  const camera = getCamera(recipe.cameraId);
  const film = getFilm(recipe.filmId);
  const decoded = decodeRaw(new Uint8Array(raw));
  const optics = applyCamera(
    rawToFloat(decoded.image),
    framedProfile(camera.profile, source.portrait),
    recipeEv(recipe.ev, film.iso, recipe),
  );
  return rotateRgba(floatToRgba(optics), optics.width, optics.height, source.turn ?? 0);
}
