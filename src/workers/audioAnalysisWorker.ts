type InitMsg = {
  type: "init";
  pcm: ArrayBuffer;
  sampleRate: number;
  fps: number;
  frameCount: number;
  windowSize: number;
};

type AbortMsg = { type: "abort" };

type FrameMsg = {
  type: "frame";
  index: number;
  timeSec: number;
  freq: ArrayBuffer;
  time: ArrayBuffer;
  beatPulse: number;
  bpm?: number;
};

type DoneMsg = { type: "done" };

type Complex = { re: number; im: number };

let aborted = false;

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

self.onmessage = async (e: MessageEvent<InitMsg | AbortMsg>) => {
  const data = e.data;
  if (data.type === "abort") {
    aborted = true;
    return;
  }

  if (data.type !== "init") return;

  const { pcm, sampleRate, fps, frameCount, windowSize } = data;
  const pcmArr = new Float32Array(pcm);

  // beat detection state
  const prevMag = new Float32Array(windowSize >> 1);
  const fluxHist: number[] = [];
  const beatIntervals: number[] = [];
  let lastBeatT = 0;
  let pulse = 0;

  for (let i = 0; i < frameCount; i++) {
    if (aborted) break;
    const tSec = i / fps;
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

    const msg: FrameMsg = {
      type: "frame",
      index: i,
      timeSec: tSec,
      freq: (freq as Uint8Array).buffer,
      time: (time as Uint8Array).buffer,
      beatPulse: pulse,
      bpm
    };
    // transfer buffers to avoid copy
    // @ts-ignore
    postMessage(msg, [msg.freq, msg.time]);
  }

  const done: DoneMsg = { type: "done" };
  // @ts-ignore
  postMessage(done);
};