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
  onProgress?: (p: number, phase: "capture" | "encode") => void;
  signal?: AbortSignal;
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

function getWindow(pcm: Float32Array, sampleRate: number, tSec: number, N: number): Float32Array {
  const start = Math.floor(tSec * sampleRate);
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const idx = start + i;
    out[i] = idx >= 0 && idx < pcm.length ? pcm[idx] : 0;
  }
  return out;
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
  const decoded = await decodeTrackToPCM(track);
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

  // Per-frame rendering
  const N = 1024; // FFT/time-domain window
  for (let i = 0; i < frameCount; i++) {
    if (signal?.aborted) throw new Error("aborted");
    const tSec = i / fps;

    // clear / background
    ctx.clearRect(0, 0, width, height);
    if (bgImg && bgImg.complete) {
      ctx.drawImage(bgImg, 0, 0, width, height);
    } else {
      const bg = template.background ?? "#0b1020";
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);
    }

    // synth arrays
    let timeDomain = new Uint8Array(N);
    let freq = new Uint8Array(N >> 1);

    if (decoded) {
      const win = getWindow(decoded.pcm, decoded.sampleRate, tSec, N);
      timeDomain = computeTimeDomainUint8(win);
      freq = computeSpectrumUint8(win);

      // beat detection via spectral flux
      let flux = 0;
      if (prevMag) {
        const half = freq.length;
        for (let k = 0; k < half; k++) {
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
      }
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

    // draw visualizer
    vis.draw({
      ctx,
      width,
      height,
      time: tSec,
      freq,
      timeDomain,
      template,
      beatPulse: pulse,
      bpm,
      trackInfo: {
        title: track?.name ?? "",
        artist: track?.artist ?? ""
      }
    });

    // overlays
    drawOverlays(ctx, width, height, template, {
      title: track?.name ?? "",
      artist: track?.artist ?? "",
      artUrl: track?.artUrl || null
    });

    // layers
    drawLayers(ctx, width, height, template, tSec, durationSec || 0, pulse);

    // write frame to ffmpeg fs
    const name = `frame_${String(i + 1).padStart(5, "0")}.png`;
    const png = await toPNGBytes(canvas);
    ffmpeg.FS("writeFile", name, png);

    if (onProgress) onProgress(i / frameCount, "capture");
  }

  // Write audio if available
  const audio = await readTrackAudio(track);
  if (audio) {
    ffmpeg.FS("writeFile", audio.name, audio.data);
  }

  // Run encoding
  const inputPattern = "frame_%05d.png";
  const args = [
    "-framerate", String(fps),
    "-i", inputPattern,
  ];

  if (audio) {
    args.push("-i", audio.name);
  }

  args.push(
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-preset", "veryfast",
    "-b:v", String(bitrate || 4_000_000),
  );

  if (audio) {
    args.push("-c:a", "aac");
    args.push("-shortest");
  }

  args.push("out.mp4");

  await ffmpeg.run(...args);
  if (onProgress) onProgress(1, "encode");

  const out = ffmpeg.FS("readFile", "out.mp4");
  return new Blob([out.buffer], { type: "video/mp4" });
}