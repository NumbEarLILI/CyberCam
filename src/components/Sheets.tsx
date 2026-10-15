import { CAMERAS } from "../data/cameras";
import { FILMS } from "../data/films";
import type { Lens } from "../lib/lenses";
import { CameraArt, FilmArt } from "./art";

type Props = {
  picker: "camera" | "film" | "lens" | null;
  cameraId: string;
  filmId: string;
  lenses: Lens[];
  activeLensId: string | null;
  onPickCamera: (id: string) => void;
  onPickFilm: (id: string) => void;
  onPickLens: (id: string) => void;
  onClose: () => void;
};

const SHEET_COPY = {
  camera: { label: "选择相机", eyebrow: "机身", title: "装上哪台相机" },
  film: { label: "选择胶卷", eyebrow: "胶卷", title: "装进哪卷胶片" },
  lens: { label: "选择摄像头", eyebrow: "摄像头", title: "用哪一个摄像头" },
};

export function Sheets({ picker, cameraId, filmId, lenses, activeLensId, onPickCamera, onPickFilm, onPickLens, onClose }: Props) {
  if (!picker) return null;
  const copy = SHEET_COPY[picker];
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className={picker === "lens" ? "sheet sheet-fit" : "sheet"}
        role="dialog"
        aria-modal="true"
        aria-label={copy.label}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" />
        <header className="sheet-head">
          <div>
            <p className="eyebrow">{copy.eyebrow}</p>
            <h2>{copy.title}</h2>
          </div>
          <button className="text-btn" type="button" onClick={onClose}>
            完成
          </button>
        </header>
        {picker === "lens" ? (
          <div className="lens-list">
            {lenses.length === 0 ? <p className="empty">还没有可用的摄像头。可以导入一张照片。</p> : null}
            {lenses.map((lens) => (
              <button
                key={lens.deviceId}
                type="button"
                className={lens.deviceId === activeLensId ? "lens-row selected" : "lens-row"}
                onClick={() => onPickLens(lens.deviceId)}
              >
                <strong>{lens.label}</strong>
              </button>
            ))}
          </div>
        ) : picker === "camera" ? (
          <div className="camera-grid">
            {CAMERAS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={item.id === cameraId ? "product-card selected" : "product-card"}
                onClick={() => onPickCamera(item.id)}
              >
                <CameraArt id={item.id} />
                <span className="meta">{item.kind} · {item.format}</span>
                <strong>{item.name}</strong>
                <em>{item.blurb}</em>
              </button>
            ))}
          </div>
        ) : (
          <div className="film-list">
            {FILMS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={item.id === filmId ? "film-row selected" : "film-row"}
                onClick={() => onPickFilm(item.id)}
              >
                <FilmArt id={item.id} />
                <span>
                  <span className="meta">{item.brand} · ISO {item.iso}</span>
                  <strong>{item.name}</strong>
                  <em>{item.blurb}</em>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
