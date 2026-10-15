import { useCallback, useEffect, useRef, useState } from "react";
import { CameraArt, FilmArt } from "./components/art";
import { Gallery } from "./components/Gallery";
import { Review } from "./components/Review";
import { Sheets } from "./components/Sheets";
import { getCamera } from "./data/cameras";
import { getFilm } from "./data/films";
import { copyBytes, fitSize, readSource, rgbaToBlob } from "./lib/bitmap";
import { deleteShot, loadShots, saveShot, type Shot } from "./lib/db";
import { applyCamera, applyFilm, rawToFloat } from "./lib/develop";
import { createFinder } from "./lib/finder";
import { lensLabel, shouldMirrorTrack, type Lens } from "./lib/lenses";
import { encodeRaw, rgba8ToRaw } from "./lib/raw";

type Source = "live" | "import";
type Phase = "raw" | "optics" | "film";
type Picker = "camera" | "film" | "lens" | null;

export function App() {
  const [cameraId, setCameraId] = useState("leica-m6");
  const [filmId, setFilmId] = useState("portra-400");
  const [ev, setEv] = useState(0);
  const [source, setSource] = useState<Source>("live");
  const [mirror, setMirror] = useState(false);
  const [picker, setPicker] = useState<Picker>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [lenses, setLenses] = useState<Lens[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState(false);
  const [view, setView] = useState<"camera" | "gallery" | "review">("camera");
  const [shots, setShots] = useState<Shot[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const sensorRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  const sensorEpoch = useRef(0);
  const finderState = useRef({
    source,
    cameraId,
    filmId,
    ev,
    mirror,
    frame,
  });
  finderState.current = { source, cameraId, filmId, ev, mirror, frame };

  const camera = getCamera(cameraId);
  const film = getFilm(filmId);
  const active = shots.find((shot) => shot.id === activeId) ?? null;

  useEffect(() => {
    loadShots().then(setShots).catch(() => setMessage("相册暂时读不出来，这次拍摄仍会留在本次会话里。"));
  }, []);

  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const measure = () => {
      const style = getComputedStyle(element);
      const padX = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
      const padY = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
      const width = Math.max(0, element.clientWidth - padX);
      const height = Math.max(0, element.clientHeight - padY);
      const byHeight = height * camera.profile.aspect;
      if (byHeight <= width) setFrame({ width: byHeight, height });
      else setFrame({ width, height: width / camera.profile.aspect });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [camera.profile.aspect, view]);

  const refreshLenses = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const listed = await navigator.mediaDevices.enumerateDevices();
    const videos = listed.filter((item) => item.kind === "videoinput" && item.deviceId);
    setLenses(videos.map((item, index) => ({ deviceId: item.deviceId, label: lensLabel(item.label, index) })));
  }, []);

  useEffect(() => {
    if (!navigator.mediaDevices?.addEventListener) return;
    const onChange = () => {
      void refreshLenses();
    };
    navigator.mediaDevices.addEventListener("devicechange", onChange);
    return () => navigator.mediaDevices.removeEventListener("devicechange", onChange);
  }, [refreshLenses]);

  useEffect(() => {
    if (source !== "live") return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    const video: MediaTrackConstraints = deviceId
      ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
      : { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } };
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(true);
      setMessage("没有打开摄像头。可以导入一张照片。");
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ audio: false, video })
      .then(async (next) => {
        if (cancelled) {
          next.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = next;
        const element = videoRef.current;
        if (!element) return;
        element.srcObject = next;
        await element.play();
        const track = next.getVideoTracks()[0];
        const settings = track?.getSettings();
        setActiveDeviceId(settings?.deviceId ?? deviceId);
        setMirror(shouldMirrorTrack(settings?.facingMode, track?.label ?? ""));
        setCameraError(false);
        await refreshLenses();
      })
      .catch(() => {
        if (cancelled) return;
        setCameraError(true);
        setMessage("没有打开摄像头。可以导入一张照片。");
      });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
      const element = videoRef.current;
      if (element) element.srcObject = null;
    };
  }, [deviceId, refreshLenses, source]);

  const grab = useCallback(
    (maxEdge: number) => {
      if (source === "live") {
        const video = videoRef.current;
        if (!video || video.videoWidth === 0) return null;
        return readSource(video, video.videoWidth, video.videoHeight, mirror, maxEdge);
      }
      const sensor = sensorRef.current;
      if (!sensor || sensor.width === 0) return null;
      return readSource(sensor, sensor.width, sensor.height, false, maxEdge);
    },
    [mirror, source],
  );

  useEffect(() => {
    if (view !== "camera") return;
    const preview = previewRef.current;
    if (!preview) return;
    const finder = createFinder(preview);
    let stop = false;
    let raf = 0;
    let signature = "";
    let lastLiveDraw = 0;
    const loop = () => {
      if (stop) return;
      try {
        if (busy.current || document.hidden) return;
        const state = finderState.current;
        if (state.frame.width < 2 || state.frame.height < 2) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const bufferW = Math.max(2, Math.round(state.frame.width * dpr));
        const bufferH = Math.max(2, Math.round(state.frame.height * dpr));
        const live = state.source === "live";
        const mark = `${state.source}|${state.cameraId}|${state.filmId}|${state.ev}|${state.mirror}|${bufferW}|${bufferH}|${sensorEpoch.current}`;
        if (!live && mark === signature) return;
        const grade = {
          camera: getCamera(state.cameraId).profile,
          film: getFilm(state.filmId).profile,
          ev: state.ev,
          mirror: live && state.mirror,
        };
        let drew = false;
        if (live) {
          const video = videoRef.current;
          if (video && video.readyState >= 2 && video.videoWidth > 0) {
            drew = finder.draw(video, video.videoWidth, video.videoHeight, bufferW, bufferH, grade);
          }
        } else {
          const sensor = sensorRef.current;
          if (sensor && sensor.width > 1 && sensor.height > 1) {
            drew = finder.draw(sensor, sensor.width, sensor.height, bufferW, bufferH, grade);
          }
        }
        if (drew) {
          signature = mark;
          if (live) {
            const now = performance.now();
            if (lastLiveDraw > 0) finder.noteFrame(now - lastLiveDraw);
            lastLiveDraw = now;
          }
        }
      } finally {
        if (!stop) raf = requestAnimationFrame(loop);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      stop = true;
      cancelAnimationFrame(raf);
      finder.destroy();
    };
  }, [view]);

  const shoot = useCallback(async () => {
    if (busy.current || view !== "camera" || picker) return;
    const image = grab(1400);
    if (!image) {
      setMessage("画面还没准备好。");
      return;
    }
    busy.current = true;
    setFlash(true);
    window.setTimeout(() => setFlash(false), 180);
    navigator.vibrate?.(12);
    try {
      const body = getCamera(cameraId);
      const stock = getFilm(filmId);
      const seed = Math.floor(Math.random() * 1_000_000_000);
      setPhase("raw");
      await paint();
      const rawImage = rgba8ToRaw(image.data, image.width, image.height);
      const rawBytes = encodeRaw(rawImage, { capturedAt: new Date().toISOString() });
      await sleep(420);
      setPhase("optics");
      await paint();
      const optics = applyCamera(rawToFloat(rawImage), body.profile, ev);
      await sleep(420);
      setPhase("film");
      await paint();
      const started = performance.now();
      const rgba = applyFilm(optics, stock.profile, { seed });
      const jpeg = await rgbaToBlob(rgba, optics.width, optics.height);
      const shot: Shot = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        cameraId,
        filmId,
        ev,
        seed,
        raw: copyBytes(rawBytes),
        jpeg: await jpeg.arrayBuffer(),
      };
      const elapsed = performance.now() - started;
      if (elapsed < 420) await sleep(420 - elapsed);
      try {
        await saveShot(shot);
      } catch {
        setMessage("RAW 已经显影，但没能写进本地相册。");
      }
      setShots((current) => [shot, ...current.filter((item) => item.id !== shot.id)]);
      setActiveId(shot.id);
      setView("review");
    } catch {
      setMessage("这张没有写完。再按一次快门。");
    } finally {
      setPhase(null);
      busy.current = false;
    }
  }, [cameraId, ev, filmId, grab, picker, view]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "Space" || view !== "camera") return;
      event.preventDefault();
      void shoot();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shoot, view]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), 3600);
    return () => window.clearTimeout(timer);
  }, [message]);

  async function importFile(file: File) {
    const img = await loadImage(file);
    const canvas = sensorRef.current;
    if (!canvas) return;
    const size = fitSize(img.naturalWidth, img.naturalHeight, 1600);
    canvas.width = size.width;
    canvas.height = size.height;
    canvas.getContext("2d")?.drawImage(img, 0, 0, size.width, size.height);
    sensorEpoch.current += 1;
    setSource("import");
  }

  async function removeShot(id: string) {
    setShots((current) => current.filter((shot) => shot.id !== id));
    setActiveId(null);
    setView("gallery");
    try {
      await deleteShot(id);
    } catch {
      setMessage("本地相册里的这张可能还在。");
    }
  }

  return (
    <div className="app">
      <div className={view === "camera" ? "camera-shell" : "camera-shell hidden"}>
          <header className="top">
            <div className="top-side">
              <button type="button" className="ghost" onClick={() => setView("gallery")}>
                相册 {shots.length}
              </button>
            </div>
            <div className="brand">
              <strong>CyberCam</strong>
            </div>
            <div className="top-side end">
              <button type="button" className="ghost" onClick={() => fileRef.current?.click()}>
                导入
              </button>
            </div>
          </header>

          <div className="stage" ref={stageRef}>
            <div className="frame" style={{ width: frame.width, height: frame.height }}>
              <video ref={videoRef} className={source === "live" ? `fill ${mirror ? "mirror" : ""}` : "sensor-hidden"} playsInline muted autoPlay />
              <canvas ref={sensorRef} className={source === "live" ? "sensor-hidden" : "fill"} />
              <canvas ref={previewRef} className="fill preview" />
              <div className="thirds" />
              {cameraError && source === "live" ? <p className="finder-empty">没有打开摄像头。可以从上方导入一张照片。</p> : null}
              {flash ? <div className="flash" /> : null}
            </div>
          </div>

          <footer className="dock">
            <div className="looks">
              <button type="button" className="look" onClick={() => setPicker("camera")}>
                <span className="art-slot">
                  <CameraArt id={camera.id} />
                </span>
                <span>
                  <span className="meta">机身</span>
                  <strong>{camera.name}</strong>
                </span>
              </button>
              <button type="button" className="look" onClick={() => setPicker("film")}>
                <span className="art-slot film">
                  <FilmArt id={film.id} />
                </span>
                <span>
                  <span className="meta">胶卷</span>
                  <strong>{film.name}</strong>
                </span>
              </button>
            </div>
            <div className="controls">
              <div className="ev">
                <button type="button" onClick={() => setEv((value) => clampEv(value - 0.5))} aria-label="降低曝光">
                  −
                </button>
                <span>{formatEv(ev)}</span>
                <button type="button" onClick={() => setEv((value) => clampEv(value + 0.5))} aria-label="提高曝光">
                  +
                </button>
              </div>
              <button type="button" className="shutter" aria-label="快门" onClick={() => void shoot()} disabled={phase !== null} />
              <button
                type="button"
                className="lens-btn"
                onClick={() => {
                  void refreshLenses();
                  setPicker("lens");
                }}
              >
                <span className="meta">{source === "import" ? "画面" : "摄像头"}</span>
                <strong>{source === "import" ? "导入的照片" : (lenses.find((lens) => lens.deviceId === activeDeviceId)?.label ?? "正在打开")}</strong>
              </button>
            </div>
          </footer>
          <input
            ref={fileRef}
            className="sensor-hidden"
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void importFile(file).catch(() => setMessage("这张照片读不了。"));
            }}
          />
      </div>

      {view === "gallery" ? (
        <Gallery
          shots={shots}
          onBack={() => setView("camera")}
          onOpen={(id) => {
            setActiveId(id);
            setView("review");
          }}
        />
      ) : null}

      {view === "review" && active ? (
        <Review
          shot={active}
          onClose={() => setView("camera")}
          onUpdate={(shot) => setShots((current) => current.map((item) => (item.id === shot.id ? shot : item)))}
          onDelete={(id) => void removeShot(id)}
        />
      ) : null}

      <Sheets
        picker={picker}
        cameraId={cameraId}
        filmId={filmId}
        lenses={lenses}
        activeLensId={activeDeviceId}
        onClose={() => setPicker(null)}
        onPickCamera={(id) => {
          setCameraId(id);
          setPicker(null);
        }}
        onPickFilm={(id) => {
          setFilmId(id);
          setPicker(null);
        }}
        onPickLens={(id) => {
          setDeviceId(id);
          setActiveDeviceId(id);
          setCameraError(false);
          setSource("live");
          setPicker(null);
        }}
      />

      {phase ? (
        <div className="develop-modal" role="status">
          <p className="eyebrow">显影</p>
          <h2>{phase === "raw" ? "正在写入 RAW" : phase === "optics" ? "套用机身光学" : "胶卷上色"}</h2>
          <ol className="steps">
            <li data-state={stepState(phase, "raw")}>线性 RAW · 16-bit RGB</li>
            <li data-state={stepState(phase, "optics")}>{camera.name} · 暗角、锐度、画幅</li>
            <li data-state={stepState(phase, "film")}>{film.name} · 色彩与颗粒</li>
          </ol>
        </div>
      ) : null}

      {message ? <p className="toast">{message}</p> : null}
    </div>
  );
}

function stepState(phase: Phase, step: Phase) {
  const order: Phase[] = ["raw", "optics", "film"];
  const current = order.indexOf(phase);
  const mine = order.indexOf(step);
  if (mine < current) return "done";
  if (mine === current) return "now";
  return "wait";
}

function clampEv(value: number) {
  return Math.max(-2, Math.min(2, Math.round(value * 10) / 10));
}

function formatEv(value: number) {
  const text = value.toFixed(1);
  return value > 0 ? `+${text}` : text;
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function paint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve(null)));
  });
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("无法读取照片"));
    };
    image.src = url;
  });
}
