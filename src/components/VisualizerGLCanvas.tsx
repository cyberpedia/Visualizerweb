import React, { useEffect, useRef } from "react";
import { usePlayerStore } from "../state/store";
import { audioEngine } from "../lib/audio";

function createShader(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn(gl.getShaderInfoLog(sh));
  }
  return sh;
}

function createProgram(gl: WebGLRenderingContext, vsSrc: string, fsSrc: string) {
  const vs = createShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn(gl.getProgramInfoLog(prog));
  }
  return prog;
}

// Bars program (points)
const VS_POINTS = `
attribute float aIndex;
uniform float uCount;
uniform float uWidth;
uniform float uHeight;
uniform float uBarWidth;
uniform float uScale;
uniform float uGap;
uniform float uAmplitude[256];
uniform float uDpr;
void main() {
  float i = aIndex;
  float x = (i * (uBarWidth + uGap)) + uBarWidth * 0.5;
  float amp = uAmplitude[int(i)];
  float h = amp * uScale;
  float y = uHeight - h;
  gl_Position = vec4(
    (x / uWidth) * 2.0 - 1.0,
    (y / uHeight) * -2.0 + 1.0,
    0.0, 1.0
  );
  gl_PointSize = uBarWidth * uDpr;
}
`;

const FS_POINTS = `
precision mediump float;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform float uHeight;
uniform float uAlpha;
void main() {
  float t = gl_FragCoord.y / uHeight;
  vec3 c = mix(uColor1, uColor2, t);
  gl_FragColor = vec4(c, uAlpha);
}
`;

// Color shader (for triangles/lines)
const FS_COLOR = `
precision mediump float;
uniform vec3 uColor;
uniform float uAlpha;
void main() {
  gl_FragColor = vec4(uColor, uAlpha);
}
`;

// Textured quad shader
const VS_TEX = `
attribute vec2 aPos;
attribute vec2 aTex;
varying vec2 vTex;
void main() {
  vTex = aTex;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const FS_TEX = `
precision mediump float;
varying vec2 vTex;
uniform sampler2D uTex;
uniform float uAlpha;
void main() {
  vec4 c = texture2D(uTex, vTex);
  gl_FragColor = vec4(c.rgb, c.a * uAlpha);
}
`;

// Textured quad with circle mask (pixel-space using gl_FragCoord)
const FS_TEX_MASK = `
precision mediump float;
varying vec2 vTex;
uniform sampler2D uTex;
uniform float uAlpha;
uniform vec2 uCenter; // pixels (framebuffer space)
uniform float uRadius; // pixels
void main() {
  vec4 c = texture2D(uTex, vTex);
  // gl_FragCoord origin is bottom-left
  vec2 frag = vec2(gl_FragCoord.x, gl_FragCoord.y);
  float d = distance(frag, uCenter);
  float m = smoothstep(uRadius + 1.5, uRadius - 1.5, d);
  gl_FragColor = vec4(c.rgb, c.a * uAlpha * m);
}
`;

// SDF text with circle mask
const FS_SDF_MASK = `
precision mediump float;
varying vec2 vTex;
uniform sampler2D uTex;
uniform vec3 uTextColor;
uniform float uAlpha;
uniform vec2 uCenter; // pixels
uniform float uRadius; // pixels
void main(){
  float dSdf = texture2D(uTex, vTex).a;
  float a = smoothstep(0.5 - 0.12, 0.5 + 0.12, dSdf);
  vec2 frag = vec2(gl_FragCoord.x, gl_FragCoord.y);
  float d = distance(frag, uCenter);
  float m = smoothstep(uRadius + 1.5, uRadius - 1.5, d);
  gl_FragColor = vec4(uTextColor, a * uAlpha * m);
}
`;

const VisualizerGLCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const analyzer = usePlayerStore((s) => s.analyzer);
  const template = usePlayerStore((s) => s.visualizerTemplate);
  const currentTrack = usePlayerStore((s) => s.playlist[s.currentIndex] ?? null);
  const setCanvasEl = usePlayerStore((s) => s.setCanvasEl);
  const exportActive = usePlayerStore((s) => s.exportActive);
  const exportSettings = usePlayerStore((s) => s.exportSettings);

  useEffect(() => {
    const canvas = canvasRef.current;
    setCanvasEl(canvas || null);
    if (!canvas || !analyzer) return;

    const gl = (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) {
      console.warn("WebGL not available; fallback to 2D renderer.");
      return;
    }

    let raf = 0;

    // FBO render targets
    let texScene: WebGLTexture | null = null;
    let fboScene: WebGLFramebuffer | null = null;
    let texPing: WebGLTexture | null = null;
    let fboPing: WebGLFramebuffer | null = null;
    let texPong: WebGLTexture | null = null;
    let fboPong: WebGLFramebuffer | null = null;

    // Layer offscreen and scratch compositing
    let texLayer: WebGLTexture | null = null;
    let fboLayer: WebGLFramebuffer | null = null;
    let texScratch: WebGLTexture | null = null;
    let fboScratch: WebGLFramebuffer | null = null;

    const makeRenderTarget = (w: number, h: number) => {
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

      const fbo = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      return { tex, fbo };
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      let dpr = Math.max(1, window.devicePixelRatio || 1);
      let width = rect.width;
      let height = rect.height;

      if (exportActive) {
        dpr = 1;
        if (exportSettings.mode === "1080p") { width = 1920; height = 1080; }
        else if (exportSettings.mode === "720p") { width = 1280; height = 720; }
        else if (exportSettings.mode === "custom" && exportSettings.width && exportSettings.height) {
          width = exportSettings.width; height = exportSettings.height;
        }
      }

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      (canvas.style as any).width = `${width}px`;
      (canvas.style as any).height = `${height}px`;
      gl.viewport(0, 0, canvas.width, canvas.height);

      // Allocate render targets
      const w = canvas.width, h = canvas.height;
      const rtScene = makeRenderTarget(w, h);
      texScene = rtScene.tex; fboScene = rtScene.fbo;
      const rtPing = makeRenderTarget(w, h);
      texPing = rtPing.tex; fboPing = rtPing.fbo;
      const rtPong = makeRenderTarget(w, h);
      texPong = rtPong.tex; fboPong = rtPong.fbo;

      const rtLayer = makeRenderTarget(w, h);
      texLayer = rtLayer.tex; fboLayer = rtLayer.fbo;
      const rtScratch = makeRenderTarget(w, h);
      texScratch = rtScratch.tex; fboScratch = rtScratch.fbo;
  _code  new}</;

    resize();

    const onResize = () => resize();
    window.addEventListener("resize", onResize);

    // Programs
    const progPoints = createProgram(gl, VS_POINTS, FS_POINTS);
    const progColor = createProgram(gl, `
