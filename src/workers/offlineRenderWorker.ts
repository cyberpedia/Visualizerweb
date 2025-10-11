import BarSpectrum from "../lib/visualizers/BarSpectrum";
import CircleSpectrum from "../lib/visualizers/CircleSpectrum";
import Waveform from "../lib/visualizers/Waveform";
import type { TemplateConfig } from "../state/store";

// ---- Types ----
type InitMsg = {
  type: "init";
  pcm: ArrayBuffer;
  sampleRate: number;
  fps: number;
  frameCount: number;
  windowSize: number;
  width: number;
  height: number;
  template: TemplateConfig;
  track: { title: string; artist: string; artSrc?: string };
  assets: {
    bg?: ArrayBuffer;
    art?: ArrayBuffer;
    layers?: { id: string; bytes: ArrayBuffer }[];
  };
  rangeStart?: number;
  rangeEnd?: number;
  seedPrevMag?: ArrayBuffer;
  seedFluxHist?: ArrayBuffer;
  seedLastBeatT?: number;
  seedBeatIntervals?: ArrayBuffer;
};
type AbortMsg = { type: "abort" };

type FrameBytesMsg = {
  type: "frameBytes";
  index: number;
  timeSec: number;
  bytes: ArrayBuffer;
};

type DoneMsg = { type: "done" };

// ---- FFT + helpers ----
type Complex = { re: number; im: number };

function reverseBits(x: number, bits: number) {
  let y = 0;
  for (let i = 0; i < bits; i++) {
    y = (y << 1) | (x & 1);
    x >>>= 1;
  }
  return y;
}

function fftRadix2(input: Float32Array): Complex[] {
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

function getWindow(pcm: Float32Array, sampleRate: number, tSec: number, N: number): Float32Array {
  const start = Math.floor(tSec * sampleRate);
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const idx = start + i;
    out[i] = idx >= 0 && idx < pcm.length ? pcm[idx] : 0;
  }
  return out;
}

// ---- Worker-side overlays and layers using ImageBitmap ----

async function fetchBitmapFromURL(url?: string | null): Promise<ImageBitmap | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await createImageBitmap(blob);
  } catch {
    return null;
  }
}

