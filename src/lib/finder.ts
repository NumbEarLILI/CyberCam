import { readSource, toImageData } from "./bitmap";
import { applyCamera, applyFilm, rawToFloat, type CameraProfile, type FilmProfile } from "./develop";
import { rgba8ToRaw } from "./raw";
import { zoomedCover } from "./zoom";

export type FinderGrade = {
  camera: CameraProfile;
  film: FilmProfile;
  ev: number;
  mirror: boolean;
};

export type Finder = {
  draw(
    source: CanvasImageSource,
    sourceWidth: number,
    sourceHeight: number,
    width: number,
    height: number,
    grade: FinderGrade,
    zoom?: number,
  ): boolean;
  noteFrame(gapMs: number): void;
  destroy(): void;
};

/** How much of the source UV a frame pixel covers. Values below 1 crop toward the center. */
export function coverScale(sourceAspect: number, frameAspect: number): [number, number] {
  if (sourceAspect > frameAspect) return [frameAspect / sourceAspect, 1];
  return [1, sourceAspect / frameAspect];
}

const VS = `#version 300 es
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 oColor;
uniform sampler2D uSource;
uniform vec2 uCover;
uniform vec2 uOutSize;
uniform float uMirror;
uniform float uGain;
uniform float uContrast;
uniform float uPivot;
uniform float uSharpness;
uniform float uSoftness;
uniform float uGlare;
uniform float uVignette;
uniform float uFilmContrast;
uniform float uToe;
uniform float uShoulder;
uniform float uSaturation;
uniform float uHalation;
uniform float uMono;
uniform float uMonoWarmth;
uniform float uMatrix[9];
uniform vec3 uShadow;
uniform vec3 uHigh;

vec3 srgbToLinear(vec3 c) {
  return mix(pow((c + 0.055) / 1.055, vec3(2.4)), c / 12.92, step(c, vec3(0.04045)));
}

vec3 linearToSrgb(vec3 x) {
  x = clamp(x, 0.0, 1.0);
  return mix(1.055 * pow(x, vec3(0.41666667)) - 0.055, x * 12.92, step(x, vec3(0.0031308)));
}

vec2 sourceUv(vec2 frameUv) {
  vec2 uv = (frameUv - 0.5) * uCover + 0.5;
  if (uMirror > 0.5) uv.x = 1.0 - uv.x;
  return uv;
}

vec3 fetch(vec2 frameUv) {
  return texture(uSource, sourceUv(frameUv)).rgb;
}

vec3 blur(vec2 frameUv, float radius) {
  vec3 sum = vec3(0.0);
  vec2 px = 1.0 / uOutSize;
  float unit = max(1.0, min(uOutSize.x, uOutSize.y) / 280.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      sum += fetch(frameUv + vec2(float(x), float(y)) * px * unit * radius);
    }
  }
  return sum / 9.0;
}

float tone(float x) {
  float safe = max(x, 1e-5);
  float raised = uPivot * pow(safe / uPivot, uFilmContrast);
  if (x <= 0.0) raised = 0.0;
  float compressed = uShoulder > 0.0 ? raised / (1.0 + uShoulder * max(0.0, raised - 0.45)) : raised;
  return compressed * (1.0 - uToe) + uToe;
}

void main() {
  vec3 base = fetch(vUv);
  if (uSharpness > 0.0) base += uSharpness * (base - blur(vUv, 1.0));
  if (uSoftness > 0.0) base = mix(base, blur(vUv, 2.0), uSoftness);
  vec3 lin = srgbToLinear(clamp(base, 0.0, 1.0));
  lin = max(lin * uGain, 0.0);
  lin = uPivot * pow(max(lin, vec3(1e-5)) / uPivot, vec3(uContrast));
  float wide = 0.0;
  if (uGlare > 0.0 || uHalation > 0.0) {
    vec3 glow = vec3(0.0);
    vec2 px = 1.0 / uOutSize;
    float radius = 0.05 * min(uOutSize.x, uOutSize.y);
    for (int i = 0; i < 4; i++) {
      float a = float(i) * 1.5707963;
      glow += fetch(vUv + vec2(cos(a), sin(a)) * radius * px);
    }
    glow = max(srgbToLinear(glow / 4.0) * uGain, 0.0);
    wide = dot(glow, vec3(0.2126, 0.7152, 0.0722));
    if (uGlare > 0.0) lin += wide * uGlare;
  }
  vec2 n = (gl_FragCoord.xy / uOutSize - 0.5) * 2.0;
  float falloff = min(1.0, length(n) * 0.70710678);
  lin *= 1.0 - uVignette * pow(falloff, 1.65);

  float r = lin.r;
  float g = lin.g;
  float b = lin.b;
  float nr = uMatrix[0] * r + uMatrix[1] * g + uMatrix[2] * b;
  float ng = uMatrix[3] * r + uMatrix[4] * g + uMatrix[5] * b;
  float nb = uMatrix[6] * r + uMatrix[7] * g + uMatrix[8] * b;
  nr = tone(nr);
  ng = tone(ng);
  nb = tone(nb);
  if (uMono > 0.5) {
    float y = max(0.0, 0.2126 * nr + 0.7152 * ng + 0.0722 * nb);
    nr = y * (1.0 + 0.015 * uMonoWarmth);
    ng = y;
    nb = y * (1.0 - 0.1 * uMonoWarmth);
  } else {
    float y = 0.2126 * nr + 0.7152 * ng + 0.0722 * nb;
    float shadow = clamp(1.0 - y, 0.0, 1.0);
    float high = clamp(y, 0.0, 1.0);
    nr += uShadow.r * shadow + uHigh.r * high;
    ng += uShadow.g * shadow + uHigh.g * high;
    nb += uShadow.b * shadow + uHigh.b * high;
    float luma = 0.2126 * nr + 0.7152 * ng + 0.0722 * nb;
    nr = luma + (nr - luma) * uSaturation;
    ng = luma + (ng - luma) * uSaturation;
    nb = luma + (nb - luma) * uSaturation;
  }
  if (uHalation > 0.0) {
    float t = clamp((wide - 0.58) / 0.5, 0.0, 1.0);
    float glow = t * t * (3.0 - 2.0 * t) * uHalation;
    nr += glow * 1.25;
    ng += glow * 0.2;
    nb += glow * 0.05;
  }
  oColor = vec4(linearToSrgb(vec3(nr, ng, nb)), 1.0);
}`;

