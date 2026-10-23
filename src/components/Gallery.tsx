import { useEffect, useState } from "react";
import { getCamera } from "../data/cameras";
import { getFilm } from "../data/films";
import type { Shot } from "../lib/db";
import { CameraArt, FilmArt } from "./art";

type Props = {
  shots: Shot[];
  onBack: () => void;
  onOpen: (id: string) => void;
};

export function Gallery({ shots, onBack, onOpen }: Props) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const shot of shots) {
      next[shot.id] = URL.createObjectURL(new Blob([shot.jpeg], { type: "image/jpeg" }));
    }
    setThumbs(next);
    return () => {
      Object.values(next).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [shots]);

  return (
    <section className="overlay">
      <header className="overlay-bar">
        <button className="text-btn" type="button" onClick={onBack}>
          返回取景
        </button>
        <div>
          <p className="eyebrow">相册</p>
          <h2>{shots.length === 0 ? "还没有底片" : `${shots.length} 张已显影`}</h2>
        </div>
      </header>
      {shots.length === 0 ? (
        <div className="empty">
          <p>快门会先写下线性 RAW，再按当时装上的相机和胶卷显影。成片会出现在这里。</p>
        </div>
      ) : (
        <div className="gallery-grid">
          {shots.map((shot) => {
            const camera = getCamera(shot.cameraId);
            const film = getFilm(shot.filmId);
            return (
              <button key={shot.id} type="button" className="tile" onClick={() => onOpen(shot.id)}>
                {thumbs[shot.id] ? <img src={thumbs[shot.id]} alt="" /> : <div className="tile-fallback" />}
                <span className="tile-copy">
                  <span className="tile-arts">
                    <CameraArt id={camera.id} />
                    <FilmArt id={film.id} />
                  </span>
                  <strong>{camera.name}</strong>
                  <em>{film.brand} {film.name}</em>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
