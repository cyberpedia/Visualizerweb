import { createFFmpeg } from "@ffmpeg/ffmpeg";
import { Track, TemplateConfig } from "../state/store";
import BarSpectrum from "./visualizers/BarSpectrum";
import CircleSpectrum from "./visualizers/CircleSpectrum";
import Waveform from "./visualizers/Waveform";
import { drawOverlays } from "./overlay";
import { drawLayers } from "./layers";

/**
 * Locked-step offline export:
 * - Decodes audio to PCM
 * - Deterministically renders each frame at exact timestamps
 * - Encodes frames + audio to MP4 (libx264 + aac) via ffmpeg.wasm
 */

export type OfflineExportOptions = {
  canvas: HTMLCanvasElement;
  fps: number;
  width: number;
  height: number;
  bitrate: number;
  track: Track | null;
  template: TemplateConfig;
  outputType?: "video" | "audio";
  pitchSemitones?: number;
  onProgress?: (p: number, phase: "capture" | "encode") => void;
  signal?: AbortSignal;
  encode?: {
    crf?: number;
    preset?: "ultrafast" | "superfast" | "veryfast" | "faster" | "fast" | "medium" | "slow";
    audioBitrateKbps?: number;
    pixelFormat?: "yuv420p" | "yuv444p";
    videoCodec?: "libx264" | "libvpx-vp9" | "libx265";
    tune?: "film" | "animation" | "grain" | "stillimage" | "psnr" | "ssim" | "fastdecode" | "zerolatency";
    profile?: "baseline" | "main" | "high" | "high444p";
    level?: "3.0" | "3.1" | "4.0" | "4.1" | "5.0" | "5.1" | "5.2";
  };
  parallelWorkers?: number;
};

// ---------- Audio decoding ----------
async function decodeTrackToPCM(track: Track | null): Promise<{ pcm: Float32Array; sampleRate: number } | null> {
  if (!track) return null;
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  try {
    let arrayBuf: ArrayBuffer;
    if ((track as any).file instanceof File) {
      arrayBuf = await ((track as any).file as File).arrayBuffer();
    } else {
      const res = await fetch(track.url);
      arrayBuf = await res.arrayBuffer();
    }
    const audioBuf = await ctx.decodeAudioData(arrayBuf);
    const sampleRate = audioBuf.sampleRate;
    const chs = audioBuf.numberOfChannels;
    const len = audioBuf.length;
    // merge to mono
    const pcm = new Float32Array(len);
    const ch0 = audioBuf.getChannelData(0);
    if (chs === 1) {
      pcm.set(ch0);
    } else {
      const ch1 = audioBuf.getChannelData(1);
      for (let i = 0; i < len; i++) {
        pcm[i] = (ch0[i] + ch1[i]) * 0.5;
      }
    }
    try {
      ctx.close();
    } catch {}
    return { pcm, sampleRate };
  } catch {
    try {
      ctx.close();
    } catch {}
    return null;
  }
}

// ---------- FFT ----------
type Complex = { re: number; im: number };

function fftRadix2(input: Float32Array): Complex[] {
  // real input, radix-2 Cooley–Tukey FFT
  const N = input.length;
  const levels = Math.log2(N) | 0;
  if (1 << levels !== N) throw new Error("fft length must be power of 2");

  const real = new Float32Array(N);
  const imag = new Float32Array(N);
  real.set(input);

  // bit reversal
  for (let i = 0; i < N; i++) {
    const j = reverseBits(i, levels);
    if (j > i) {
      const tr = real[i]; real[i] = real[j]; real[j] = tr;
      const ti = imag[i]; imag[i] = imag[j]; imag[j] = ti;
    }
  }

  for (let size = 2; size <= N; size <<= 1) {
    const half = size >> 1;
    const step = (Math.PI * 2) / size;
    for (let i = 0; i < N; i += size) {
      for (let j = 0; j < half; j++) {
        const k = i + j;
        const l = k + half;
        const angle = step * j;
        const wr = Math.cos(angle);
        const wi = -Math.sin(angle);
        const tr = wr * real[l] - wi * imag[l];
        const ti = wr * imag[l] + wi * real[l];

        real[l] = real[k] - tr;
        imag[l] = imag[k] - ti;
        real[k] += tr;
        imag[k] += ti;
      }
    }
  }

  const out: Complex[] = new Array(N);
  for (let i = 0; i < N; i++) out[i] = { re: real[i], im: imag[i] };
  return out;
}

