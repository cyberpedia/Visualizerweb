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
    };
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
      const key = `${text}|${color}|${size}`;
      const cached = textCache.get(key);
      if (cached) return cached;
      const off = document.createElement("canvas");
      const ctx = off.getContext("2d")!;
      ctx.font = `${size}px system-ui, -apple-system, Segoe UI, Roboto`;
      const metrics = ctx.measureText(text);
      const w = Math.max(2, Math.ceil(metrics.width) + 4);
      const h = Math.max(2, Math.ceil(size * 1.25));
      off.width = w;
      off.height = h;
      const ctx2 = off.getContext("2d")!;
      ctx2.font = `${size}px system-ui, -apple-system, Segoe UI, Roboto`;
      ctx2.fillStyle = color;
      ctx2.textBaseline = "top";
      ctx2.fillText(text, 0, 0);
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, off);
      const info = { tex, w, h };
      textCache.set(key, info);
      return info;
    };

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

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

      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

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

      // GPU overlays: album art and text + basic layers
      (async () => {
        const title = currentTrack?.name || "";
        const artist = currentTrack?.artist || "";

        // Album art
        if (template.showAlbumArt && currentTrack?.artUrl) {
          const texInfo = await makeTextureFromImage(currentTrack.artUrl);
          if (texInfo) {
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
          gl.useProgram(progTex);
          gl.bindBuffer(gl.ARRAY_BUFFER, bufTex);
          gl.bufferData(gl.ARRAY_BUFFER, quad, gl.DYNAMIC_DRAW);
          gl.enableVertexAttribArray(aPosTexLoc);
          gl.vertexAttribPointer(aPosTexLoc, 2, gl.FLOAT, false, 16, 0);
          gl.enableVertexAttribArray(aTexLoc);
          gl.vertexAttribPointer(aTexLoc, 2, gl.FLOAT, false, 16, 8);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, t.tex);
          gl.uniform1i(uSamplerLoc, 0);
          gl.uniform1f(uAlphaTexLoc, 1.0);
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
          gl.useProgram(progTex);
          gl.bindBuffer(gl.ARRAY_BUFFER, bufTex);
          gl.bufferData(gl.ARRAY_BUFFER, quad, gl.DYNAMIC_DRAW);
          gl.enableVertexAttribArray(aPosTexLoc);
          gl.vertexAttribPointer(aPosTexLoc, 2, gl.FLOAT, false, 16, 0);
          gl.enableVertexAttribArray(aTexLoc);
          gl.vertexAttribPointer(aTexLoc, 2, gl.FLOAT, false, 16, 8);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, t.tex);
          gl.uniform1i(uSamplerLoc, 0);
          gl.uniform1f(uAlphaTexLoc, 1.0);
          gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
        }

        // Layers (basic GPU support: text, image, rect/circle)
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
        for (const layer of layers as any[]) {
          if (!layer.visible) continue;
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
            gl.useProgram(progTex);
            gl.bindBuffer(gl.ARRAY_BUFFER, bufTex);
            gl.bufferData(gl.ARRAY_BUFFER, quad, gl.DYNAMIC_DRAW);
            gl.enableVertexAttribArray(aPosTexLoc);
            gl.vertexAttribPointer(aPosTexLoc, 2, gl.FLOAT, false, 16, 0);
            gl.enableVertexAttribArray(aTexLoc);
            gl.vertexAttribPointer(aTexLoc, 2, gl.FLOAT, false, 16, 8);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, tex.tex);
            gl.uniform1i(uSamplerLoc, 0);
            gl.uniform1f(uAlphaTexLoc, opacity);
            gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
          } else if (layer.type === "image") {
            const x = interpKF(layer.kf?.x, tSec, layer.x);
            const y = interpKF(layer.kf?.y, tSec, layer.y);
            const opacity = interpKF(layer.kf?.opacity, tSec, layer.opacity);
            const size = interpKF(layer.kf?.size, tSec, Math.max(layer.width, layer.height));
            const texInfo = await makeTextureFromImage(layer.src);
            if (!texInfo) continue;
            const w = layer.width ?? size;
            const h = layer.height ?? size;
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
            gl.uniform1f(uAlphaTexLoc, opacity);
            gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
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
          }
        }
      })();

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