attribute vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`, FS_COLOR);
    const progTex = createProgram(gl, VS_TEX, FS_TEX);

    // Background video support
    let videoEl: HTMLVideoElement | null = null;
    let videoTex: WebGLTexture | null = null;
    if (template.backgroundVideoUrl) {
      videoEl = document.createElement("video");
      videoEl.src = template.backgroundVideoUrl!;
      videoEl.muted = true;
      // @ts-ignore
      videoEl.playsInline = true;
      videoEl.loop = true;
      videoEl.crossOrigin = "anonymous";
      videoEl.autoplay = true;
      videoEl.addEventListener("error", () => {});
      videoEl.play().catch(() => {});
      videoTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, videoTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }

    // SDF text shader (crisp scalable text)
    const FS_SDF = `
precision mediump float;
varying vec2 vTex;
uniform sampler2D uTex;
uniform vec3 uTextColor;
uniform float uAlpha;
void main(){
  float d = texture2D(uTex, vTex).a; // signed distance mapped to 0..1
  // Smooth step around the 0.5 threshold; width tuned for edge softening
  float a = smoothstep(0.5 - 0.12, 0.5 + 0.12, d);
  gl_FragColor = vec4(uTextColor, a * uAlpha);
}
`;
    const progSDF = createProgram(gl, VS_TEX, FS_SDF);
    const progTexMask = createProgram(gl, VS_TEX, FS_TEX_MASK);
    const progSDFMask = createProgram(gl, VS_TEX, FS_SDF_MASK);

    // Fullscreen quad + postprocessing (blur + composite bloom)
    const VS_QUAD = `
