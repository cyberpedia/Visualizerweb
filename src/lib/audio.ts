export type EqBand = {
  frequency: number;
  gain: number; // dB
};

export class AudioEngine {
  ctx: AudioContext | null = null;
  audioEl: HTMLAudioElement | null = null;
  source: MediaElementAudioSourceNode | null = null;
  gainNode: GainNode | null = null;
  eqNodes: BiquadFilterNode[] = [];
  analyzer: AnalyserNode | null = null;
  streamDest: MediaStreamAudioDestinationNode | null = null;

  constructor() {}

  ensureCtx() {
    if (!this.ctx) this.ctx = new AudioContext();
    return this.ctx!;
  }

  attachAudioElement(audioEl: HTMLAudioElement) {
    this.audioEl = audioEl;
    const ctx = this.ensureCtx();

    if (this.source) {
      try {
        this.source.disconnect();
      } catch {}
      this.source = null;
    }
    this.source = ctx.createMediaElementSource(audioEl);

    // setup chain
    this.gainNode = ctx.createGain();
    this.eqNodes = this.createEqNodes();

    this.analyzer = ctx.createAnalyser();
    this.analyzer.fftSize = 2048;
    this.analyzer.smoothingTimeConstant = 0.8;

    this.streamDest = ctx.createMediaStreamDestination();

    // connect source -> eq -> gain
    let node: AudioNode = this.source;
    for (const eq of this.eqNodes) {
      node.connect(eq);
      node = eq;
    }
    node.connect(this.gainNode);

    // tee to destination, analyzer, and streamDest
    this.gainNode.connect(ctx.destination);
    this.gainNode.connect(this.analyzer);
    this.gainNode.connect(this.streamDest);
  }

  resume() {
    const ctx = this.ensureCtx();
    if (ctx.state !== "running") return ctx.resume();
  }

  setVolume(v: number) {
    if (!this.gainNode) return;
    this.gainNode.gain.value = Math.min(1, Math.max(0, v));
  }

  fadeTo(seconds: number, target: number) {
    const ctx = this.ensureCtx();
    if (!this.gainNode) return;
    const now = ctx.currentTime;
    const clamped = Math.min(1, Math.max(0, target));
    try {
      this.gainNode.gain.cancelScheduledValues(now);
      this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
      this.gainNode.gain.linearRampToValueAtTime(clamped, now + Math.max(0.01, seconds));
    } catch {}
  }

  setEqGain(bandIndex: number, db: number) {
    const node = this.eqNodes[bandIndex];
    if (!node) return;
    node.gain.value = db;
  }

  getAnalyzer() {
    return this.analyzer!;
  }

  getStream(): MediaStream | null {
    const canvasStream = (document.querySelector("canvas") as HTMLCanvasElement | null)?.captureStream();
    if (!canvasStream || !this.streamDest) return null;

    const audioTrack = this.streamDest.stream.getAudioTracks()[0];
    const composed = new MediaStream();
    for (const t of canvasStream.getVideoTracks()) composed.addTrack(t);
    if (audioTrack) composed.addTrack(audioTrack);
    return composed;
  }

  getAudioStream(): MediaStream | null {
    return this.streamDest?.stream ?? null;
  }

  getCurrentTime(): number {
    return this.audioEl?.currentTime ?? 0;
  }

  getDuration(): number {
    return this.audioEl?.duration ?? 0;
  }

  createEqNodes() {
    const ctx = this.ensureCtx();
    const frequencies = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    return frequencies.map((f) => {
      const node = ctx.createBiquadFilter();
      node.type = "peaking";
      node.frequency.value = f;
      node.Q.value = 1.0;
      node.gain.value = 0;
      return node;
    });
  }

  getFrequencyData() {
    const an = this.analyzer!;
    const arr = new Uint8Array(an.frequencyBinCount);
    an.getByteFrequencyData(arr);
    return arr;
  }

  getTimeDomainData() {
    const an = this.analyzer!;
    const arr = new Uint8Array(an.fftSize);
    an.getByteTimeDomainData(arr);
    return arr;
  }
}

export const audioEngine = new AudioEngine();