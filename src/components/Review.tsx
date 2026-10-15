import { useEffect, useRef, useState } from "react";
import { CAMERAS, getCamera } from "../data/cameras";
import { FILMS, getFilm } from "../data/films";
import { downloadBuffer, formatBytes, rgbaToBlob, rotateRgba } from "../lib/bitmap";
import { saveShot, type Shot } from "../lib/db";
import { applyCamera, applyFilm, floatToRgba, rawToFloat } from "../lib/develop";
import { ExposureDials } from "./Dials";
import { formatAperture, formatShutter, isoGrainScale, recipeEv, stepAperture, stepIso, stepShutter } from "../lib/exposure";
import { framedProfile } from "../lib/frame";
import { decodeRaw } from "../lib/raw";
import { CameraArt, FilmArt } from "./art";

type Stage = "raw" | "optics" | "film";

type Props = {
  shot: Shot;
  onClose: () => void;
  onUpdate: (shot: Shot) => void;
  onDelete: (id: string) => void;
};

export function Review({ shot, onClose, onUpdate, onDelete }: Props) {
  const [stage, setStage] = useState<Stage>("film");
  const [urls, setUrls] = useState<Partial<Record<Stage, string>>>({});
  const [working, setWorking] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pixels, setPixels] = useState("");
  const urlsRef = useRef<string[]>([]);
  const lock = useRef(false);
  const camera = getCamera(shot.cameraId);
  const film = getFilm(shot.filmId);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const decoded = decodeRaw(new Uint8Array(shot.raw));
      const linear = rawToFloat(decoded.image);
      const optics = applyCamera(linear, framedProfile(camera.profile, shot.portrait), recipeEv(shot.ev, film.iso, shot));
      const turn = shot.turn ?? 0;
      const rawTurned = rotateRgba(floatToRgba(linear), decoded.image.width, decoded.image.height, turn);
      const opticsTurned = rotateRgba(floatToRgba(optics), optics.width, optics.height, turn);
      const rawBlob = await rgbaToBlob(rawTurned.data, rawTurned.width, rawTurned.height, "image/jpeg", 0.86);
      const opticsBlob = await rgbaToBlob(opticsTurned.data, opticsTurned.width, opticsTurned.height, "image/jpeg", 0.86);
      const rawUrl = URL.createObjectURL(rawBlob);
      const opticsUrl = URL.createObjectURL(opticsBlob);
      const filmUrl = URL.createObjectURL(new Blob([shot.jpeg], { type: "image/jpeg" }));
      if (cancelled) {
        URL.revokeObjectURL(rawUrl);
        URL.revokeObjectURL(opticsUrl);
        URL.revokeObjectURL(filmUrl);
        return;
      }
      urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      urlsRef.current = [rawUrl, opticsUrl, filmUrl];
      setUrls({ raw: rawUrl, optics: opticsUrl, film: filmUrl });
    })();
    return () => {
      cancelled = true;
    };
  }, [shot, camera.profile, film]);

  useEffect(() => {
    return () => {
      urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      urlsRef.current = [];
    };
  }, []);

  useEffect(() => {
    setPixels("");
  }, [stage, urls]);

  async function redevelop(patch: Partial<Pick<Shot, "cameraId" | "filmId" | "ev" | "iso" | "shutter" | "aperture">>) {
    if (lock.current) return;
    lock.current = true;
    setWorking(true);
    setStage("film");
    try {
      const nextCamera = getCamera(patch.cameraId ?? shot.cameraId);
      const nextFilm = getFilm(patch.filmId ?? shot.filmId);
      const next = { ...shot, ...patch };
      const decoded = decodeRaw(new Uint8Array(shot.raw));
      const optics = applyCamera(
        rawToFloat(decoded.image),
        framedProfile(nextCamera.profile, shot.portrait),
        recipeEv(next.ev, nextFilm.iso, next),
      );
      const rgba = applyFilm(optics, nextFilm.profile, {
        seed: shot.seed,
        grainScale: next.iso == null ? 1 : isoGrainScale(next.iso, nextFilm.iso),
      });
      const turned = rotateRgba(rgba, optics.width, optics.height, shot.turn ?? 0);
      const blob = await rgbaToBlob(turned.data, turned.width, turned.height);
      const updated: Shot = {
        ...next,
        jpeg: await blob.arrayBuffer(),
      };
      await saveShot(updated);
      onUpdate(updated);
    } finally {
      lock.current = false;
      setWorking(false);
    }
  }

  const notes: Record<Stage, string> = {
    raw: `线性 RAW · ${formatBytes(shot.raw.byteLength)} · 完整画幅，没有暗角，也没有胶卷颜色`,
    optics: `${camera.name} 已套上暗角、锐度和画幅。${exposureNote(shot)}颜色还停在显影之前`,
    film: `${film.brand} ${film.name} · ${film.blurb}`,
  };

  const base = `CyberCam_${camera.name.replace(/\s+/g, "-")}_${film.name.replace(/\s+/g, "-")}_${shot.createdAt.slice(0, 10)}`;

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

      <div className={working ? "review-frame working" : "review-frame"}>
        {urls[stage] ? (
          <img
            src={urls[stage]}
            alt=""
            onLoad={(event) => {
              const image = event.currentTarget;
              setPixels(`${image.naturalWidth}×${image.naturalHeight}`);
            }}
          />
        ) : (
          <p className="waiting">正在从 RAW 生成这一步</p>
        )}
        {working ? <p className="veil">正在重新显影</p> : null}
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
            <button key={item.id} type="button" className={item.id === camera.id ? "mini selected" : "mini"} onClick={() => redevelop({ cameraId: item.id })}>
              <CameraArt id={item.id} />
              <span>{item.name}</span>
            </button>
          ))}
        </div>
        {shot.iso != null && shot.shutter != null && shot.aperture != null ? (
          <>
            <p>曝光</p>
            <ExposureDials
              iso={shot.iso}
              shutter={shot.shutter}
              aperture={shot.aperture}
              onIso={(delta) => void redevelop({ iso: stepIso(shot.iso ?? film.iso, delta) })}
              onShutter={(delta) => void redevelop({ shutter: stepShutter(shot.shutter ?? 1 / 125, -delta) })}
              onAperture={(delta) => void redevelop({ aperture: stepAperture(shot.aperture ?? 4, -delta) })}
            />
          </>
        ) : null}
        <p>换胶卷</p>
        <div className="scroll">
          {FILMS.map((item) => (
            <button key={item.id} type="button" className={item.id === film.id ? "mini selected" : "mini"} onClick={() => redevelop({ filmId: item.id })}>
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

function exposureNote(shot: Shot) {
  if (shot.iso == null || shot.shutter == null || shot.aperture == null) return "";
  return ` ISO ${shot.iso} · ${formatShutter(shot.shutter)} · ${formatAperture(shot.aperture)}。`;
}
