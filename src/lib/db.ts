export type Shot = {
  id: string;
  createdAt: string;
  cameraId: string;
  filmId: string;
  ev: number;
  /** Shooting ISO. Missing on shots from before the exposure dials. */
  iso?: number;
  /** Shutter time in seconds. */
  shutter?: number;
  /** f-number. */
  aperture?: number;
  /** The phone was portrait when the shutter closed, so the film gate is upright. */
  portrait?: boolean;
  seed: number;
  raw: ArrayBuffer;
  jpeg: ArrayBuffer;
};

const DB_NAME = "cybercam";
const STORE = "shots";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadShots(): Promise<Shot[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    request.onsuccess = () => {
      const shots = request.result as Shot[];
      shots.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      resolve(shots);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function saveShot(shot: Shot): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(shot);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteShot(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