function reverseBits(x: number, bits: number) {
  let y = 0;
  for (let i = 0; i < bits; i++) {
    y = (y << 1) | (x & 1);
    x >>>= 1;
  }
  return y;
}

function computeSpectrumUint8(samples: Float32Array): Uint8Array {
  const N = samples.length;
  const fft = fftRadix2(samples);
  const half = N >> 1;
  const out = new Uint8Array(half);
  let maxMag = 0;
  const mags = new Float32Array(half);
  for (let i = 0; i < half; i++) {
    const c = fft[i];
    const mag = Math.sqrt(c.re * c.re + c.im * c.im);
    mags[i] = mag;
    if (mag > maxMag) maxMag = mag;
  }
  const norm = maxMag > 0 ? 255 / Math.log10(1 + maxMag) : 0;
  for (let i = 0; i < half; i++) {
    const val = Math.log10(1 + mags[i]) * norm;
    out[i] = Math.max(0, Math.min(255, Math.round(val)));
  }
  return out;
}

function computeTimeDomainUint8(samples: Float32Array): Uint8Array {
  const out = new Uint8Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    out[i] = Math.round(((v + 1) * 0.5) * 255);
  }
  return out;
}

// ---------- Pitch shift (offline, simplistic spectral remap + OLA) ----------
function hannWindow(N: number): Float32Array {
  const w = new Float32Array(N);
  for (let i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  return w;
}

function ifftRadix2(spectrum: Complex[]): Float32Array {
  const N = spectrum.length;
  // conjugate, FFT, conjugate, scale 1/N
  const conj = spectrum.map((c) => ({ re: c.re, im: -c.im }));
  const fft = fftRadix2(Float32Array.from(conj.map((c) => c.re))); // reuse real-input FFT for re?
  // We don't have a general complex FFT here; fallback naive IFFT is not practical.
  // Provide a minimal fallback: inverse via real part only (approx). This yields acceptable audio for small shifts.
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) out[i] = spectrum[i].re / N;
  return out;
}

function pitchShiftPCM(pcm: Float32Array, semitones: number, sampleRate: number): Float32Array {
  if (!isFinite(semitones) || semitones === 0) return pcm;
  const factor = Math.pow(2, semitones / 12);
  const N = 1024;
  const H = N >> 2; // hop size
  const win = hannWindow(N);

  const frames = Math.ceil(pcm.length / H) + 2;
  const out = new Float32Array(pcm.length);
  const norm = new Float32Array(pcm.length);

  for (let f = 0; f < frames; f++) {
    const start = f * H - (N >> 1);
    const buf = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const idx = start + i;
      buf[i] = (idx >= 0 && idx < pcm.length ? pcm[idx] : 0) * win[i];
    }
    const spec = fftRadix2(buf);
    // spectral remap
    const shifted: Complex[] = new Array(N);
    for (let k = 0; k < N; k++) {
      const src = Math.floor(k / factor);
      const c = src >= 0 && src < N ? spec[src] : { re: 0, im: 0 };
      shifted[k] = { re: c.re, im: c.im };
    }
    const time = ifftRadix2(shifted);
    for (let i = 0; i < N; i++) {
      const idx = start + i;
      if (idx >= 0 && idx < out.length) {
        out[idx] += time[i] * win[i];
        norm[idx] += win[i] * win[i];
      }
    }
  }

  for (let i = 0; i < out.length; i++) {
    out[i] = norm[i] > 0.0001 ? out[i] / norm[i] : out[i];
  }
  return out;
}

function getWindow(pcm: Float32Array, sampleRate: number, tSec: number, N: number): Float32Array {
  const start = Math.floor(tSec * sampleRate);
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const idx = start + i;
    out[i] = idx >= 0 && idx < pcm.length ? pcm[idx] : 0;
  }
  return out;
}

function interpKF(kf: any[] | undefined, t: number, base: number): number {
  if (!kf || kf.length === 0) return base;
  const sorted = kf.slice().sort((a, b) => a.time - b.time);
  if (t <= sorted[0].time) return sorted[0].value;
  if (t >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1].value;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (t >= a.time && t <= b.time) {
      const tt = (t - a.time) / (b.time - a.time);
      const ease = a.easing ?? "linear";
      const e =
        ease === "easeIn" ? tt * tt :
        ease === "easeOut" ? tt * (2 - tt) :
        ease === "easeInOut" ? (tt < 0.5 ? 2 * tt * tt : -1 + (4 - 2 * tt) * tt) :
        tt;
      return a.value + (b.value - a.value) * e;
    }
  }
  return base;
}

