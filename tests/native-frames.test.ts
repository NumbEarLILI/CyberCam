import { describe, expect, it } from "vitest";
import { decodeBase64, latestOnly } from "../src/lib/native-frames";

describe("native preview frames", () => {
  it("decodes base64 into bytes", () => {
    const bytes = decodeBase64(Buffer.from([0, 1, 127, 128, 255]).toString("base64"));
    expect(Array.from(bytes)).toEqual([0, 1, 127, 128, 255]);
  });

  it("drops frames that arrive while one is decoding and keeps the newest", async () => {
    const seen: number[] = [];
    const gates: Array<() => void> = [];
    const push = latestOnly<number>((value) => {
      seen.push(value);
      return new Promise<void>((resolve) => gates.push(resolve));
    });
    push(1);
    push(2);
    push(3);
    push(4);
    expect(seen).toEqual([1]);
    gates.shift()!();
    await Promise.resolve();
    await Promise.resolve();
    expect(seen).toEqual([1, 4]);
    gates.shift()!();
    await Promise.resolve();
    await Promise.resolve();
    expect(seen).toEqual([1, 4]);
  });

  it("keeps going after a frame fails to decode", async () => {
    const seen: number[] = [];
    const push = latestOnly<number>(async (value) => {
      seen.push(value);
      if (value === 1) throw new Error("bad jpeg");
    });
    push(1);
    push(2);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(seen).toEqual([1, 2]);
  });
});