attribute vec2 aPos;
attribute vec2 aTex;
varying vec2 vTex;
void main(){
  vTex = aTex;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;
    const FS_BLUR = `
precision mediump float;
varying vec2 vTex;
uniform sampler2D uTex;
uniform vec2 uTexel; // (1/width, 0) or (0, 1/height)
void main(){
  float w0 = 0.2270270270;
  float w1 = 0.1945945946;
  float w2 = 0.1216216216;
  float w3 = 0.0540540541;
  float w4 = 0.0162162162;
  vec4 sum = texture2D(uTex, vTex) * w0;
  sum += texture2D(uTex, vTex + uTexel * 1.0) * w1;
  sum += texture2D(uTex, vTex - uTexel * 1.0) * w1;
  sum += texture2D(uTex, vTex + uTexel * 2.0) * w2;
  sum += texture2D(uTex, vTex - uTexel * 2.0) * w2;
  sum += texture2D(uTex, vTex + uTexel * 3.0) * w3;
  sum += texture2D(uTex, vTex - uTexel * 3.0) * w3;
  sum += texture2D(uTex, vTex + uTexel * 4.0) * w4;
  sum += texture2D(uTex, vTex - uTexel * 4.0) * w4;
  gl_FragColor = sum;
}
`;
    const FS_COMPOSITE = `
precision mediump float;
varying vec2 vTex;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uIntensity;
void main(){
  vec4 scene = texture2D(uScene, vTex);
  vec4 bloom = texture2D(uBloom, vTex);
  vec3 color = scene.rgb + bloom.rgb * uIntensity;
  gl_FragColor = vec4(color, 1.0);
}
`;
    const progBlur = createProgram(gl, VS_QUAD, FS_BLUR);
    const progComposite = createProgram(gl, VS_QUAD, FS_COMPOSITE);

    const aIndexLoc = gl.getAttribLocation(progPoints, "aIndex");
    const uCountLoc = gl.getUniformLocation(progPoints, "uCount");
    const uWidthLoc = gl.getUniformLocation(progPoints, "uWidth");
    const uHeightLoc = gl.getUniformLocation(progPoints, "uHeight");
    const uBarWidthLoc = gl.getUniformLocation(progPoints, "uBarWidth");
    const uAmplitudeLoc = gl.getUniformLocation(progPoints, "uAmplitude[0]");
    const uColor1Loc = gl.getUniformLocation(progPoints, "uColor1");
    const uColor2Loc = gl.getUniformLocation(progPoints, "uColor2");
    const uAlphaPointsLoc = gl.getUniformLocation(progPoints, "uAlpha");
    const uDprLoc = gl.getUniformLocation(progPoints, "uDpr");

    const uColorLoc = gl.getUniformLocation(progColor, "uColor");
    const uAlphaColorLoc = gl.getUniformLocation(progColor, "uAlpha");

    const aPosTexLoc = gl.getAttribLocation(progTex, "aPos");
    const aTexLoc = gl.getAttribLocation(progTex, "aTex");
    const uAlphaTexLoc = gl.getUniformLocation(progTex, "uAlpha");
    const uSamplerLoc = gl.getUniformLocation(progTex, "uTex");

    // Masked texture uniforms
    const aPosTexMaskLoc = gl.getAttribLocation(progTexMask, "aPos");
    const aTexMaskLoc = gl.getAttribLocation(progTexMask, "aTex");
    const uAlphaTexMaskLoc = gl.getUniformLocation(progTexMask, "uAlpha");
    const uSamplerTexMaskLoc = gl.getUniformLocation(progTexMask, "uTex");
    const uCenterTexLoc = gl.getUniformLocation(progTexMask, "uCenter");
    const uRadiusTexLoc = gl.getUniformLocation(progTexMask, "uRadius");

    // SDF text locations
    const aPosSDFLoc = gl.getAttribLocation(progSDF, "aPos");
    const aTexSDFLoc = gl.getAttribLocation(progSDF, "aTex");
    const uSamplerSDFLoc = gl.getUniformLocation(progSDF, "uTex");
    const uTextColorLoc = gl.getUniformLocation(progSDF, "uTextColor");
    const uAlphaSDFLoc = gl.getUniformLocation(progSDF, "uAlpha");

    // Masked SDF uniforms
    const aPosSDFMaskLoc = gl.getAttribLocation(progSDFMask, "aPos");
    const aTexSDFMaskLoc = gl.getAttribLocation(progSDFMask, "aTex");
    const uSamplerSDFMaskLoc = gl.getUniformLocation(progSDFMask, "uTex");
    const uTextColorMaskLoc = gl.getUniformLocation(progSDFMask, "uTextColor");
    const uAlphaSDFMaskLoc = gl.getUniformLocation(progSDFMask, "uAlpha");
    const uCenterSDFLoc = gl.getUniformLocation(progSDFMask, "uCenter");
    const uRadiusSDFLoc = gl.getUniformLocation(progSDFMask, "uRadius");

    // Blur/composite locations
    const aPosQuadLoc = gl.getAttribLocation(progBlur, "aPos");
    const aTexQuadLoc = gl.getAttribLocation(progBlur, "aTex");
    const uTexBlurLoc = gl.getUniformLocation(progBlur, "uTex");
    const uTexelLoc = gl.getUniformLocation(progBlur, "uTexel");

    const aPosCompLoc = gl.getAttribLocation(progComposite, "aPos");
    const aTexCompLoc = gl.getAttribLocation(progComposite, "aTex");
    const uSceneLoc = gl.getUniformLocation(progComposite, "uScene");
    const uBloomLoc = gl.getUniformLocation(progComposite, "uBloom");
    const uIntensityLoc = gl.getUniformLocation(progComposite, "uIntensity");

    // Layer composite locations
    const aPosLCLoc = gl.getAttribLocation(progLayerComposite, "aPos");
    const aTexLCLoc = gl.getAttribLocation(prog");

    const count = Math.min(template.barCount ?? 64, 256);
    const indices = new Float32Array(count);
    for (let i = 0; i < count; i++) indices[i] = i;

    const bufPoints = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, bufPoints);
    gl.bufferData(gl.ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    const bufLines = gl.createBuffer()!;
    const bufWave = gl.createBuffer()!;
    const bufQuads = gl.createBuffer()!;
    const bufTex = gl.createBuffer()!;

    const bufQuad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, bufQuad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,
       1, -1,
       1,  1,
      -1,  1
    ]), gl.STATIC_DRAW);

    const bufQuadTex = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, bufQuadTex);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      0, 0,
      1, 0,
      1, 1,
      0, 1
    ]), gl.STATIC_DRAW);

    const freqArr = new Uint8Array(analyzer.frequencyBinCount);
    const timeArr = new Uint8Array(analyzer.fftSize);
    const prevArr = new Uint8Array(analyzer.frequencyBinCount);
    let pulse = 0;

    const fluxHist: number[] = [];
    let lastBeatT = 0;
    const beatIntervals: number[] = [];

    const hexToRGB = (hex: string) => {
      const h = parseInt(hex.slice(1), 16);
      const r = ((h >> 16) & 0xff) / 255;
      const g = ((h >> 8) & 0xff) / 255;
      const b = (h & 0xff) / 255;
      return [r, g, b] as [number, number, number];
    };

    const imageCache = new Map<string, { tex: WebGLTexture; w: number; h: number }>();
    const makeTextureFromImage = async (url?: string | null) => {
      if (!url) return null;
      const cached = imageCache.get(url);
      if (cached) return cached;
      return new Promise<{ tex: WebGLTexture; w: number; h: number } | null>((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          const tex = gl.createTexture()!;
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
          const info = { tex, w: img.width, h: img.height };
          imageCache.set(url!, info);
          resolve(info);
        };
        img.onerror = () => resolve(null);
        img.src = url!;
      });
    };

    const textCache = new Map<string, { tex: WebGLTexture; w: number; h: number }>();
    const makeTextureFromText = (text: string, color: string, size: number) => {
      const key = `${text}|${color}|${size}|sdf`;
      const cached = textCache.get(key);
      if (cached) return cached;

      // Render text to offscreen canvas
      const off = document.createElement("canvas");
      const ctx = off.getContext("2d")!;
      ctx.font = `${size}px system-ui, -apple-system, Segoe UI, Roboto`;
      const metrics = ctx.measureText(text);
      const w = Math.max(2, Math.ceil(metrics.width) + 8);
      const h = Math.max(2, Math.ceil(size * 1.35));
      off.width = w;
      off.height = h;
      const ctx2 = off.getContext("2d")!;
      ctx2.clearRect(0, 0, w, h);
      ctx2.font = `${size}px system-ui, -apple-system, Segoe UI, Roboto`;
      ctx2.fillStyle = "#ffffff";
      ctx2.textBaseline = "top";
      ctx2.fillText(text, 0, 0);

      // Extract alpha mask
      const img = ctx2.getImageData(0, 0, w, h);
      const a = new Uint8ClampedArray(w * h);
      for (let i = 0, j = 0; i < img.data.length; i += 4, j++) {
        a[j] = img.data[i + 3];
      }
      const threshold = 128;

      // Distance transform (inside/outside)
      const INF = 1e9;
      const inside = new Float32Array(w * h);
      const outside = new Float32Array(w * h);
      for (let i = 0; i < w * h; i++) {
        const on = a[i] >= threshold;
        inside[i] = on ? 0 : INF;
        outside[i] = on ? INF : 0;
      }
      const sqrt2 = Math.SQRT2;

      const upd = (arr: Float32Array, x: number, y: number, nx: number, ny: number, cost: number) => {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) return;
        const i = y * w + x;
        const j = ny * w + nx;
        const v = arr[j] + cost;
        if (v < arr[i]) arr[i] = v;
      };

      // Forward pass
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          upd(inside, x, y, x - 1, y, 1);
          upd(inside, x, y, x, y - 1, 1);
          upd(inside, x, y, x - 1, y - 1, sqrt2);
          upd(inside, x, y, x + 1, y - 1, sqrt2);

          upd(outside, x, y, x - 1, y, 1);
          upd(outside, x, y, x, y - 1, 1);
          upd(outside, x, y, x - 1, y - 1, sqrt2);
          upd(outside, x, y, x + 1, y - 1, sqrt2);
        }
      }

      // Backward pass
      for (let y = h - 1; y >= 0; y--) {
        for (let x = w - 1; x >= 0; x--) {
          upd(inside, x, y, x + 1, y, 1);
          upd(inside, x, y, x, y + 1, 1);
          upd(inside, x, y, x + 1, y + 1, sqrt2);
          upd(inside, x, y, x - 1, y + 1, sqrt2);

          upd(outside, x, y, x + 1, y, 1);
          upd(outside, x, y, x, y + 1, 1);
          upd(outside, x, y, x + 1, y + 1, sqrt2);
          upd(outside, x, y, x - 1, y + 1, sqrt2);
        }
      }

      // Signed distance mapped to [0,1] around 0.5
      const radius = Math.max(2, Math.floor(size * 0.15));
      const sdfData = new Uint8Array(w * h * 4);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = y * w + x;
          const sd = Math.sqrt(outside[idx]) - Math.sqrt(inside[idx]); // signed distance
          const v = Math.max(0, Math.min(1, 0.5 + sd / (radius * 2)));
          const u8 = Math.round(v * 255);
          const o = idx * 4;
          sdfData[o + 0] = 0;
          sdfData[o + 1] = 0;
          sdfData[o + 2] = 0;
          sdfData[o + 3] = u8;
        }
      }

      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, sdfData);

      const info = { tex, w, h };
      textCache.set(key, info);
      return info;
    };

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Helper: apply rect mask via scissor in framebuffer pixel space
    const applyRectMask = (mask: any | undefined, dpr: number) => {
      if (!mask || mask.type !== "rect") return false;
      const x = Math.floor(mask.x * dpr);
      const y = Math.floor(mask.y * dpr);
      const w = Math.floor(mask.width * dpr);
      const h = Math.floor(mask.height * dpr);
      gl.enable(gl.SCISSOR_TEST);
      // gl_FragCoord/scissor origin bottom-left: convert from top-left UI coords
      gl.scissor(x, canvas.height - (y + h), w, h);
      return true;
    };
    const endMask = () => {
      gl.disable(gl.SCISSOR_TEST);
    };

    const draw = () => {
      analyzer.getByteFrequencyData(freqArr);
      analyzer.getByteTimeDomainData(timeArr);

      // spectral flux
      let flux = 0;
      for (let i = 0; i < freqArr.length; i++) {
        const diff = freqArr[i] - prevArr[i];
        if (diff > 0) flux += diff;
        prevArr[i] = freqArr[i];
      }
      fluxHist.push(flux);
      if (fluxHist.length > 120) fluxHist.shift();
      const mean = fluxHist.reduce((a, b) => a + b, 0) / fluxHist.length;
      const variance = fluxHist.reduce((a, b) => a + (b - mean) * (b - mean), 0) / fluxHist.length;
      const std = Math.sqrt(variance);
      const threshold = mean + 1.8 * std;

      const nowSec = audioEngine.getCurrentTime();
      const minInterval = 0.25;
      if (flux > threshold && nowSec - lastBeatT > minInterval) {
        if (lastBeatT > 0) {
          beatIntervals.push(nowSec - lastBeatT);
          if (beatIntervals.length > 12) beatIntervals.shift();
        }
        lastBeatT = nowSec;
        pulse = 1;
      } else {
        pulse *= 0.92;
      }

      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;

      // Render scene to offscreen framebuffer
      gl.bindFramebuffer(gl.FRAMEBUFFER, fboScene);
      const bg = hexToRGB(template.background || "#0b1020");
      gl.clearColor(bg[0], bg[1], bg[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      // Draw background video if available
      if (videoEl && videoTex && videoEl.readyState >= 2) {
        gl.useProgram(progTex);
        gl.bindBuffer(gl.ARRAY_BUFFER, bufQuad);
        const aPosVideoLoc = gl.getAttribLocation(progTex, "aPos");
        gl.enableVertexAttribArray(aPosVideoLoc);
        gl.vertexAttribPointer(aPosVideoLoc, 2, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, bufQuadTex);
        const aTexVideoLoc = gl.getAttribLocation(progTex, "aTex");
        gl.enableVertexAttribArray(aTexVideoLoc);
        gl.vertexAttribPointer(aTexVideoLoc, 2, gl.FLOAT, false, 0, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, videoTex);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        try {
          // Update texture from current video frame
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, videoEl);
        } catch {}
        gl.uniform1i(uSamplerLoc, 0);
        gl.uniform1f(uAlphaTexLoc, 1.0);
        gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
      }

      const c1 = hexToRGB(template.color1 || "#6366f1");
      const c2 = hexToRGB(template.color2 || "#22d3ee");
      const glow = Math.max(0, template.glowStrength ?? 0);

      if (template.type === "bars") {
        const barWidth = Math.max(2, Math.floor(width / (count * 1.5)));
        const gap = Math.max(1, barWidth * 0.25);

        const amp = new Float32Array(256);
        for (let i = 0; i < count; i++) {
          const bin = Math.floor(i / count * freqArr.length);
          amp[i] = Math.max(1, (freqArr[bin] / 255) * (height * 0.6) * (1 + 0.2 * pulse));
        }

        // Glow pass (additive)
        if (glow > 0.01) {
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
          gl.useProgram(progPoints);
          gl.bindBuffer(gl.ARRAY_BUFFER, bufPoints);
          gl.enableVertexAttribArray(aIndexLoc);
          gl.vertexAttribPointer(aIndexLoc, 1, gl.FLOAT, false, 0, 0);
          gl.uniform1f(uCountLoc, count);
          gl.uniform1f(uWidthLoc, width);
          gl.uniform1f(uHeightLoc, height);
          gl.uniform1f(uBarWidthLoc, barWidth + glow * 2.0);
          gl.uniform1fv(uAmplitudeLoc, amp);
          gl.uniform3f(uColor1Loc, c1[0], c1[1], c1[2]);
          gl.uniform3f(uColor2Loc, c2[0], c2[1], c2[2]);
          gl.uniform1f(uAlphaPointsLoc, 0.35);
          gl.uniform1f(uDprLoc, dpr);
          gl.drawArrays(gl.POINTS, 0, count);
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        }

        // Base pass
        gl.useProgram(progPoints);
        gl.bindBuffer(gl.ARRAY_BUFFER, bufPoints);
        gl.enableVertexAttribArray(aIndexLoc);
        gl.vertexAttribPointer(aIndexLoc, 1, gl.FLOAT, false, 0, 0);
        gl.uniform1f(uCountLoc, count);
        gl.uniform1f(uWidthLoc, width);
        gl.uniform1f(uHeightLoc, height);
        gl.uniform1f(uBarWidthLoc, barWidth);
        gl.uniform1fv(uAmplitudeLoc, amp);
        gl.uniform3f(uColor1Loc, c1[0], c1[1], c1[2]);
        gl.uniform3f(uColor2Loc, c2[0], c2[1], c2[2]);
        gl.uniform1f(uAlphaPointsLoc, 1.0);
        gl.uniform1f(uDprLoc, dpr);
        gl.drawArrays(gl.POINTS, 0, count);
      } else if (template.type === "circle") {
        const radius = template.circle?.radius ?? 160;
        const thick = Math.max(1, template.circle?.thickness ?? 4);
        const cx = width / 2;
        const cy = height / 2;
        const dAng = (Math.PI * 2) / count;
        const verts = new Float32Array(count * 6 * 2); // two triangles per segment, 3 vertices each (x,y)
        let off = 0;
        for (let i = 0; i < count; i++) {
          const ang = i * dAng;
          const bin = Math.floor(i / count * freqArr.length);
          const amp = (freqArr[bin] / 255) * (radius * 0.5) * (1 + 0.2 * pulse);
          const r1 = radius;
          const r2 = radius + amp;

          const xA = cx + Math.cos(ang) * r1;
          const yA = cy + Math.sin(ang) * r1;
          const xB = cx + Math.cos(ang) * r2;
          const yB = cy + Math.sin(ang) * r2;
          const xC = cx + Math.cos(ang + dAng * 0.9) * r2;
          const yC = cy + Math.sin(ang + dAng * 0.9) * r2;
          const xD = cx + Math.cos(ang + dAng * 0.9) * r1;
          const yD = cy + Math.sin(ang + dAng * 0.9) * r1;

          // Triangle AB C and A C D
          const push = (x: number, y: number) => {
            verts[off++] = (x / width) * 2 - 1;
            verts[off++] = (y / height) * -2 + 1;
          };
          push(xA, yA); push(xB, yB); push(xC, yC);
          push(xA, yA); push(xC, yC); push(xD, yD);
        }
        gl.useProgram(progColor);
        gl.bindBuffer(gl.ARRAY_BUFFER, bufLines);
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
        const aPosLoc = gl.getAttribLocation(progColor, "aPos");
        gl.enableVertexAttribArray(aPosLoc);
        gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);

        // Glow pass (additive)
        if (glow > 0.01) {
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
          gl.uniform3f(uColorLoc, c1[0], c1[1], c1[2]);
          gl.uniform1f(uAlphaColorLoc, 0.25);
          gl.drawArrays(gl.TRIANGLES, 0, count * 6);
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        }

        // Base pass
        gl.uniform3f(uColorLoc, c1[0], c1[1], c1[2]);
        gl.uniform1f(uAlphaColorLoc, 1.0);
        gl.drawArrays(gl.TRIANGLES, 0, count * 6);
      } else {
        // waveform (thick line via triangle strip)
        const samples = Math.min(timeArr.length, Math.floor(width));
        const thickness = Math.max(1, (template.waveform?.thickness ?? 2)) + glow * 0.5;
        const verts = new Float32Array(samples * 4); // x,y top and x,y bottom
        for (let i = 0; i < samples; i++) {
          const t = i / samples;
          const x = t * width;
          const v = Math.max(0, Math.min(255, timeArr[Math.floor(t * timeArr.length)]));
          const y = (v / 255) * height;
          const yTop = y - thickness;
          const yBot = y + thickness;
          const idx = i * 4;
          verts[idx + 0] = (x / width) * 2 - 1;
          verts[idx + 1] = (yTop / height) * -2 + 1;
          verts[idx + 2] = (x / width) * 2 - 1;
          verts[idx + 3] = (yBot / height) * -2 + 1;
        }
        gl.useProgram(progColor);
        gl.bindBuffer(gl.ARRAY_BUFFER, bufWave);
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
        const aPosLoc = gl.getAttribLocation(progColor, "aPos");
        gl.enableVertexAttribArray(aPosLoc);
        gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);

        // Glow pass
        if (glow > 0.01) {
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
          gl.uniform3f(uColorLoc, c1[0], c1[1], c1[2]);
          gl.uniform1f(uAlphaColorLoc, 0.25);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, samples * 2);
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        }

        // Base pass
        gl.uniform3f(uColorLoc, c2[0], c2[1], c2[2]);
        gl.uniform1f(uAlphaColorLoc, 1.0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, samples * 2);
      }

      // GPU overlays: album art and text + basic layers (sync using caches)
      const title = currentTrack?.name || "";
      const artist = currentTrack?.artist || "";

      // Album art
      if (template.showAlbumArt && currentTrack?.artUrl) {
        const texInfo = imageCache.get(currentTrack.artUrl) || null;
        if (!texInfo) {
          // trigger async load
          void makeTextureFromImage(currentTrack.artUrl);
        } else {
          const size = template.albumArtSize ?? 96;
          const x = 16, y = 16;
          const w = size, h = size;
          const quad = new Float32Array([
            (x / width) * 2 - 1, (y / height) * -2 + 1, 0, 0,
            ((x + w) / width) * 2 - 1, (y / height) * -2 + 1, 1, 0,
            ((x + w) / width) * 2 - 1, ((y + h) / height) * -2 + 1, 1, 1,
            (x / width) * 2 - 1, ((y + h) / height) * -2 + 1, 0, 1
          ]);
          gl.useProgram(progTex);
          gl.bindBuffer(gl.ARRAY_BUFFER, bufTex);
          gl.bufferData(gl.ARRAY_BUFFER, quad, gl.DYNAMIC_DRAW);
          gl.enableVertexAttribArray(aPosTexLoc);
          gl.vertexAttribPointer(aPosTexLoc, 2, gl.FLOAT, false, 16, 0);
          gl.enableVertexAttribArray(aTexLoc);
          gl.vertexAttribPointer(aTexLoc, 2, gl.FLOAT, false, 16, 8);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, texInfo.tex);
          gl.uniform1i(uSamplerLoc, 0);
          gl.uniform1f(uAlphaTexLoc, 1.0);
          gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
        }
      }

      // Title and artist
      if (template.titleOverlay?.show && title) {
        const t = makeTextureFromText(title, template.titleOverlay.color, template.titleOverlay.size);
        const x = template.titleOverlay.x, y = template.titleOverlay.y;
        const w = t.w, h = t.h;
        const quad = new Float32Array([
          (x / width) * 2 - 1, (y / height) * -2 + 1, 0, 0,
          ((x + w) / width) * 2 - 1, (y / height) * -2 + 1, 1, 0,
          ((x + w) / width) * 2 - 1, ((y + h) / height) * -2 + 1, 1, 1,
          (x / width) * 2 - 1, ((y + h) / height) * -2 + 1, 0, 1
        ]);
        const col = hexToRGB(template.titleOverlay.color ?? "#ffffff");
        gl.useProgram(progSDF);
        gl.bindBuffer(gl.ARRAY_BUFFER, bufTex);
        gl.bufferData(gl.ARRAY_BUFFER, quad, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(aPosSDFLoc);
        gl.vertexAttribPointer(aPosSDFLoc, 2, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(aTexSDFLoc);
        gl.vertexAttribPointer(aTexSDFLoc, 2, gl.FLOAT, false, 16, 8);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, t.tex);
        gl.uniform1i(uSamplerSDFLoc, 0);
        gl.uniform3f(uTextColorLoc, col[0], col[1], col[2]);
        gl.uniform1f(uAlphaSDFLoc, 1.0);
        gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
      }
      if (template.artistOverlay?.show && artist) {
        const t = makeTextureFromText(artist, template.artistOverlay.color, template.artistOverlay.size);
        const x = template.artistOverlay.x, y = template.artistOverlay.y;
        const w = t.w, h = t.h;
        const quad = new Float32Array([
          (x / width) * 2 - 1, (y / height) * -2 + 1, 0, 0,
          ((x + w) / width) * 2 - 1, (y / height) * -2 + 1, 1, 0,
          ((x + w) / width) * 2 - 1, ((y + h) / height) * -2 + 1, 1, 1,
          (x / width) * 2 - 1, ((y + h) / height) * -2 + 1, 0, 1
        ]);
        const col = hexToRGB(template.artistOverlay.color ?? "#cbd5e1");
        gl.useProgram(progSDF);
        gl.bindBuffer(gl.ARRAY_BUFFER, bufTex);
        gl.bufferData(gl.ARRAY_BUFFER, quad, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(aPosSDFLoc);
        gl.vertexAttribPointer(aPosSDFLoc, 2, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(aTexSDFLoc);
        gl.vertexAttribPointer(aTexSDFLoc, 2, gl.FLOAT, false, 16, 8);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, t.tex);
        gl.uniform1i(uSamplerSDFLoc, 0);
        gl.uniform3f(uTextColorLoc, col[0], col[1], col[2]);
        gl.uniform1f(uAlphaSDFLoc, 1.0);
        gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
      }

      // Layers (basic GPU support: text, image, rect/circle, progress ring, particles)
      const layers = (template.layers ?? []).slice().sort((a, b) => a.zIndex - b.zIndex);
      const interpKF = (kf: any[] | undefined, t: number, base: number) => {
        if (!kf || kf.length === 0) return base;
        const sorted = kf.slice().sort((a, b) => a.time - b.time);
        if (t <= sorted[0].time) return sorted[0].value;
        if (t >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1].value;
        for (let i = 0; i < sorted.length - 1; i++) {
          const a = sorted[i], b = sorted[i + 1];
          if (t >= a.time && t <= b.time) {
            const tt = (t - a.time) / (b.time - a.time);
            const ease = a.easing ?? "linear";
            const e = ease === "easeIn" ? tt * tt : ease === "easeOut" ? tt * (2 - tt) : ease === "easeInOut" ? (tt < 0.5 ? 2 * tt * tt : -1 + (4 - 2 * tt) * tt) : tt;
            return a.value + (b.value - a.value) * e;
          }
        }
        return base;
      };

      const tSec = nowSec;
      const layerParticles = new Map<string, { x: number; y: number }[]>();
      const setBlendForMode = (mode: string | undefined) => {
        if (mode === "lighter") {
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // additive
        } else {
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); // default
        }
      };

      for (const layer of layers as any[]) {
        if (!layer.visible) continue;
        setBlendForMode(layer.blendMode);
        if (layer.type === "text") {
          const x = interpKF(layer.kf?.x, tSec, layer.x);
          const y = interpKF(layer.kf?.y, tSec, layer.y);
          const opacity = interpKF(layer.kf?.opacity, tSec, layer.opacity);
          const size = interpKF(layer.kf?.size, tSec, layer.size);
          const tex = makeTextureFromText(layer.text, layer.color, size);
          const quad = new Float32Array([
            (x / width) * 2 - 1, (y / height) * -2 + 1, 0, 0,
            ((x + tex.w) / width) * 2 - 1, (y / height) * -2 + 1, 1, 0,
            ((x + tex.w) / width) * 2 - 1, ((y + tex.h) / height) * -2 + 1, 1, 1,
            (x / width) * 2 - 1, ((y + tex.h) / height) * -2 + 1, 0, 1
          ]);
          const col = hexToRGB(layer.color || "#ffffff");
          const isCircleMask = layer.mask && layer.mask.type === "circle";
          const appliedRect = applyRectMask(layer.mask, dpr);
          const specialBlend = layer.blendMode === "multiply" || layer.blendMode === "screen";

          // Choose target framebuffer
          if (specialBlend) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, fboLayer);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
          }

          if (isCircleMask) {
            const cx = Math.floor(layer.mask.x * dpr);
            const cy = Math.floor((height - layer.mask.y) * dpr); // convert top-left to bottom-left origin
            const rad = Math.max(1, Math.floor(layer.mask.radius * dpr));

            gl.useProgram(progSDFMask);
            gl.bindBuffer(gl.ARRAY_BUFFER, bufTex);
            gl.bufferData(gl.ARRAY_BUFFER, quad, gl.DYNAMIC_DRAW);
            gl.enableVertexAttribArray(aPosSDFMaskLoc);
            gl.vertexAttribPointer(aPosSDFMaskLoc, 2, gl.FLOAT, false, 16, 0);
            gl.enableVertexAttribArray(aTexSDFMaskLoc);
            gl.vertexAttribPointer(aTexSDFMaskLoc, 2, gl.FLOAT, false, 16, 8);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, tex.tex);
            gl.uniform1i(uSamplerSDFMaskLoc, 0);
            gl.uniform3f(uTextColorMaskLoc, col[0], col[1], col[2]);
            gl.uniform1f(uAlphaSDFMaskLoc, opacity);
            gl.uniform2f(uCenterSDFLoc, cx, cy);
            gl.uniform1f(uRadiusSDFLoc, rad);
            gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
          } else {
            gl.useProgram(progSDF);
            gl.bindBuffer(gl.ARRAY_BUFFER, bufTex);
            gl.bufferData(gl.ARRAY_BUFFER, quad, gl.DYNAMIC_DRAW);
            gl.enableVertexAttribArray(aPosSDFLoc);
            gl.vertexAttribPointer(aPosSDFLoc, 2, gl.FLOAT, false, 16, 0);
            gl.enableVertexAttribArray(aTexSDFLoc);
            gl.vertexAttribPointer(aTexSDFLoc, 2, gl.FLOAT, false, 16, 8);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, tex.tex);
            gl.uniform1i(uSamplerSDFLoc, 0);
            gl.uniform3f(uTextColorLoc, col[0], col[1], col[2]);
            gl.uniform1f(uAlphaSDFLoc, opacity);
            gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
          }
          if (appliedRect) endMask();

          if (specialBlend) {
            // composite layer texture over scene according to mode
            gl.bindFramebuffer(gl.FRAMEBUFFER, fboScratch);
            gl.useProgram(progLayerComposite);
            gl.bindBuffer(gl.ARRAY_BUFFER, bufQuad);
            gl.enableVertexAttribArray(aPosLCLoc);
            gl.vertexAttribPointer(aPosLCLoc, 2, gl.FLOAT, false, 0, 0);
            gl.bindBuffer(gl.ARRAY_BUFFER, bufQuadTex);
            gl.enableVertexAttribArray(aTexLCLoc);
            gl.vertexAttribPointer(aTexLCLoc, 2, gl.FLOAT, false, 0, 0);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, texScene!);
            gl.uniform1i(uSceneLCLoc, 0);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, texLayer!);
            gl.uniform1i(uLayerLCLoc, 1);
            gl.uniform1i(uModeLCLoc, layer.blendMode === "multiply" ? 1 : 2);
            gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

            // swap scratch into scene
            const tTmp = texScene; texScene = texScratch; texScratch = tTmp;
            const fTmp = fboScene; fboScene = fboScratch; fboScratch = fTmp;

            // continue rendering to scene
            gl.bindFramebuffer(gl.FRAMEBUFFER, fboScene);
          }
        } else if (layer.type === "image") {
          const x = interpKF(layer.kf?.x, tSec, layer.x);
          const y = interpKF(layer.kf?.y, tSec, layer.y);
          const opacity = interpKF(layer.kf?.opacity, tSec, layer.opacity);
          const size = interpKF(layer.kf?.size, tSec, Math.max(layer.width, layer.height));
          const texInfo = imageCache.get(layer.src) || null;
          if (!texInfo) {
            void makeTextureFromImage(layer.src);
            continue;
          }
          const w = layer.width ?? size;
          const h = layer.height ?? size;
          const quad = new Float32Array([
            (x / width) * 2 - 1, (y / height) * -2 + 1, 0, 0,
            ((x + w) / width) * 2 - 1, (y / height) * -2 + 1, 1, 0,
            ((x + w) / width) * 2 - 1, ((y + h) / height) * -2 + 1, 1, 1,
            (x / width) * 2 - 1, ((y + h) / height) * -2 + 1, 0, 1
          ]);

          const isCircleMask = layer.mask && layer.mask.type === "circle";
          const appliedRect = applyRectMask(layer.mask, dpr);
          const specialBlend = layer.blendMode === "multiply" || layer.blendMode === "screen";
          if (specialBlend) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, fboLayer);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
          }

          if (isCircleMask) {
            const cx = Math.floor(layer.mask.x * dpr);
            const cy = Math.floor((height - layer.mask.y) * dpr);
            const rad = Math.max(1, Math.floor(layer.mask.radius * dpr));

            gl.useProgram(progTexMask);
            gl.bindBuffer(gl.ARRAY_BUFFER, bufTex);
            gl.bufferData(gl.ARRAY_BUFFER, quad, gl.DYNAMIC_DRAW);
            gl.enableVertexAttribArray(aPosTexMaskLoc);
            gl.vertexAttribPointer(aPosTexMaskLoc, 2, gl.FLOAT, false, 16, 0);
            gl.enableVertexAttribArray(aTexMaskLoc);
            gl.vertexAttribPointer(aTexMaskLoc, 2, gl.FLOAT, false, 16, 8);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, texInfo.tex);
            gl.uniform1i(uSamplerTexMaskLoc, 0);
            gl.uniform1f(uAlphaTexMaskLoc, opacity);
            gl.uniform2f(uCenterTexLoc, cx, cy);
            gl.uniform1f(uRadiusTexLoc, rad);
            gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
          } else {
            gl.useProgram(progTex);
            gl.bindBuffer(gl.ARRAY_BUFFER, bufTex);
            gl.bufferData(gl.ARRAY_BUFFER, quad, gl.DYNAMIC_DRAW);
            gl.enableVertexAttribArray(aPosTexLoc);
            gl.vertexAttribPointer(aPosTexLoc, 2, gl.FLOAT, false, 16, 0);
            gl.enableVertexAttribArray(aTexLoc);
            gl.vertexAttribPointer(aTexLoc, 2, gl.FLOAT, false, 16, 8);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, texInfo.tex);
            gl.uniform1i(uSamplerLoc, 0);
            gl.uniform1f(uAlphaTexLoc, opacity);
            gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
          }
          if (appliedRect) endMask();

          if (specialBlend) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, fboScratch);
            gl.useProgram(progLayerComposite);
            gl.bindBuffer(gl.ARRAY_BUFFER, bufQuad);
            gl.enableVertexAttribArray(aPosLCLoc);
            gl.vertexAttribPointer(aPosLCLoc, 2, gl.FLOAT, false, 0, 0);
            gl.bindBuffer(gl.ARRAY_BUFFER, bufQuadTex);
            gl.enableVertexAttribArray(aTexLCLoc);
            gl.vertexAttribPointer(aTexLCLoc, 2, gl.FLOAT, false, 0, 0);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, texScene!);
            gl.uniform1i(uSceneLCLoc, 0);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, texLayer!);
            gl.uniform1i(uLayerLCLoc, 1);
            gl.uniform1i(uModeLCLoc, layer.blendMode === "multiply" ? 1 : 2);
            gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

            const tTmp = texScene; texScene = texScratch; texScratch = tTmp;
            const fTmp = fboScene; fboScene = fboScratch; fboScratch = fTmp;
            gl.bindFramebuffer(gl.FRAMEBUFFER, fboScene);
          }
        } else if (layer.type === "shape") {
          const x = interpKF(layer.kf?.x, tSec, layer.x);
          const y = interpKF(layer.kf?.y, tSec, layer.y);
          const opacity = interpKF(layer.kf?.opacity, tSec, layer.opacity);
          if (layer.shape === "rect") {
            const w = layer.width ?? 100;
            const h = layer.height ?? 50;
            const quad = new Float32Array([
              (x / width) * 2 - 1, (y / height) * -2 + 1,
              ((x + w) / width) * 2 - 1, (y / height) * -2 + 1,
              ((x + w) / width) * 2 - 1, ((y + h) / height) * -2 + 1,
              (x / width) * 2 - 1, ((y + h) / height) * -2 + 1
            ]);
            gl.useProgram(progColor);
            gl.bindBuffer(gl.ARRAY_BUFFER, bufQuads);
            gl.bufferData(gl.ARRAY_BUFFER, quad, gl.DYNAMIC_DRAW);
            const aPosLoc2 = gl.getAttribLocation(progColor, "aPos");
            gl.enableVertexAttribArray(aPosLoc2);
            gl.vertexAttribPointer(aPosLoc2, 2, gl.FLOAT, false, 0, 0);
            const col = hexToRGB(layer.fillColor || "#ffffff");
            gl.uniform3f(uColorLoc, col[0], col[1], col[2]);
            gl.uniform1f(uAlphaColorLoc, opacity);
            gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
          } else if (layer.shape === "circle") {
            const r = layer.radius ?? 40;
            const steps = 32;
            const verts = new Float32Array(steps * 2);
            for (let i = 0; i < steps; i++) {
              const ang = (i / steps) * Math.PI * 2;
              const px = x + Math.cos(ang) * r;
              const py = y + Math.sin(ang) * r;
              verts[i * 2 + 0] = (px / width) * 2 - 1;
              verts[i * 2 + 1] = (py / height) * -2 + 1;
            }
            gl.useProgram(progColor);
            gl.bindBuffer(gl.ARRAY_BUFFER, bufQuads);
            gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
            const aPosLoc2 = gl.getAttribLocation(progColor, "aPos");
            gl.enableVertexAttribArray(aPosLoc2);
            gl.vertexAttribPointer(aPosLoc2, 2, gl.FLOAT, false, 0, 0);
            const col = hexToRGB(layer.fillColor || "#ffffff");
            gl.uniform3f(uColorLoc, col[0], col[1], col[2]);
            gl.uniform1f(uAlphaColorLoc, opacity);
            gl.drawArrays(gl.TRIANGLE_FAN, 0, steps);
          }
        } else if (layer.type === "progressRing") {
          const x = interpKF(layer.kf?.x, tSec, layer.x);
          const y = interpKF(layer.kf?.y, tSec, layer.y);
          const opacity = interpKF(layer.kf?.opacity, tSec, layer.opacity);
          const radius = interpKF(layer.kf?.size, tSec, layer.radius);
          const thick = layer.thickness ?? 8;
          const duration = (currentTrack?.duration || 0);
          const prog = duration > 0 ? Math.min(1, Math.max(0, tSec / duration)) : 0;
          const segments = Math.max(8, Math.floor(prog * 64));
          const verts = new Float32Array(segments * 6 * 2);
          let off = 0;
          for (let i = 0; i < segments; i++) {
            const a0 = (i / 64) * Math.PI * 2 - Math.PI / 2;
            const a1 = ((i + 1) / 64) * Math.PI * 2 - Math.PI / 2;
            const r1 = radius;
            const r2 = radius + thick;
            const push = (px: number, py: number) => {
              verts[off++] = (px / width) * 2 - 1;
              verts[off++] = (py / height) * -2 + 1;
            };
            push(x + Math.cos(a0) * r1, y + Math.sin(a0) * r1);
            push(x + Math.cos(a0) * r2, y + Math.sin(a0) * r2);
            push(x + Math.cos(a1) * r2, y + Math.sin(a1) * r2);
            push(x + Math.cos(a0) * r1, y + Math.sin(a0) * r1);
            push(x + Math.cos(a1) * r2, y + Math.sin(a1) * r2);
            push(x + Math.cos(a1) * r1, y + Math.sin(a1) * r1);
          }
          const col = hexToRGB(layer.color1 || "#ffffff");
          const specialBlend = layer.blendMode === "multiply" || layer.blendMode === "screen";
          if (specialBlend) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, fboLayer);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
          }
          gl.useProgram(progColor);
          gl.bindBuffer(gl.ARRAY_BUFFER, bufQuads);
          gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
          const aPosLoc2 = gl.getAttribLocation(progColor, "aPos");
          gl.enableVertexAttribArray(aPosLoc2);
          gl.vertexAttribPointer(aPosLoc2, 2, gl.FLOAT, false, 0, 0);
          gl.uniform3f(uColorLoc, col[0], col[1], col[2]);
          gl.uniform1f(uAlphaColorLoc, opacity);
          gl.drawArrays(gl.TRIANGLES, 0, segments * 6);

          if (specialBlend) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, fboScratch);
            gl.useProgram(progLayerComposite);
            gl.bindBuffer(gl.ARRAY_BUFFER, bufQuad);
            gl.enableVertexAttribArray(aPosLCLoc);
            gl.vertexAttribPointer(aPosLCLoc, 2, gl.FLOAT, false, 0, 0);
            gl.bindBuffer(gl.ARRAY_BUFFER, bufQuadTex);
            gl.enableVertexAttribArray(aTexLCLoc);
            gl.vertexAttribPointer(aTexLCLoc, 2, gl.FLOAT, false, 0, 0);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, texScene!);
            gl.uniform1i(uSceneLCLoc, 0);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, texLayer!);
            gl.uniform1i(uLayerLCLoc, 1);
            gl.uniform1i(uModeLCLoc, layer.blendMode === "multiply" ? 1 : 2);
            gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

            const tTmp = texScene; texScene = texScratch; texScratch = tTmp;
            const fTmp = fboScene; fboScene = fboScratch; fboScratch = fTmp;
            gl.bindFramebuffer(gl.FRAMEBUFFER, fboScene);
          }
        } else if (layer.type === "particles") {
          const key = layer.id || `p_${Math.random()}`;
          let parts = layerParticles.get(key);
          const count = layer.count;
          const speed = layer.speed * (1 + 0.5 * (pulse || 0));
          if (!parts) {
            parts = Array.from({ length: count }, () => ({ x: Math.random() * width, y: Math.random() * height }));
            layerParticles.set(key, parts);
          }
          const positions = new Float32Array(count * 2);
          for (let i = 0; i < count; i++) {
            const p = parts[i];
            p.y -= speed;
            if (p.y < -10) p.y = height + 10;
            positions[i * 2 + 0] = (p.x / width) * 2 - 1;
            positions[i * 2 + 1] = (p.y / height) * -2 + 1;
          }

          const specialBlend = layer.blendMode === "multiply" || layer.blendMode === "screen";
          if (specialBlend) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, fboLayer);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
          }

          gl.useProgram(progColor);
          gl.bindBuffer(gl.ARRAY_BUFFER, bufQuads);
          gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
          const aPosLoc2 = gl.getAttribLocation(progColor, "aPos");
          gl.enableVertexAttribArray(aPosLoc2);
          gl.vertexAttribPointer(aPosLoc2, 2, gl.FLOAT, false, 0, 0);
          const col = hexToRGB(layer.color || "#ffffff");
          gl.uniform3f(uColorLoc, col[0], col[1], col[2]);
          gl.uniform1f(uAlphaColorLoc, layer.opacity ?? 0.8);
          gl.drawArrays(gl.POINTS, 0, count);

          if (specialBlend) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, fboScratch);
            gl.useProgram(progLayerComposite);
            gl.bindBuffer(gl.ARRAY_BUFFER, bufQuad);
            gl.enableVertexAttribArray(aPosLCLoc);
            gl.vertexAttribPointer(aPosLCLoc, 2, gl.FLOAT, false, 0, 0);
            gl.bindBuffer(gl.ARRAY_BUFFER, bufQuadTex);
            gl.enableVertexAttribArray(aTexLCLoc);
            gl.vertexAttribPointer(aTexLCLoc, 2, gl.FLOAT, false, 0, 0);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, texScene!);
            gl.uniform1i(uSceneLCLoc, 0);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, texLayer!);
            gl.uniform1i(uLayerLCLoc, 1);
            gl.uniform1i(uModeLCLoc, layer.blendMode === "multiply" ? 1 : 2);
            gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

            const tTmp = texScene; texScene = texScratch; texScratch = tTmp;
            const fTmp = fboScene; fboScene = fboScratch; fboScratch = fTmp;
            gl.bindFramebuffer(gl.FRAMEBUFFER, fboScene);
          }
        }
      }

      // Post-process bloom blur and composite to screen
      gl.disable(gl.BLEND);

      // Horizontal blur: scene -> ping
      gl.bindFramebuffer(gl.FRAMEBUFFER, fboPing);
      gl.useProgram(progBlur);
      gl.bindBuffer(gl.ARRAY_BUFFER, bufQuad);
      gl.enableVertexAttribArray(aPosQuadLoc);
      gl.vertexAttribPointer(aPosQuadLoc, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, bufQuadTex);
      gl.enableVertexAttribArray(aTexQuadLoc);
      gl.vertexAttribPointer(aTexQuadLoc, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texScene!);
      gl.uniform1i(uTexBlurLoc, 0);
      gl.uniform2f(uTexelLoc, 1 / canvas.width, 0);
      gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

      // Vertical blur: ping -> pong
      gl.bindFramebuffer(gl.FRAMEBUFFER, fboPong);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texPing!);
      gl.uniform1i(uTexBlurLoc, 0);
      gl.uniform2f(uTexelLoc, 0, 1 / canvas.height);
      gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

      // Composite to default framebuffer
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.useProgram(progComposite);
      gl.bindBuffer(gl.ARRAY_BUFFER, bufQuad);
      gl.enableVertexAttribArray(aPosCompLoc);
      gl.vertexAttribPointer(aPosCompLoc, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, bufQuadTex);
      gl.enableVertexAttribArray(aTexCompLoc);
      gl.vertexAttribPointer(aTexCompLoc, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texScene!);
      gl.uniform1i(uSceneLoc, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, texPong!);
      gl.uniform1i(uBloomLoc, 1);
      const bloomIntensity = Math.min(1.5, (template.glowStrength ?? 0) / 12);
      gl.uniform1f(uIntensityLoc, bloomIntensity);
      gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [analyzer, template.renderer, template.type, template.color1, template.color2, template.glowStrength, template.titleOverlay?.show, template.artistOverlay?.show, exportActive, exportSettings.mode, exportSettings.width, exportSettings.height]);

  return (
    <div className="canvas-container h-[55vh] md:h-[60vh] lg:h-[65vh] xl:h-[70vh]">
      <canvas ref={canvasRef} className="w-full h-full block" />
      <div className="absolute bottom-3 left-3 text-sm text-gray-300/80">
        {currentTrack ? currentTrack.name : "No track selected"}
      </div>
    </div>
  );
};

export default VisualizerGLCanvas;