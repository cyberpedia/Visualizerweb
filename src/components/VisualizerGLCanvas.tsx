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

const VS = `
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

const FS = `
precision mediump float;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform float uHeight;
uniform float uScale;
void main() {
  float t = gl_FragCoord.y / uHeight;
  vec3 c = mix(uColor1, uColor2, t);
  gl_FragColor = vec4(c, 1.0);
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

    const prog = createProgram(gl, VS, FS);
    gl.useProgram(prog);

    const aIndexLoc = gl.getAttribLocation(prog, "aIndex");
    const uCountLoc = gl.getUniformLocation(prog, "uCount");
    const uWidthLoc = gl.getUniformLocation(prog, "uWidth");
    const uHeightLoc = gl.getUniformLocation(prog, "uHeight");
    const uBarWidthLoc = gl.getUniformLocation(prog, "uBarWidth");
    const uScaleLoc = gl.getUniformLocation(prog, "uScale");
    const uGapLoc = gl.getUniformLocation(prog, "uGap");
    const uAmplitudeLoc = gl.getUniformLocation(prog, "uAmplitude[0]");
    const uColor1Loc = gl.getUniformLocation(prog, "uColor1");
    const uColor2Loc = gl.getUniformLocation(prog, "uColor2");
    const uDprLoc = gl.getUniformLocation(prog, "uDpr");

    const count = Math.min(template.barCount ?? 64, 256);
    const indices = new Float32Array(count);
    for (let i = 0; i < count; i++) indices[i] = i;

    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    gl.enableVertexAttribArray(aIndexLoc);
    gl.vertexAttribPointer(aIndexLoc, 1, gl.FLOAT, false, 0, 0);

    const freqArr = new Uint8Array(analyzer.frequencyBinCount);
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

    const draw = () => {
      analyzer.getByteFrequencyData(freqArr);

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
      const barWidth = Math.max(2, Math.floor(width / (count * 1.5)));
      const gap = Math.max(1, barWidth * 0.25);

      const amp = new Float32Array(256);
      for (let i = 0; i < count; i++) {
        const bin = Math.floor(i / count * freqArr.length);
        amp[i] = Math.max(1, (freqArr[bin] / 255) * (height * 0.6) * (1 + 0.2 * pulse));
      }

      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.useProgram(prog);
      gl.uniform1f(uCountLoc, count);
      gl.uniform1f(uWidthLoc, width);
      gl.uniform1f(uHeightLoc, height);
      gl.uniform1f(uBarWidthLoc, barWidth);
      gl.uniform1f(uScaleLoc, 1.0);
      gl.uniform1f(uGapLoc, gap);
      gl.uniform1fv(uAmplitudeLoc, amp);
      const c1 = hexToRGB(template.color1 || "#6366f1");
      const c2 = hexToRGB(template.color2 || "#22d3ee");
      gl.uniform3f(uColor1Loc, c1[0], c1[1], c1[2]);
      gl.uniform3f(uColor2Loc, c2[0], c2[1], c2[2]);
      gl.uniform1f(uDprLoc, dpr);

      gl.drawArrays(gl.POINTS, 0, count);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [analyzer, template.renderer, template.color1, template.color2, exportActive, exportSettings.mode, exportSettings.width, exportSettings.height]);

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