import { createFFmpeg } from "@ffmpeg/ffmpeg";
import { Track, TemplateConfig } from "../state/store";

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
  encode?: {
    crf?: number;
    preset?: "ultrafast" | "superfast" | "veryfast" | "faster" | "fast" | "medium" | "slow";
    audioBitrateKbps?: number;
    pixelFormat?: "yuv420p" | "yuv444p";
    videoCodec?: "libx264";
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

  // Spawn worker
  let worker: Worker | null = null;
  if (decoded) {
    worker = new Worker(new URL("../workers/offlineRenderWorker.ts", import.meta.url), { type: "module" });
  }

  // Abort handling
  let aborted = false;
  const abort = () => {
    aborted = true;
    try { worker?.postMessage({ type: "abort" }); } catch {}
    try { worker?.terminate(); } catch {}
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

    const spawn = (range: { start: number; end: number }) => new Promise<void>((resolve, reject) => {
      const w = new Worker(new URL("../workers/offlineRenderWorker.ts", import.meta.url), { type: "module" });
      const seeds = computeSeedsForRange(range.start);
      const initMsg = {
        type: "init",
        pcm: decoded.pcm.buffer, // copied (not transferred) to avoid detaching for other workers
        sampleRate: decoded.sampleRate,
        fps,
        frameCount: totalFrames,
        windowSize: N,
        width,
        height,
        template,
        track: { title: track?.name ?? "", artist: track?.artist ?? "", artSrc: track?.artUrl || undefined },
        assets: {
          bg: bgBytes ? bgBytes.buffer : undefined,
          art: artBytes ? artBytes.buffer : undefined,
          layers: layerBytes.length ? layerBytes : undefined
        },
        rangeStart: range.start,
        rangeEnd: range.end,
        seedPrevMag: seeds.seedPrevMag.buffer,
        seedFluxHist: seeds.seedFluxHist.buffer,
        seedBeatIntervals: seeds.seedBeatIntervals.buffer,
        seedLastBeatT: seeds.seedLastBeatT
      } as any;

      w.postMessage(initMsg); // no transfer list to avoid detaching buffers

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
      await Promise.all(ranges.map(spawn));
    } catch (e) {
      if ((e as any)?.message !== "aborted") throw e;
    }
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

  await ffmpeg.run(...args);
  if (onProgress) onProgress(1, "encode");

  const out = ffmpeg.FS("readFile", "out.mp4");
  return new Blob([out.buffer], { type: "video/mp4" });
}