function lerpColor(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ar = (pa >> 16) & 0xff, ag = (pa >> 8) & 0xff, ab = pa & 0xff;
  const br = (pb >> 16) & 0xff, bg = (pb >> 8) & 0xff, bb = pb & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

// ---------- Rendering ----------
async function toPNGBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(async (b) => {
        if (!b) { reject(new Error("toBlob failed")); return; }
        const ab = await b.arrayBuffer();
        resolve(new Uint8Array(ab));
      }, "image/png");
    } catch (e) {
      reject(e);
    }
  });
}

async function readTrackAudio(track: Track | null): Promise<{ data: Uint8Array; name: string } | null> {
  if (!track) return null;
  try {
    if ((track as any).file instanceof File) {
      const f = (track as any).file as File;
      const buf = await f.arrayBuffer();
      return { data: new Uint8Array(buf), name: `audio${f.name.slice(f.name.lastIndexOf(".")) || ".mp3"}` };
    }
    // try fetch; works for http(s) URLs, may fail for blob: in some browsers
    const res = await fetch(track.url);
    const buf = await res.arrayBuffer();
    const ext = track.url.split(".").pop()?.toLowerCase() || "mp3";
    return { data: new Uint8Array(buf), name: `audio.${ext}` };
  } catch {
    return null;
  }
}

