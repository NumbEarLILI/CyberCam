import type { DevelopRecipe, DevelopSource } from "./render-shot";

export type DevelopKind = "film" | "raw" | "optics";

type Response = { id: number; buffer: ArrayBuffer };

export function createDevelopPort() {
  let worker: Worker | null = null;
  let active = 0;

  function spawn() {
    worker = new Worker(new URL("../workers/develop.ts", import.meta.url), { type: "module" });
    return worker;
  }

  return {
    cancel() {
      active += 1;
      worker?.terminate();
      worker = null;
    },
    dispose() {
      this.cancel();
    },
    run(kind: DevelopKind, raw: ArrayBuffer, source: DevelopSource, recipe: DevelopRecipe, signal: AbortSignal) {
      const id = (active += 1);
      const current = worker ?? spawn();
      const copy = raw.slice(0);
      return new Promise<ArrayBuffer>((resolve, reject) => {
        let settled = false;
        const finish = (error?: Error, buffer?: ArrayBuffer) => {
          if (settled) return;
          settled = true;
          current.removeEventListener("message", onMessage);
          current.removeEventListener("error", onError);
          signal.removeEventListener("abort", onAbort);
          if (error) reject(error);
          else resolve(buffer as ArrayBuffer);
        };
        const onMessage = (event: MessageEvent<Response>) => {
          if (event.data?.id !== id) return;
          finish(undefined, event.data.buffer);
        };
        const onError = () => finish(new Error("显影失败"));
        const onAbort = () => finish(new DOMException("Aborted", "AbortError"));
        if (signal.aborted) {
          finish(new DOMException("Aborted", "AbortError"));
          return;
        }
        current.addEventListener("message", onMessage);
        current.addEventListener("error", onError);
        signal.addEventListener("abort", onAbort);
        current.postMessage({ id, kind, raw: copy, source, recipe }, [copy]);
      });
    },
  };
}
