import { CAMERAS } from "../data/cameras";
import { FILMS } from "../data/films";
import { CameraArt, FilmArt } from "./art";

type Props = {
  picker: "camera" | "film" | null;
  cameraId: string;
  filmId: string;
  onPickCamera: (id: string) => void;
  onPickFilm: (id: string) => void;
  onClose: () => void;
};

export function Sheets({ picker, cameraId, filmId, onPickCamera, onPickFilm, onClose }: Props) {
  if (!picker) return null;
  const camera = picker === "camera";
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={camera ? "选择相机" : "选择胶卷"}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" />
        <header className="sheet-head">
          <div>
            <p className="eyebrow">{camera ? "机身" : "胶卷"}</p>
            <h2>{camera ? "装上哪台相机" : "装进哪卷胶片"}</h2>
          </div>
          <button className="text-btn" type="button" onClick={onClose}>
            完成
          </button>
        </header>
        {camera ? (
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
