import { useEffect, useRef, useState } from "react";
import { CAMERAS, getCamera } from "../data/cameras";
import { FILMS, getFilm } from "../data/films";
import { downloadBuffer, formatBytes } from "../lib/bitmap";
import { createDevelopPort } from "../lib/develop-port";
import { saveShot, type Shot } from "../lib/db";
import { ExposureDials } from "./Dials";
import { formatAperture, formatShutter, stepAperture, stepIso, stepShutter } from "../lib/exposure";
import type { DevelopRecipe, DevelopSource } from "../lib/render-shot";
import { CameraArt, FilmArt } from "./art";

type Stage = "raw" | "optics" | "film";

type Props = {
  shot: Shot;
  onClose: () => void;
  onUpdate: (shot: Shot) => void;
  onDelete: (id: string) => void;
};

const FADE_MS = 560;

export function Review({ shot, onClose, onUpdate, onDelete }: Props) {
  const [stage, setStage] = useState<Stage>("film");
  const [recipe, setRecipe] = useState<DevelopRecipe>(() => recipeFrom(shot));
  const [developing, setDeveloping] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(() => URL.createObjectURL(new Blob([shot.jpeg], { type: "image/jpeg" })));
  const [nextUrl, setNextUrl] = useState<string | null>(null);
  const [stageUrl, setStageUrl] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pixels, setPixels] = useState("");
  const shotRef = useRef(shot);
  const recipeRef = useRef(recipe);
  const onUpdateRef = useRef(onUpdate);
  const previews = useRef<{ raw?: string; optics?: string; opticsKey?: string }>({});
  const filmPort = useRef(createDevelopPort());
  const stagePort = useRef(createDevelopPort());
  const stageRef = useRef(stage);
  const shownRef = useRef({ current: "", next: null as string | null });
  stageRef.current = stage;
  shownRef.current = { current: currentUrl, next: nextUrl };
  shotRef.current = shot;
  recipeRef.current = recipe;
  onUpdateRef.current = onUpdate;

  const camera = getCamera(recipe.cameraId);
  const film = getFilm(recipe.filmId);
  const savedCamera = getCamera(shot.cameraId);
  const savedFilm = getFilm(shot.filmId);
  const wanted = recipeKey(recipe);
  const saved = recipeKey(recipeFrom(shot));

  useEffect(() => {
    const filmJob = filmPort.current;
    const stageJob = stagePort.current;
    return () => {
      filmJob.dispose();
      stageJob.dispose();
      const cached = previews.current;
      if (cached.raw) URL.revokeObjectURL(cached.raw);
      if (cached.optics) URL.revokeObjectURL(cached.optics);
      if (shownRef.current.current) URL.revokeObjectURL(shownRef.current.current);
      if (shownRef.current.next) URL.revokeObjectURL(shownRef.current.next);
    };
  }, []);

  useEffect(() => {
    if (wanted === saved) return;
    setDeveloping(true);
    setStage("film");
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const source = sourceFrom(shotRef.current);
      const nextRecipe = recipeRef.current;
      void filmPort.current
        .run("film", shotRef.current.raw, source, nextRecipe, controller.signal)
        .then(async (jpeg) => {
          if (controller.signal.aborted) return;
          const url = URL.createObjectURL(new Blob([jpeg], { type: "image/jpeg" }));
          const nextShot: Shot = { ...shotRef.current, ...nextRecipe, jpeg };
          await saveShot(nextShot);
          if (controller.signal.aborted) {
            URL.revokeObjectURL(url);
            return;
          }
          onUpdateRef.current(nextShot);
          reveal(url);
        })
        .catch((error: unknown) => {
          if (isAbort(error) || controller.signal.aborted) return;
          setDeveloping(false);
        });
    }, 140);
    return () => {
      clearTimeout(timer);
      controller.abort();
      filmPort.current.cancel();
    };

    function reveal(url: string) {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setCurrentUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return url;
        });
        setNextUrl(null);
        return;
      }
      setNextUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return url;
      });
    }
  }, [wanted, saved]);

  useEffect(() => {
    if (wanted === saved && !nextUrl) setDeveloping(false);
  }, [wanted, saved, nextUrl]);

  useEffect(() => {
    if (!nextUrl) return;
    const url = nextUrl;
    const timer = window.setTimeout(() => promote(url), FADE_MS);
    return () => clearTimeout(timer);
  }, [nextUrl]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    const source = sourceFrom(shot);
    const key = wanted;
    const timer = window.setTimeout(() => {
      void loadPreviews();
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
      stagePort.current.cancel();
    };

    async function loadPreviews() {
      try {
        if (!previews.current.raw) {
          const buffer = await stagePort.current.run("raw", shot.raw, source, recipeRef.current, controller.signal);
          if (cancelled) return;
          previews.current.raw = URL.createObjectURL(new Blob([buffer], { type: "image/jpeg" }));
          if (stageRef.current === "raw") setStageUrl(previews.current.raw);
        }
        if (previews.current.opticsKey !== key) {
          const buffer = await stagePort.current.run("optics", shot.raw, source, recipeRef.current, controller.signal);
          if (cancelled) return;
          if (previews.current.optics) URL.revokeObjectURL(previews.current.optics);
          previews.current.optics = URL.createObjectURL(new Blob([buffer], { type: "image/jpeg" }));
          previews.current.opticsKey = key;
          if (stageRef.current === "optics") setStageUrl(previews.current.optics);
        }
      } catch (error) {
        if (isAbort(error) || cancelled) return;
      }
    }
  }, [shot.raw, wanted]);

  useEffect(() => {
    if (stage === "film") return;
    if (stage === "raw") setStageUrl(previews.current.raw ?? null);
    else setStageUrl(previews.current.opticsKey === wanted ? (previews.current.optics ?? null) : null);
  }, [stage, wanted]);

  useEffect(() => {
    setPixels("");
  }, [stage, currentUrl, stageUrl]);

  function promote(url: string) {
    setCurrentUrl((current) => {
      if (current && current !== url) URL.revokeObjectURL(current);
      return url;
    });
    setNextUrl((current) => (current === url ? null : current));
  }

  const notes: Record<Stage, string> = {
    raw: `线性 RAW · ${formatBytes(shot.raw.byteLength)} · 完整画幅，没有暗角，也没有胶卷颜色`,
    optics: `${camera.name} 已套上暗角、锐度和画幅。${exposureNote(recipe)}颜色还停在显影之前`,
    film: `${film.brand} ${film.name} · ${film.blurb}`,
  };

  const base = `CyberCam_${savedCamera.name.replace(/\s+/g, "-")}_${savedFilm.name.replace(/\s+/g, "-")}_${shot.createdAt.slice(0, 10)}`;
  const waitingOnPhoto = developing && stage === "film" && !nextUrl;

  return (
    <section className="overlay review">
      <header className="overlay-bar">
        <button className="text-btn" type="button" onClick={onClose}>
          关闭
        </button>
        <div>
          <p className="eyebrow">底片</p>
          <h2>{camera.name}</h2>
        </div>
        <button className="text-btn danger" type="button" onClick={() => (confirming ? onDelete(shot.id) : setConfirming(true))}>
          {confirming ? "确认删除" : "删除"}
        </button>
      </header>

      <div className={waitingOnPhoto ? "review-frame is-developing" : "review-frame"}>
        {stage === "film" && currentUrl ? (
          <div className="review-stack">
            <img
              className={nextUrl ? "is-leaving" : "is-current"}
              src={currentUrl}
              alt=""
              onLoad={(event) => {
                if (nextUrl) return;
                const image = event.currentTarget;
                setPixels(`${image.naturalWidth}×${image.naturalHeight}`);
              }}
            />
            {nextUrl ? (
              <img
                className="is-arriving"
                src={nextUrl}
                alt=""
                onAnimationEnd={(event) => {
                  if (event.animationName !== "develop-in") return;
                  promote(nextUrl);
                }}
                onLoad={(event) => {
                  const image = event.currentTarget;
                  setPixels(`${image.naturalWidth}×${image.naturalHeight}`);
                }}
              />
            ) : null}
          </div>
        ) : stage !== "film" && stageUrl ? (
          <img
            src={stageUrl}
            alt=""
            onLoad={(event) => {
              const image = event.currentTarget;
              setPixels(`${image.naturalWidth}×${image.naturalHeight}`);
            }}
          />
        ) : (
          <p className="waiting">正在从 RAW 生成这一步</p>
        )}
        {waitingOnPhoto ? (
          <>
            <div className="develop-wash" />
            <p className="veil">正在显影</p>
          </>
        ) : null}
      </div>

      <div className="segment" role="tablist">
        {(
          [
            ["raw", "RAW"],
            ["optics", "机身"],
            ["film", "成片"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={stage === id} className={stage === id ? "on" : ""} onClick={() => setStage(id)}>
            {label}
          </button>
        ))}
      </div>
      <p className="note">{notes[stage]}</p>

      <div className="pipe">
        <span className={stage === "raw" ? "on" : ""}>RAW</span>
        <i />
        <span className={stage === "optics" ? "on" : ""}>{camera.name}</span>
        <i />
        <span className={stage === "film" ? "on" : ""}>{film.name}</span>
      </div>

      <div className="respool">
        <p>换机身，用同一张 RAW 重来</p>
        <div className="scroll">
          {CAMERAS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === camera.id ? "mini selected" : "mini"}
              onClick={() => setRecipe((current) => ({ ...current, cameraId: item.id }))}
            >
              <CameraArt id={item.id} />
              <span>{item.name}</span>
            </button>
          ))}
        </div>
        {recipe.iso != null && recipe.shutter != null && recipe.aperture != null ? (
          <>
            <p>曝光</p>
            <ExposureDials
              iso={recipe.iso}
              shutter={recipe.shutter}
              aperture={recipe.aperture}
              onIso={(delta) => setRecipe((current) => ({ ...current, iso: stepIso(current.iso ?? film.iso, delta) }))}
              onShutter={(delta) =>
                setRecipe((current) => ({ ...current, shutter: stepShutter(current.shutter ?? 1 / 125, -delta) }))
              }
              onAperture={(delta) =>
                setRecipe((current) => ({ ...current, aperture: stepAperture(current.aperture ?? 4, -delta) }))
              }
            />
          </>
        ) : null}
        <p>换胶卷</p>
        <div className="scroll">
          {FILMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === film.id ? "mini selected" : "mini"}
              onClick={() => setRecipe((current) => ({ ...current, filmId: item.id }))}
            >
              <FilmArt id={item.id} />
              <span>{item.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="downloads">
        <button type="button" className="line-btn" onClick={() => void downloadBuffer(shot.raw, `${base}.filmraw`, "application/octet-stream")}>
          下载 RAW
        </button>
        <button type="button" className="line-btn solid" onClick={() => void downloadBuffer(shot.jpeg, `${base}.jpg`, "image/jpeg")}>
          下载成片{stage === "film" && pixels ? ` · ${pixels}` : ""} · {formatBytes(shot.jpeg.byteLength)}
        </button>
      </div>
    </section>
  );
}

function recipeFrom(shot: Shot): DevelopRecipe {
  return {
    cameraId: shot.cameraId,
    filmId: shot.filmId,
    ev: shot.ev,
    iso: shot.iso,
    shutter: shot.shutter,
    aperture: shot.aperture,
  };
}

function sourceFrom(shot: Shot): DevelopSource {
  return { seed: shot.seed, portrait: shot.portrait, turn: shot.turn };
}

function recipeKey(recipe: DevelopRecipe) {
  return [recipe.cameraId, recipe.filmId, recipe.ev, recipe.iso ?? "", recipe.shutter ?? "", recipe.aperture ?? ""].join("|");
}

function exposureNote(recipe: DevelopRecipe) {
  if (recipe.iso == null || recipe.shutter == null || recipe.aperture == null) return "";
  return ` ISO ${recipe.iso} · ${formatShutter(recipe.shutter)} · ${formatAperture(recipe.aperture)}。`;
}

function isAbort(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