const PREVIEW_MAX = 960;
const PREVIEW_MIN = 320;

export function nextPreviewEdge(edge: number, elapsedMs: number, slow: number, fast: number) {
  if (elapsedMs > 26) {
    const nextSlow = slow + 1;
    if (nextSlow >= 2 && edge > PREVIEW_MIN) {
      return { edge: Math.max(PREVIEW_MIN, Math.round(edge * 0.7)), slow: 0, fast: 0 };
    }
    return { edge, slow: nextSlow, fast: 0 };
  }
  if (elapsedMs < 12) {
    const nextFast = fast + 1;
    if (nextFast >= 30 && edge < PREVIEW_MAX) {
      return { edge: Math.min(PREVIEW_MAX, Math.round(edge * 1.2)), slow: 0, fast: 0 };
    }
    return { edge, slow: 0, fast: nextFast };
  }
  return { edge, slow: 0, fast: 0 };
}

export function createFinder(canvas: HTMLCanvasElement): Finder {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    desynchronized: true,
    powerPreference: "high-performance",
    failIfMajorPerformanceCaveat: false,
  });
  if (gl) {
    const gpu = GpuFinder.tryCreate(gl, canvas);
    if (gpu) return gpu;
  }
  return createCpuFinder(canvas);
}

class GpuFinder implements Finder {
  private width = 0;
  private height = 0;
  private sourceWidth = 0;
  private sourceHeight = 0;
  private cap = PREVIEW_MAX;
  private slow = 0;
  private fast = 0;
  private readonly matrix = new Float32Array(9);
  private readonly sourceTex: WebGLTexture;
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly buffer: WebGLBuffer;
  private readonly loc: Record<string, WebGLUniformLocation | null>;

