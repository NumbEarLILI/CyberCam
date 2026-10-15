import { renderFilmImage, renderOpticsImage, renderRawImage, type DevelopRecipe, type DevelopSource } from "../lib/render-shot";

type Kind = "film" | "raw" | "optics";

type Request = {
  id: number;
  kind: Kind;
  raw: ArrayBuffer;
  source: DevelopSource;
  recipe: DevelopRecipe;
};

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage(message: unknown, transfer: Transferable[]): void;
};

scope.onmessage = async (event: MessageEvent<Request>) => {
  const { id, kind, raw, source, recipe } = event.data;
  const image =
    kind === "film" ? renderFilmImage(raw, source, recipe) : kind === "raw" ? renderRawImage(raw, source) : renderOpticsImage(raw, source, recipe);
  const buffer = await encodeJpeg(image.data, image.width, image.height, kind === "film" ? 0.97 : 0.86);
  scope.postMessage({ id, buffer }, [buffer]);
};

async function encodeJpeg(rgba: Uint8ClampedArray, width: number, height: number, quality: number) {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法导出图像");
  const pixels = new Uint8ClampedArray(rgba.byteLength);
  pixels.set(rgba);
  ctx.putImageData(new ImageData(pixels, width, height), 0, 0);
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
  return blob.arrayBuffer();
}
