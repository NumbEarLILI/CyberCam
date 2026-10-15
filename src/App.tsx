import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { Gallery } from "./components/Gallery";
import { Review } from "./components/Review";
import { Sheets } from "./components/Sheets";
import { getCamera } from "./data/cameras";
import { getFilm } from "./data/films";
import { copyBytes, fitSize, readSource, rgbaToBlob } from "./lib/bitmap";
import { deleteShot, loadShots, saveShot, type Shot } from "./lib/db";
import { applyCamera, applyFilm, rawToFloat } from "./lib/develop";
import { createFinder } from "./lib/finder";
import { framedProfile, frameSize, orientedAspect, sensorConstraints, SENSOR_HEIGHT, SENSOR_WIDTH, STILL_MAX_EDGE } from "./lib/frame";
import { hardwareLensLabel, lensLabel, preferredHardwareCamera, shouldMirrorTrack, type HardwareCamera, type Lens } from "./lib/lenses";
import { captureHardwareStill, drawHardwareFrame, listHardwareCameras, nativeCamerasSupported, onHardwareFrame, startHardwareCamera, stopHardwareCamera } from "./lib/native-cameras";
import { encodeRaw, rgba8ToRaw } from "./lib/raw";
import { clampZoom, formatZoom, stepZoom } from "./lib/zoom";

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
  const [backend, setBackend] = useState<"pending" | "web" | "native">(() => (nativeCamerasSupported() ? "pending" : "web"));
  const [lenses, setLenses] = useState<Lens[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState(false);
  const [view, setView] = useState<"camera" | "gallery" | "review">("camera");
  const [shots, setShots] = useState<Shot[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [zoom, setZoom] = useState(1);
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const sensorRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  const sensorEpoch = useRef(0);
  const portraitRef = useRef(typeof window !== "undefined" && window.matchMedia("(orientation: portrait)").matches);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const backendRef = useRef(backend);
  const hardwareRef = useRef<HardwareCamera[]>([]);
  backendRef.current = backend;
  const finderState = useRef({
    source,
    cameraId,
    filmId,
    ev,
    mirror,
    zoom,
    frame,
    backend,
  });
  finderState.current = { source, cameraId, filmId, ev, mirror, zoom, frame, backend };

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
      const stage = element.querySelector(".stage");
      const dock = element.querySelector(".dock");
      if (!stage) return;
      const landscape = window.matchMedia("(orientation: landscape) and (max-height: 520px)").matches;
      const stageStyle = getComputedStyle(stage);
      const padX = Number.parseFloat(stageStyle.paddingLeft) + Number.parseFloat(stageStyle.paddingRight);
      const padY = Number.parseFloat(stageStyle.paddingTop) + Number.parseFloat(stageStyle.paddingBottom);
      const width = Math.max(0, stage.clientWidth - padX);
      const columnStyle = getComputedStyle(element);
      const columnPad = Number.parseFloat(columnStyle.paddingTop) + Number.parseFloat(columnStyle.paddingBottom);
      const dockHeight = dock instanceof HTMLElement ? dock.offsetHeight : 0;
      const height = landscape
        ? Math.max(0, stage.clientHeight - padY)
        : Math.max(0, element.clientHeight - columnPad - dockHeight - padY);
      portraitRef.current = window.matchMedia("(orientation: portrait)").matches;
      const aspect = orientedAspect(camera.profile.aspect, portraitRef.current);
      setFrame(frameSize(width, height, aspect));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    const media = window.matchMedia("(orientation: portrait)");
    media.addEventListener("change", measure);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", measure);
    };
  }, [camera.profile.aspect, view]);

  useEffect(() => {
    setZoom(1);
  }, [deviceId, source]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || view !== "camera") return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setZoom((value) => stepZoom(value, event.deltaY < 0 ? 1 : -1));
    };
    frame.addEventListener("wheel", onWheel, { passive: false });
    return () => frame.removeEventListener("wheel", onWheel);
  }, [view]);

  useEffect(() => {
    if (!nativeCamerasSupported()) return;
    let cancelled = false;
    listHardwareCameras()
      .then((cameras) => {
        if (cancelled) return;
        if (cameras.length === 0) {
          setBackend("web");
          return;
        }
        hardwareRef.current = cameras;
        setLenses(cameras.map((camera) => ({ deviceId: camera.id, label: hardwareLensLabel(camera, cameras) })));
        const preferred = preferredHardwareCamera(cameras);
        setBackend("native");
        if (preferred) {
          setDeviceId(preferred);
          setActiveDeviceId(preferred);
          setMirror(cameras.find((camera) => camera.id === preferred)?.facing === "front");
        }
      })
      .catch(() => {
        if (!cancelled) setBackend("web");
      });
    return () => {
      cancelled = true;
      void stopHardwareCamera();
    };
  }, []);

  const refreshLenses = useCallback(async () => {
    if (backendRef.current !== "web" || !navigator.mediaDevices?.enumerateDevices) return;
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
    if (backend !== "native" || source !== "live" || !deviceId) return;
    const camera = hardwareRef.current.find((item) => item.id === deviceId);
    setMirror(camera?.facing === "front");
    setActiveDeviceId(deviceId);
    setCameraError(false);
    let remove = () => {};
    let cancelled = false;
    startHardwareCamera(deviceId)
      .then(async () => {
        if (cancelled) {
          await stopHardwareCamera();
          return;
        }
        const handle = await onHardwareFrame((jpeg) => {
          if (cancelled || busy.current) return;
          void drawHardwareFrame(sensorRef.current, jpeg);
        });
        if (cancelled) {
          await handle.remove();
          return;
        }
        remove = () => {
          void handle.remove();
        };
      })
      .catch(() => {
        if (cancelled) return;
        setCameraError(true);
        setMessage("这个摄像头打不开。可以换一个，或导入一张照片。");
      });
    return () => {
      cancelled = true;
      remove();
      void stopHardwareCamera();
    };
  }, [backend, deviceId, source]);

  useEffect(() => {
    if (backend !== "web" || source !== "live") return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    const video = sensorConstraints(deviceId);
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
        if (track) {
          try {
            await track.applyConstraints({ width: { ideal: SENSOR_WIDTH }, height: { ideal: SENSOR_HEIGHT } });
          } catch {
            // Keep this camera even when it cannot take the preferred size.
          }
        }
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
  }, [backend, deviceId, refreshLenses, source]);

  const grab = useCallback(
    (maxEdge: number) => {
      if (source === "live" && backend !== "native") {
        const video = videoRef.current;
        if (!video || video.videoWidth === 0) return null;
        return readSource(video, video.videoWidth, video.videoHeight, mirror, maxEdge, zoom);
      }
      const sensor = sensorRef.current;
      if (!sensor || sensor.width === 0) return null;
      return readSource(sensor, sensor.width, sensor.height, source === "live" && mirror, maxEdge, zoom);
    },
    [backend, mirror, source, zoom],
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
        const mark = `${state.source}|${state.cameraId}|${state.filmId}|${state.ev}|${state.mirror}|${state.zoom}|${bufferW}|${bufferH}|${sensorEpoch.current}`;
        if (!live && mark === signature) return;
        const grade = {
          camera: getCamera(state.cameraId).profile,
          film: getFilm(state.filmId).profile,
          ev: state.ev,
          mirror: live && state.mirror,
        };
        let drew = false;
        if (live && state.backend === "native") {
          const sensor = sensorRef.current;
          if (sensor && sensor.width > 1 && sensor.height > 1) {
            drew = finder.draw(sensor, sensor.width, sensor.height, bufferW, bufferH, grade, state.zoom);
          }
        } else if (live) {
          const video = videoRef.current;
          if (video && video.readyState >= 2 && video.videoWidth > 0) {
            drew = finder.draw(video, video.videoWidth, video.videoHeight, bufferW, bufferH, grade, state.zoom);
          }
        } else {
          const sensor = sensorRef.current;
          if (sensor && sensor.width > 1 && sensor.height > 1) {
            drew = finder.draw(sensor, sensor.width, sensor.height, bufferW, bufferH, grade, state.zoom);
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
    busy.current = true;
    if (backend === "native" && source === "live") {
      try {
        const jpeg = await captureHardwareStill();
        await drawHardwareFrame(sensorRef.current, jpeg);
      } catch {
        // The latest preview frame is already on the sensor canvas.
      }
    }
    const image = grab(STILL_MAX_EDGE);
    if (!image) {
      busy.current = false;
      setMessage("画面还没准备好。");
      return;
    }
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
      const optics = applyCamera(rawToFloat(rawImage), framedProfile(body.profile, portraitRef.current), ev);
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
        portrait: portraitRef.current,
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
  }, [backend, cameraId, ev, filmId, grab, picker, source, view]);

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
    const size = fitSize(img.naturalWidth, img.naturalHeight, STILL_MAX_EDGE);
    canvas.width = size.width;
    canvas.height = size.height;
    canvas.getContext("2d")?.drawImage(img, 0, 0, size.width, size.height);
    sensorEpoch.current += 1;
    setZoom(1);
    setSource("import");
  }

  function trackPointer(event: PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button")) return;
    const frame = frameRef.current;
    if (!frame) return;
    frame.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      pinch.current = { distance, zoom };
    }
  }

  function movePointer(event: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const gesture = pinch.current;
    if (pointers.current.size !== 2 || !gesture || gesture.distance <= 0) return;
    const [a, b] = [...pointers.current.values()];
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    setZoom(clampZoom((gesture.zoom * distance) / gesture.distance));
  }

  function releasePointer(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  }

  const lensName = source === "import" ? "导入的照片" : (lenses.find((lens) => lens.deviceId === activeDeviceId)?.label ?? "正在打开");

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

          <div className="finder-column" ref={stageRef}>
          <div className="stage">
            <div
              className="frame"
              ref={frameRef}
              style={{ width: frame.width, height: frame.height }}
              onPointerDown={trackPointer}
              onPointerMove={movePointer}
              onPointerUp={releasePointer}
              onPointerCancel={releasePointer}
            >
              <video ref={videoRef} className={source === "live" ? `fill ${mirror ? "mirror" : ""}` : "sensor-hidden"} playsInline muted autoPlay />
              <canvas ref={sensorRef} className={source === "live" ? "sensor-hidden" : "fill"} />
              <canvas ref={previewRef} className="fill preview" />
              <div className="thirds" />
              {cameraError && source === "live" ? <p className="finder-empty">没有打开摄像头。可以从上方导入一张照片。</p> : null}
              {flash ? <div className="flash" /> : null}
              <div className="hud">
                <button type="button" className="chip" onClick={() => setPicker("camera")}>
                  <span className="meta">机身</span>
                  <strong>{camera.name}</strong>
                </button>
                <button type="button" className="chip" onClick={() => setPicker("film")}>
                  <span className="meta">胶卷</span>
                  <strong>
                    {film.name} · {film.iso}
                  </strong>
                </button>
                <div className="chip ev-chip">
                  <button type="button" onClick={() => setEv((value) => clampEv(value - 0.5))} aria-label="降低曝光">
                    −
                  </button>
                  <span>{formatEv(ev)}</span>
                  <button type="button" onClick={() => setEv((value) => clampEv(value + 0.5))} aria-label="提高曝光">
                    +
                  </button>
                </div>
                <button
                  type="button"
                  className="chip"
                  onClick={() => {
                    void refreshLenses();
                    setPicker("lens");
                  }}
                >
                  <span className="meta">{source === "import" ? "画面" : "摄像头"}</span>
                  <strong>{lensName}</strong>
                </button>
              </div>
              <div className="zoom-bar">
                <button type="button" aria-label="缩小" onClick={() => setZoom((value) => stepZoom(value, -1))} disabled={zoom <= 1}>
                  −
                </button>
                <span>{formatZoom(zoom)}</span>
                <button type="button" aria-label="放大" onClick={() => setZoom((value) => stepZoom(value, 1))} disabled={zoom >= 4}>
                  +
                </button>
              </div>
            </div>
          </div>

          <footer className="dock">
            <button type="button" className="shutter" aria-label="快门" onClick={() => void shoot()} disabled={phase !== null} />
          </footer>
          </div>
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