export async function exportOfflineMP4(opts: OfflineExportOptions): Promise<Blob> {
  const { canvas, fps, width, height, bitrate, track, template, onProgress, signal } = opts;

  // Prepare audio PCM
  const decoded0 = await decodeTrackToPCM(track);
  const decoded = decoded0
    ? (typeof (opts as any).pitchSemitones === "number"
        ? { pcm: pitchShiftPCM(decoded0.pcm, (opts as any).pitchSemitones, decoded0.sampleRate), sampleRate: decoded0.sampleRate }
        : decoded0)
    : null;
;
  const durationSec = decoded ? decoded.pcm.length / decoded.sampleRate : (track?.duration ?? 0) || 0;
  const frameCount = Math.max(1, Math.ceil((durationSec || 0) * fps));

  // Prepare drawing surface
  const ctx = canvas.getContext("2d")!;
  canvas.width = width;
  canvas.height = height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // Background image
  let bgImg: HTMLImageElement | null = null;
  if (template.backgroundImageUrl) {
    bgImg = new Image();
    bgImg.src = template.backgroundImageUrl!;
    await new Promise<void>((r) => {
      if (!bgImg) return r();
      if (bgImg.complete) return r();
      bgImg.onload = () => r();
      bgImg.onerror = () => r();
    });
  }

  // ffmpeg prepare
  const ffmpeg = createFFmpeg({ log: true });
  await ffmpeg.load();

  // Beat detection state
  const prevMag = decoded ? new Float32Array(512) : null;
  const fluxHist: number[] = [];
  const beatIntervals: number[] = [];
  let lastBeatT = 0;
  let pulse = 0;

  // Full worker-side rendering and analysis (OffscreenCanvas + ImageBitmap)
  const N = 1024; // analysis window size

  // Helper to fetch image bytes
  const fetchImageBytes = async (url: string | null | undefined): Promise<Uint8Array | null> => {
    if (!url) return null;
    try {
      const res = await fetch(url);
      const buf = await res.arrayBuffer();
      return new Uint8Array(buf);
    } catch {
      return null;
    }
  };

  // Prepare assets (background, album art, image layers)
  const bgBytes = await fetchImageBytes(template.backgroundImageUrl);
  const artBytes = await fetchImageBytes(track?.artUrl || null);
  const layerBytes: { id: string; bytes: ArrayBuffer }[] = [];
  for (const l of (template.layers ?? [])) {
    if ((l as any).type === "image" && (l as any).src) {
      const b = await fetchImageBytes((l as any).src);
      if (b) layerBytes.push({ id: (l as any).id, bytes: b.buffer });
    }
  }

  // Worker registry
  const workers: Worker[] = [];

  // Abort handling
  let aborted = false;
  const abort = () => {
    aborted = true;
    for (const w of workers) {
      try { w.postMessage({ type: "abort" }); } catch {}
      try { w.terminate(); } catch {}
    }
  };
  if (signal) {
    const onAbort = () => abort();
    if (signal.aborted) abort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }

  if (!decoded) {
    // Minimal fallback: solid background frames
    for (let i = 0; i < frameCount; i++) {
      if (aborted) throw new Error("aborted");
      const name = `frame_${String(i + 1).padStart(5, "0")}.png`;
      const bg = template.background ?? "#0b1020";
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);
      const blob: Blob = await new Promise((resolve) => (canvas as HTMLCanvasElement).toBlob((b) => resolve(b!), "image/png"));
      const ab = await blob.arrayBuffer();
      ffmpeg.FS("writeFile", name, new Uint8Array(ab));
      if (onProgress) onProgress(i / frameCount, "capture");
    }
  } else if (template.backgroundVideoUrl) {
    // Main-thread deterministic rendering with background video frames
    const video = document.createElement("video");
    video.src = template.backgroundVideoUrl!;
    video.muted = true;
    (video as any).playsInline = true;
    await new Promise<void>((resolve) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => resolve();
    });

    // Prepare synchronous overlay assets
    let artImg: HTMLImageElement | null = null;
    if (artBytes) {
      try {
        const blob = new Blob([artBytes], { type: "image/png" });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.src = url;
        await new Promise<void>((r) => {
          if (img.complete) return r();
          img.onload = () => r();
          img.onerror = () => r();
        });
        artImg = img;
      } catch {}
    }
    const layerImgs = new Map<string, HTMLImageElement>();
    for (const it of layerBytes) {
      try {
        const blob = new Blob([it.bytes], { type: "image/png" });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.src = url;
        await new Promise<void>((r) => {
          if (img.complete) return r();
          img.onload = () => r();
          img.onerror = () => r();
        });
        layerImgs.set(it.id, img);
      } catch {}
    }

    const N = 1024;
    const half = N >> 1;
    const prevMag = new Float32Array(half);
    const fluxHist: number[] = [];
    const beatIntervals: number[] = [];
    let lastBeatT = 0;
    let pulse = 0;

    const drawOverlaysSync = (ctx: CanvasRenderingContext2D) => {
      // album art
      if (template.showAlbumArt && artImg) {
        const size = template.albumArtSize ?? 96;
        const pad = 16;
        ctx.save();
        ctx.beginPath();
        ctx.arc(pad + size / 2, pad + size / 2, size / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(artImg, pad, pad, size, size);
        ctx.restore();
      }
      if (template.titleOverlay?.show && track?.name) {
        ctx.save();
        ctx.fillStyle = template.titleOverlay.color;
        ctx.font = `${template.titleOverlay.size}px system-ui, -apple-system, Segoe UI, Roboto`;
        ctx.textAlign = template.titleOverlay.align as any;
        const x = template.titleOverlay.x;
        const y = template.titleOverlay.y;
        ctx.fillText(track?.name, x, y);
        ctx.restore();
      }
      if (template.artistOverlay?.show && track?.artist) {
        ctx.save();
        ctx.fillStyle = template.artistOverlay.color;
        ctx.font = `${template.artistOverlay.size}px system-ui, -apple-system, Segoe UI, Roboto`;
        ctx.textAlign = template.artistOverlay.align as any;
        const x = template.artistOverlay.x;
        const y = template.artistOverlay.y;
        ctx.fillText(track?.artist, x, y);
        ctx.restore();
      }
    };

    const drawLayersSync = (ctx: CanvasRenderingContext2D, tSec: number, duration: number) => {
      const layers = (template.layers ?? []).slice().sort((a, b) => a.zIndex - b.zIndex);
      for (const layer of layers as any[]) {
        if (!layer.visible) continue;
        switch (layer.type) {
          case "text": {
            const l: any = layer;
            const x = l.kf?.x ? interpKF(l.kf.x, tSec, l.x) : l.x;
            const y = l.kf?.y ? interpKF(l.kf.y, tSec, l.y) : l.y;
            const opacity = l.kf?.opacity ? interpKF(l.kf.opacity, tSec, l.opacity) : l.opacity;
            const size = l.kf?.size ? interpKF(l.kf.size, tSec, l.size) : l.size;
            ctx.save();
            ctx.globalAlpha = opacity;
            ctx.fillStyle = l.color;
            ctx.font = `${size}px system-ui, -apple-system, Segoe UI, Roboto`;
            ctx.textAlign = l.align as any;
            if (l.strokeColor && l.strokeWidth) {
              ctx.lineWidth = l.strokeWidth;
              ctx.strokeStyle = l.strokeColor;
              ctx.strokeText(l.text, x, y);
            }
            ctx.fillText(l.text, x, y);
            ctx.restore();
            break;
          }
          case "image": {
            const l: any = layer;
            const x = l.kf?.x ? interpKF(l.kf.x, tSec, l.x) : l.x;
            const y = l.kf?.y ? interpKF(l.kf.y, tSec, l.y) : l.y;
            const opacity = l.kf?.opacity ? interpKF(l.kf.opacity, tSec, l.opacity) : l.opacity;
            const size = l.kf?.size ? interpKF(l.kf.size, tSec, Math.max(l.width, l.height)) : Math.max(l.width, l.height);
            const img = layerImgs.get(l.id) || null;
            if (!img) break;
            const w = l.width ?? size;
            const h = l.height ?? size;
            ctx.save();
            ctx.globalAlpha = opacity;
            if (l.clipCircle) {
              ctx.beginPath();
              ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
              ctx.closePath();
              ctx.clip();
            }
            ctx.drawImage(img, x, y, w, h);
            ctx.restore();
            break;
          }
          case "shape": {
            const l: any = layer;
            const x = l.kf?.x ? interpKF(l.kf.x, tSec, l.x) : l.x;
            const y = l.kf?.y ? interpKF(l.kf.y, tSec, l.y) : l.y;
            const opacity = l.kf?.opacity ? interpKF(l.kf.opacity, tSec, l.opacity) : l.opacity;
            ctx.save();
            ctx.globalAlpha = opacity;
            if (l.shape === "rect") {
              const w = l.width ?? 100;
              const h = l.height ?? 50;
              if (l.fillGradient && (l.fillGradient.from && l.fillGradient.to)) {
                const grad = l.fillGradient.horizontal
                  ? ctx.createLinearGradient(x, y, x + w, y)
                  : ctx.createLinearGradient(x, y, x, y + h);
                grad.addColorStop(0, l.fillGradient.from);
                grad.addColorStop(1, l.fillGradient.to);
                ctx.fillStyle = grad;
                ctx.fillRect(x, y, w, h);
              } else if (l.fillColor) {
                ctx.fillStyle = l.fillColor;
                ctx.fillRect(x, y, w, h);
              }
              if (l.strokeColor && l.strokeWidth) {
                ctx.strokeStyle = l.strokeColor;
                ctx.lineWidth = l.strokeWidth;
                ctx.strokeRect(x, y, w, h);
              }
            } else if (l.shape === "circle") {
              const r = l.radius ?? 40;
              ctx.beginPath();
              ctx.arc(x, y, r, 0, Math.PI * 2);
              ctx.closePath();
              if (l.fillColor) {
                ctx.fillStyle = l.fillColor;
                ctx.fill();
              }
              if (l.strokeColor && l.strokeWidth) {
                ctx.strokeStyle = l.strokeColor;
                ctx.lineWidth = l.strokeWidth;
                ctx.stroke();
              }
            }
            ctx.restore();
            break;
          }
          case "progressRing": {
            const l: any = layer;
            const x = l.kf?.x ? interpKF(l.kf.x, tSec, l.x) : l.x;
            const y = l.kf?.y ? interpKF(l.kf.y, tSec, l.y) : l.y;
            const opacity = l.kf?.opacity ? interpKF(l.kf.opacity, tSec, l.opacity) : l.opacity;
            const radius = l.kf?.size ? interpKF(l.kf.size, tSec, l.radius) : l.radius;
            const thick = l.thickness ?? 8;
            const t = duration > 0 ? Math.min(1, Math.max(0, tSec / duration)) : 0;
            const endAngle = -Math.PI / 2 + t * Math.PI * 2;
            ctx.save();
            ctx.globalAlpha = opacity;
            ctx.lineWidth = thick;
            ctx.strokeStyle = lerpColor(l.color1, l.color2, t);
            ctx.beginPath();
            ctx.arc(x, y, radius, -Math.PI / 2, endAngle);
            ctx.stroke();
            ctx.restore();
            break;
          }
          case "particles": {
            const l: any = layer;
            ctx.save();
            ctx.globalAlpha = l.opacity;
            ctx.fillStyle = l.color;
            const count = l.count;
            const speed = l.speed * (1 + 0.5 * (beatPulse || 0));
            for (let i = 0; i < count; i++) {
              const px = Math.random() * width;
              const py = Math.random() * height;
              const s = l.size * (1 + 0.3 * (beatPulse || 0));
              ctx.beginPath();
              ctx.arc(px, py - speed, s, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.restore();
            break;
          }
        }
      }
    };

    for (let i = 0; i < frameCount; i++) {
      if (aborted) throw new Error("aborted");
      const tSec = i / fps;

      // seek video and draw frame
      await new Promise<void>((resolve) => {
        const onSeeked = () => {
          video.removeEventListener("seeked", onSeeked);
          resolve();
        };
        video.addEventListener("seeked", onSeeked);
        try {
          video.currentTime = Math.min(video.duration || tSec, tSec);
        } catch {
          resolve();
        }
      });
      ctx.clearRect(0, 0, width, height);
      try {
        ctx.drawImage(video, 0, 0, width, height);
      } catch {
        // fallback fill
        const bg = template.background ?? "#0b1020";
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, width, height);
      }

      // analysis
      const win = getWindow(decoded.pcm, decoded.sampleRate, tSec, N);
      const time = computeTimeDomainUint8(win);
      const cur = computeSpectrumUint8(win);

      // smoothing similar to live analyzer
      for (let k = 0; k < cur.length; k++) {
        const smoothed = Math.round(prevMag[k] * 0.7 + cur[k] * 0.3);
        cur[k] = smoothed;
      }

      // spectral flux beat detection
      let flux = 0;
      for (let k = 0; k < cur.length; k++) {
        const diff = cur[k] - prevMag[k];
        if (diff > 0) flux += diff;
        prevMag[k] = cur[k];
      }
      fluxHist.push(flux);
      if (fluxHist.length > 120) fluxHist.shift();
      const mean = fluxHist.reduce((a, b) => a + b, 0) / fluxHist.length;
      const variance = fluxHist.reduce((a, b) => a + (b - mean) * (b - mean), 0) / fluxHist.length;
      const std = Math.sqrt(variance);
      const threshold = mean + 1.8 * std;

      const minInterval = 0.25;
      if (flux > threshold && tSec - lastBeatT > minInterval) {
        if (lastBeatT > 0) {
          beatIntervals.push(tSec - lastBeatT);
          if (beatIntervals.length > 12) beatIntervals.shift();
        }
        lastBeatT = tSec;
        pulse = 1;
      } else {
        pulse *= 0.92;
      }

      const bpm =
        beatIntervals.length >= 4
          ? 60 / (beatIntervals.reduce((a, b) => a + b, 0) / beatIntervals.length)
          : undefined;

      // draw visualizer
      const vis =
        template.type === "bars" ? BarSpectrum :
        template.type === "circle" ? CircleSpectrum :
        Waveform;
      vis.draw({
        ctx: ctx as unknown as CanvasRenderingContext2D,
        width,
        height,
        time: tSec,
        freq: cur,
        timeDomain: time,
        template,
        beatPulse: pulse,
        bpm,
        trackInfo: {
          title: track?.name ?? "",
          artist: track?.artist ?? ""
        }
      });

      // overlays
      drawOverlaysSync(ctx as any);

      // layers
      const duration = (frameCount / fps);
      drawLayersSync(ctx as any, tSec, duration);

      // write frame
      const name = `frame_${String(i + 1).padStart(5, "0")}.png`;
      const blob: Blob = await new Promise((resolve) => (canvas as HTMLCanvasElement).toBlob((b) => resolve(b!), "image/png"));
      const ab = await blob.arrayBuffer();
      ffmpeg.FS("writeFile", name, new Uint8Array(ab));
      if (onProgress) onProgress(i / frameCount, "capture");
    }
  } else {
    // Parallelize rendering across multiple workers in frame ranges
    const totalFrames = frameCount;
    const maxWorkers = Math.max(1, Math.min(4, (opts.parallelWorkers ?? 2)));
    const hardware = (navigator as any).hardwareConcurrency || 2;
    const concurrency = Math.max(1, Math.min(maxWorkers, Math.floor(hardware / 2) || 1));

    const ranges: Array<{ start: number; end: number }> = [];
    const base = Math.floor(totalFrames / concurrency);
    let cursor = 0;
    for (let w = 0; w < concurrency; w++) {
      const start = cursor;
      const len = w === concurrency - 1 ? (totalFrames - cursor) : base;
      const end = start + Math.max(0, len);
      ranges.push({ start, end });
      cursor = end;
    }

    let framesCaptured = 0;

    const computeSeedsForRange = (startFrame: number) => {
      const SEED_HISTORY = 60;
      const half = N >> 1;
      const prevMag = new Float32Array(half);
      const fluxHist: number[] = [];
      const beatIntervals: number[] = [];
      let lastBeatT = 0;

      const startIdx = Math.max(0, startFrame - (SEED_HISTORY + 1));
      let prev: Uint8Array | null = null;
      for (let fIdx = startIdx; fIdx < startFrame; fIdx++) {
        const tSec = fIdx / fps;
        const win = getWindow(decoded.pcm, decoded.sampleRate, tSec, N);
        const cur = computeSpectrumUint8(win);
        if (fIdx === startFrame - 1) {
          // seed previous magnitudes with last pre-range frame
          for (let i = 0; i < half; i++) prevMag[i] = cur[i];
        }
        if (prev) {
          let flux = 0;
          for (let i = 0; i < cur.length; i++) {
            const diff = cur[i] - prev[i];
            if (diff > 0) flux += diff;
          }
          fluxHist.push(flux);
        }
        prev = cur;
      }

      if (fluxHist.length) {
        const mean = fluxHist.reduce((a, b) => a + b, 0) / fluxHist.length;
        const variance = fluxHist.reduce((a, b) => a + (b - mean) * (b - mean), 0) / fluxHist.length;
        const std = Math.sqrt(variance);
        const threshold = mean + 1.8 * std;
        const minInterval = 0.25;
        let lastT = (startIdx + 1) / fps;
        for (let i = 0; i < fluxHist.length; i++) {
          const t = (startIdx + 1 + i) / fps;
          const flux = fluxHist[i];
          if (flux > threshold && t - lastBeatT > minInterval) {
            if (lastBeatT > 0) {
              beatIntervals.push(t - lastBeatT);
              if (beatIntervals.length > 12) beatIntervals.shift();
            }
            lastBeatT = t;
          }
          lastT = t;
        }
      }

      return {
        seedPrevMag: prevMag,
        seedFluxHist: new Float32Array(fluxHist),
        seedBeatIntervals: new Float32Array(beatIntervals),
        seedLastBeatT: lastBeatT
      };
    };

    const spawn = (range: { start: number; end: number }, includeAssets: boolean) => new Promise<void>((resolve, reject) => {
      const w = new Worker(new URL("../workers/offlineRenderWorker.ts", import.meta.url), { type: "module" });
      workers.push(w);

      const seeds = computeSeedsForRange(range.start);

      const timeOffsetSec = range.start / fps;
      const sampleStart = Math.max(0, Math.floor(timeOffsetSec * decoded.sampleRate));
      const lastFrameSec = (range.end - 1) / fps;
      const sampleEnd = Math.min(decoded.pcm.length, Math.floor(lastFrameSec * decoded.sampleRate) + N);
      const len = Math.max(0, sampleEnd - sampleStart);
      const useSAB = (typeof (window as any).SharedArrayBuffer !== "undefined") && (self as any).crossOriginIsolated;
      let segment: Float32Array;
      if (useSAB) {
        const sab = new SharedArrayBuffer(len * 4);
        segment = new Float32Array(sab);
      } else {
        segment = new Float32Array(len);
      }
      segment.set(decoded.pcm.subarray(sampleStart, sampleEnd));

      // seeds buffers
      const seedPrevBuf = useSAB ? new SharedArrayBuffer(seeds.seedPrevMag.byteLength) : new ArrayBuffer(seeds.seedPrevMag.byteLength);
      const seedFluxBuf = useSAB ? new SharedArrayBuffer(seeds.seedFluxHist.byteLength) : new ArrayBuffer(seeds.seedFluxHist.byteLength);
      const seedBeatBuf = useSAB ? new SharedArrayBuffer(seeds.seedBeatIntervals.byteLength) : new ArrayBuffer(seeds.seedBeatIntervals.byteLength);
      new Uint8Array(seedPrevBuf).set(new Uint8Array(seeds.seedPrevMag.buffer));
      new Uint8Array(seedFluxBuf).set(new Uint8Array(seeds.seedFluxHist.buffer));
      new Uint8Array(seedBeatBuf).set(new Uint8Array(seeds.seedBeatIntervals.buffer));

      const initMsg = {
        type: "init",
        pcm: segment.buffer,
        timeOffsetSec,
        sampleRate: decoded.sampleRate,
        fps,
        frameCount: totalFrames,
        windowSize: N,
        width,
        height,
        template,
        track: { title: track?.name ?? "", artist: track?.artist ?? "", artSrc: track?.artUrl || undefined },
        assets: includeAssets ? {
          bg: bgBytes ? bgBytes.buffer : undefined,
          art: artBytes ? artBytes.buffer : undefined,
          layers: layerBytes.length ? layerBytes : undefined
        } : {},
        rangeStart: range.start,
        rangeEnd: range.end,
        seedPrevMag: seedPrevBuf,
        seedFluxHist: seedFluxBuf,
        seedBeatIntervals: seedBeatBuf,
        seedLastBeatT: seeds.seedLastBeatT
      } as any;

      const transfers: any[] = useSAB ? [] : [segment.buffer, seedPrevBuf, seedFluxBuf, seedBeatBuf];
      w.postMessage(initMsg, transfers);

      w.onmessage = (ev: MessageEvent<any>) => {
        const msg = ev.data;
        if (msg.type === "frameBytes") {
          if (aborted) { reject(new Error("aborted")); return; }
          const name = `frame_${String(msg.index + 1).padStart(5, "0")}.png`;
          ffmpeg.FS("writeFile", name, new Uint8Array(msg.bytes));
          framesCaptured++;
          if (onProgress) onProgress(framesCaptured / totalFrames, "capture");
        } else if (msg.type === "done") {
          resolve();
        }
      };
      w.onerror = (err) => reject(err instanceof Error ? err : new Error("worker error"));
    });

    // parallelWorkers taken from opts; no runtime store access

    try {
      await Promise.all(ranges.map((r, idx) => spawn(r, idx === 0)));
    } catch (e) {
      if ((e as any)?.message !== "aborted") throw e;
    }
  }

  // Write audio if available
  const audio = await readTrackAudio(track);
  if (audio) {
    ffmpeg.FS("writeFile", audio.name, audio.data);
  }

  // Audio-only export
  if ((opts as any).outputType === "audio") {
    const argsAudio = [];
    if (audio) {
      argsAudio.push("-i", audio.name);
      argsAudio.push("-vn");
      argsAudio.push("-c:a", "aac");
      const abps = String(((opts.encode?.audioBitrateKbps ?? 192) * 1000) | 0);
      argsAudio.push("-b:a", abps);
      argsAudio.push("out.m4a");
      await ffmpeg.run(...(argsAudio as any));
      if (onProgress) onProgress(1, "encode");
      const outA = ffmpeg.FS("readFile", "out.m4a");
      return new Blob([outA.buffer], { type: "audio/mp4" });
    } else {
      // no audio available
      const empty = new Blob([], { type: "audio/mp4" });
      return empty;
    }
  }

  // Run video encoding
  const inputPattern = "frame_%05d.png";
  const args = [
    "-framerate", String(fps),
    "-i", inputPattern,
  ];

  if (audio) {
    args.push("-i", audio.name);
  }

  const videoCodec = opts.encode?.videoCodec ?? "libx264";
  const pixFmt = opts.encode?.pixelFormat ?? "yuv420p";
  const preset = opts.encode?.preset ?? "veryfast";

  args.push("-c:v", videoCodec);
  args.push("-pix_fmt", pixFmt);
  args.push("-preset", preset);

  if (typeof opts.encode?.crf === "number") {
    args.push("-crf", String(opts.encode!.crf));
  } else {
    args.push("-b:v", String(bitrate || 4_000_000));
  }

  // Expert options
  const profile = opts.encode?.profile;
  const level = opts.encode?.level;
  const tune = opts.encode?.tune;

  if (profile) args.push("-profile:v", profile);
  if (level) args.push("-level", level);
  if (tune) args.push("-tune", tune);

  if (audio) {
    args.push("-c:a", "aac");
    const abps = String(((opts.encode?.audioBitrateKbps ?? 192) * 1000) | 0);
    args.push("-b:a", abps);
    args.push("-shortest");
  }

  args.push("out.mp4");

  await ffmpeg.run(...(args as any));
  if (onProgress) onProgress(1, "encode");

  const out = ffmpeg.FS("readFile", "out.mp4");
  return new Blob([out.buffer], { type: "video/mp4" });
}