type Base64Decoder = { fromBase64?: (value: string) => Uint8Array };

export function decodeBase64(value: string): Uint8Array {
  const native = (Uint8Array as unknown as Base64Decoder).fromBase64;
  if (native) return native(value);
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Runs one item at a time; anything that arrives meanwhile is replaced by the newest item. */
export function latestOnly<T>(run: (item: T) => Promise<void>) {
  let running = false;
  let pending: { item: T } | null = null;
  const start = (item: T) => {
    running = true;
    const done = () => {
      const next = pending;
      pending = null;
      if (next) start(next.item);
      else running = false;
    };
    let task: Promise<void>;
    try {
      task = run(item);
    } catch (error) {
      task = Promise.reject(error);
    }
    task.then(done, done);
  };
  return (item: T) => {
    if (running) {
      pending = { item };
      return;
    }
    start(item);
  };
}