function drawWorkerOverlays(
  ctx: OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
  template: TemplateConfig,
  track: { title?: string; artist?: string },
  artBitmap: ImageBitmap | null
) {
  // album art
  if (template.showAlbumArt && artBitmap) {
    const size = template.albumArtSize ?? 96;
    const pad = 16;
    ctx.save();
    // circular mask
    ctx.beginPath();
    ctx.arc(pad + size / 2, pad + size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(artBitmap, pad, pad, size, size);
    ctx.restore();
  }

  if (template.titleOverlay?.show && track.title) {
    ctx.save();
    ctx.fillStyle = template.titleOverlay.color;
    ctx.font = `${template.titleOverlay.size}px system-ui, -apple-system, Segoe UI, Roboto`;
    ctx.textAlign = template.titleOverlay.align as CanvasTextAlign;
    const x = template.titleOverlay.x;
    const y = template.titleOverlay.y;
    ctx.fillText(track.title, x, y);
    ctx.restore();
  }

  if (template.artistOverlay?.show && track.artist) {
    ctx.save();
    ctx.fillStyle = template.artistOverlay.color;
    ctx.font = `${template.artistOverlay.size}px system-ui, -apple-system, Segoe UI, Roboto`;
    ctx.textAlign = template.artistOverlay.align as CanvasTextAlign;
    const x = template.artistOverlay.x;
    const y = template.artistOverlay.y;
    ctx.fillText(track.artist, x, y);
    ctx.restore();
  }
}

function interpKF(kf: any[] | undefined, t: number, base: number): number {
  if (!kf || kf.length === 0) return base;
  const sorted = kf.slice().sort((a: any, b: any) => a.time - b.time);
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

function drawWorkerLayers(
  ctx: OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
  template: TemplateConfig,
  time: number,
  duration: number,
  beatPulse: number,
  layerBitmaps: Map<string, ImageBitmap>
) {
  const layers = (template.layers ?? []).slice().sort((a, b) => a.zIndex - b.zIndex);
  for (const layer of layers as any[]) {
    if (!layer.visible) continue;
    switch (layer.type) {
      case "text": {
        const l: any = layer;
        const x = interpKF(l.kf?.x, time, l.x);
        const y = interpKF(l.kf?.y, time, l.y);
        const opacity = interpKF(l.kf?.opacity, time, l.opacity);
        const size = interpKF(l.kf?.size, time, l.size);
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.fillStyle = l.color;
        ctx.font = `${size}px system-ui, -apple-system, Segoe UI, Roboto`;
        ctx.textAlign = l.align as CanvasTextAlign;
        ctx.fillText(l.text, x, y);
        ctx.restore();
        break;
      }
      case "image": {
        const l: any = layer;
        const x = interpKF(l.kf?.x, time, l.x);
        const y = interpKF(l.kf?.y, time, l.y);
        const opacity = interpKF(l.kf?.opacity, time, l.opacity);
        const size = interpKF(l.kf?.size, time, Math.max(l.width, l.height));
        const bmp = layerBitmaps.get(l.id) || null;
        if (!bmp) break;
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
        ctx.drawImage(bmp, x, y, w, h);
        ctx.restore();
        break;
      }
      case "shape": {
        const l: any = layer;
        const x = interpKF(l.kf?.x, time, l.x);
        const y = interpKF(l.kf?.y, time, l.y);
        const opacity = interpKF(l.kf?.opacity, time, l.opacity);
        ctx.save();
        ctx.globalAlpha = opacity;
        if (l.shape === "rect") {
          const w = l.width ?? 100;
          const h = l.height ?? 50;
          if (l.fillColor) {
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
        const x = interpKF(l.kf?.x, time, l.x);
        const y = interpKF(l.kf?.y, time, l.y);
        const opacity = interpKF(l.kf?.opacity, time, l.opacity);
        const radius = interpKF(l.kf?.size, time, l.radius);
        const thick = l.thickness ?? 8;
        const t = duration > 0 ? Math.min(1, Math.max(0, time / duration)) : 0;
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
        // per-frame simple particles; determinism across frames isn't required in offline mode
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
}

// ---- Worker main ----
let aborted = false;

self.onmessage = async (e: MessageEvent<InitMsg | AbortMsg>) => {
  const data = e.data as any;
  if (data.type === "abort") {
    aborted = true;
    return;
  }
  if (data.type !== "init") return;

  const { pcm, sampleRate, fps, frameCount, windowSize, width, height, template, track, assets } = data as InitMsg;
  const pcmArr = new Float32Array(pcm);

  // Prepare OffscreenCanvas
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;

  // Prepare backgrounds and layer bitmaps
  let bgBitmap: ImageBitmap | null = null;
  let artBitmap: ImageBitmap | null = null;
  const layerBitmaps = new Map<string, ImageBitmap>();

  try {
    if (assets.bg) {
      bgBitmap = await createImageBitmap(new Blob([assets.bg]));
    }
  } catch {}

  try {
    if (assets.art) {
      artBitmap = await createImageBitmap(new Blob([assets.art]));
    }
  } catch {}

  if (assets.layers && assets.layers.length) {
    for (const it of assets.layers) {
      try {
        const bmp = await createImageBitmap(new Blob([it.bytes]));
        layerBitmaps.set(it.id, bmp);
      } catch {}
    }
  }

  // Fallback: fetch images directly in worker if bytes not provided
  if (!bgBitmap && template.backgroundImageUrl) {
    bgBitmap = await fetchBitmapFromURL(template.backgroundImageUrl);
  }
  if (!artBitmap && template.showAlbumArt && (data as InitMsg).track.artSrc) {
    artBitmap = await fetchBitmapFromURL((data as InitMsg).track.artSrc);
  }
  if (layerBitmaps.size === 0 && (template.layers?.length ?? 0) > 0) {
    for (const l of (template.layers ?? [])) {
      // @ts-ignore
      if (l.type === "image" && l.src && !layerBitmaps.has(l.id)) {
        const bmp = await fetchBitmapFromURL(l.src);
        if (bmp) {
          layerBitmaps.set(l.id, bmp);
        }
      }
    }
  }

  // Beat detection state (seeded for continuity across ranges)
  const prevMag = new Float32Array(windowSize >> 1);
  const fluxHist: number[] = [];
  const beatIntervals: number[] = [];
  let lastBeatT = 0;
  let pulse = 0;

  // Seeds
  try {
    const seedPrev = (data as InitMsg).seedPrevMag;
    if (seedPrev) {
      const f = new Float32Array(seedPrev);
      for (let i = 0; i < Math.min(prevMag.length, f.length); i++) prevMag[i] = f[i];
    }
  } catch {}
  try {
    const seedFlux = (data as InitMsg).seedFluxHist;
    if (seedFlux) {
      const fh = new Float32Array(seedFlux);
      for (let i = 0; i < fh.length; i++) fluxHist.push(fh[i]);
    }
  } catch {}
  try {
    const seedIntervals = (data as InitMsg).seedBeatIntervals;
    if (seedIntervals) {
      const bi = new Float32Array(seedIntervals);
      for (let i = 0; i < bi.length; i++) beatIntervals.push(bi[i]);
    }
  } catch {}
  try {
    const seedLast = (data as InitMsg).seedLastBeatT;
    if (typeof seedLast === "number") lastBeatT = seedLast;
  } catch {}

  const rangeStart = (data as InitMsg).rangeStart ?? 0;
  const rangeEnd = (data as InitMsg).rangeEnd ?? frameCount;

  for (let i = rangeStart; i < rangeEnd; i++) {
    if (aborted) break;
    const tSec = i / fps;

    // clear / background
    ctx.clearRect(0, 0, width, height);
    if (bgBitmap) {
      ctx.drawImage(bgBitmap, 0, 0, width, height);
    } else {
      const bg = template.background ?? "#0b1020";
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);
    }

    // analysis
    const win = getWindow(pcmArr, sampleRate, tSec, windowSize);
    const time = computeTimeDomainUint8(win);
    const freq = computeSpectrumUint8(win);

    // spectral flux beat detection
    let flux = 0;
    for (let k = 0; k < freq.length; k++) {
      const mag = freq[k];
      const diff = mag - prevMag[k];
      if (diff > 0) flux += diff;
      prevMag[k] = mag;
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

    // choose visualizer
    const vis =
      template.type === "bars" ? BarSpectrum :
      template.type === "circle" ? CircleSpectrum :
      Waveform;

    vis.draw({
      ctx: ctx as unknown as CanvasRenderingContext2D,
      width,
      height,
      time: tSec,
      freq,
      timeDomain: time,
      template,
      beatPulse: pulse,
      bpm,
      trackInfo: {
        title: track.title,
        artist: track.artist
      }
    });

    // overlays
    drawWorkerOverlays(ctx, width, height, template, track, artBitmap);

    // layers
    const duration = (frameCount / fps);
    drawWorkerLayers(ctx, width, height, template, tSec, duration, pulse, layerBitmaps);

    // convert to PNG bytes and post
    const blob = await canvas.convertToBlob({ type: "image/png" });
    const ab = await blob.arrayBuffer();
    const msg: FrameBytesMsg = { type: "frameBytes", index: i, timeSec: tSec, bytes: ab };
    // @ts-ignore
    postMessage(msg, [msg.bytes]);
  }

  const done: DoneMsg = { type: "done" };
  // @ts-ignore
  postMessage(done);
};