  private constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly canvas: HTMLCanvasElement,
    program: WebGLProgram,
    sourceTex: WebGLTexture,
    vao: WebGLVertexArrayObject,
    buffer: WebGLBuffer,
  ) {
    this.program = program;
    this.sourceTex = sourceTex;
    this.vao = vao;
    this.buffer = buffer;
    this.loc = {
      cover: gl.getUniformLocation(program, "uCover"),
      outSize: gl.getUniformLocation(program, "uOutSize"),
      mirror: gl.getUniformLocation(program, "uMirror"),
      gain: gl.getUniformLocation(program, "uGain"),
      contrast: gl.getUniformLocation(program, "uContrast"),
      pivot: gl.getUniformLocation(program, "uPivot"),
      sharpness: gl.getUniformLocation(program, "uSharpness"),
      softness: gl.getUniformLocation(program, "uSoftness"),
      glare: gl.getUniformLocation(program, "uGlare"),
      vignette: gl.getUniformLocation(program, "uVignette"),
      filmContrast: gl.getUniformLocation(program, "uFilmContrast"),
      toe: gl.getUniformLocation(program, "uToe"),
      shoulder: gl.getUniformLocation(program, "uShoulder"),
      saturation: gl.getUniformLocation(program, "uSaturation"),
      halation: gl.getUniformLocation(program, "uHalation"),
      mono: gl.getUniformLocation(program, "uMono"),
      monoWarmth: gl.getUniformLocation(program, "uMonoWarmth"),
      matrix: gl.getUniformLocation(program, "uMatrix"),
      shadow: gl.getUniformLocation(program, "uShadow"),
      high: gl.getUniformLocation(program, "uHigh"),
    };
  }

  static tryCreate(gl: WebGL2RenderingContext, canvas: HTMLCanvasElement) {
    const program = link(gl, VS, FS);
    if (!program) return null;
    const sourceTex = gl.createTexture();
    const vao = gl.createVertexArray();
    const buffer = gl.createBuffer();
    if (!sourceTex || !vao || !buffer) return null;
    gl.bindTexture(gl.TEXTURE_2D, sourceTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    return new GpuFinder(gl, canvas, program, sourceTex, vao, buffer);
  }

  draw(source: CanvasImageSource, sourceWidth: number, sourceHeight: number, width: number, height: number, grade: FinderGrade, zoom = 1) {
    if (sourceWidth < 2 || sourceHeight < 2 || width < 2 || height < 2) return false;
    const gl = this.gl;
    const size = fitBuffer(width, height, this.cap);
    if (size.width !== this.width || size.height !== this.height) {
      this.width = size.width;
      this.height = size.height;
      this.canvas.width = size.width;
      this.canvas.height = size.height;
    }
    gl.viewport(0, 0, this.width, this.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    const pixels = source as TexImageSource;
    if (this.sourceWidth !== sourceWidth || this.sourceHeight !== sourceHeight) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      this.sourceWidth = sourceWidth;
      this.sourceHeight = sourceHeight;
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    }
    gl.useProgram(this.program);
    const camera = grade.camera;
    const film = grade.film;
    const cover = zoomedCover(coverScale(sourceWidth / sourceHeight, this.width / this.height), zoom);
    gl.uniform2f(this.loc.cover, cover[0], cover[1]);
    gl.uniform2f(this.loc.outSize, this.width, this.height);
    gl.uniform1f(this.loc.mirror, grade.mirror ? 1 : 0);
    gl.uniform1f(this.loc.gain, camera.exposure * 2 ** grade.ev);
    gl.uniform1f(this.loc.contrast, camera.contrast);
    gl.uniform1f(this.loc.pivot, 0.18);
    gl.uniform1f(this.loc.sharpness, camera.sharpness);
    gl.uniform1f(this.loc.softness, camera.softness);
    gl.uniform1f(this.loc.glare, camera.glare);
    gl.uniform1f(this.loc.vignette, camera.vignette);
    gl.uniform1f(this.loc.filmContrast, film.contrast);
    gl.uniform1f(this.loc.toe, film.toe);
    gl.uniform1f(this.loc.shoulder, film.shoulder);
    gl.uniform1f(this.loc.saturation, film.saturation);
    gl.uniform1f(this.loc.halation, film.halation);
    gl.uniform1f(this.loc.mono, film.monochrome ? 1 : 0);
    gl.uniform1f(this.loc.monoWarmth, film.monoWarmth);
    this.matrix.set(film.matrix);
    gl.uniform1fv(this.loc.matrix, this.matrix);
    gl.uniform3f(this.loc.shadow, film.shadowTint[0], film.shadowTint[1], film.shadowTint[2]);
    gl.uniform3f(this.loc.high, film.highlightTint[0], film.highlightTint[1], film.highlightTint[2]);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return true;
  }

  noteFrame(gapMs: number) {
    if (gapMs > 100) return;
    const next = nextPreviewEdge(this.cap, gapMs, this.slow, this.fast);
    this.cap = next.edge;
    this.slow = next.slow;
    this.fast = next.fast;
  }

  destroy() {
    const gl = this.gl;
    gl.deleteProgram(this.program);
    gl.deleteTexture(this.sourceTex);
    gl.deleteBuffer(this.buffer);
    gl.deleteVertexArray(this.vao);
  }
}

function createCpuFinder(canvas: HTMLCanvasElement): Finder {
  const scratch = document.createElement("canvas");
  const scratchCtx = scratch.getContext("2d", { willReadFrequently: true });
  const out = canvas.getContext("2d", { alpha: false });
  return {
    draw(source, sourceWidth, sourceHeight, width, height, grade, zoom = 1) {
      if (!scratchCtx || !out || sourceWidth < 2 || sourceHeight < 2) return false;
      const size = fitBuffer(width, height, PREVIEW_MIN);
      const image = readSource(source, sourceWidth, sourceHeight, grade.mirror, 160, zoom);
      const optics = applyCamera(rawToFloat(rgba8ToRaw(image.data, image.width, image.height)), grade.camera, grade.ev);
      const rgba = applyFilm(optics, grade.film, { grain: false });
      scratch.width = optics.width;
      scratch.height = optics.height;
      scratchCtx.putImageData(toImageData(rgba, optics.width, optics.height), 0, 0);
      if (canvas.width !== size.width || canvas.height !== size.height) {
        canvas.width = size.width;
        canvas.height = size.height;
      }
      out.imageSmoothingEnabled = true;
      out.drawImage(scratch, 0, 0, size.width, size.height);
      return true;
    },
    noteFrame() {},
    destroy() {},
  };
}

function fitBuffer(width: number, height: number, cap: number) {
  const edge = Math.max(width, height);
  if (edge <= cap) return { width, height };
  const scale = cap / edge;
  return {
    width: Math.max(2, Math.round(width * scale)),
    height: Math.max(2, Math.round(height * scale)),
  };
}

function link(gl: WebGL2RenderingContext, vertex: string, fragment: string) {
  const program = gl.createProgram();
  const vs = compile(gl, gl.VERTEX_SHADER, vertex);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragment);
  if (!program || !vs || !fs) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}
