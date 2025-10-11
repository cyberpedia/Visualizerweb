export type EqBand = {
  frequency: number;
  gain: number; // dB
};

export class AudioEngine {
  ctx: AudioContext | null = null;

  // Dual audio elements for overlapped crossfade
  audioElA: HTMLAudioElement | null = null;
  audioElB: HTMLAudioElement | null = null;
  sourceA: MediaElementAudioSourceNode | null = null;
  sourceB: MediaElementAudioSourceNode | null = null;
  sourceGainA: GainNode | null = null;
  sourceGainB: GainNode | null = null;
  activeSource: "A" | "B" = "A";

  // Processing chain
  gainNode: GainNode | null = null;
  eqNodes: BiquadFilterNode[] = [];
  compressor: DynamicsCompressorNode | null = null;
  limiter: DynamicsCompressorNode | null = null;
  panner: StereoPannerNode | null = null;
  convolver: ConvolverNode | null = null;
  wetGain: GainNode | null = null;
  dryGain: GainNode | null = null;
  analyzer: AnalyserNode | null = null;
  streamDest: MediaStreamAudioDestinationNode | null = null;

  constructor() {}

  ensureCtx() {
    if (!this.ctx) this.ctx = new AudioContext();
    return this.ctx!;
  }

  private buildImpulse(seconds: number = 2, decay: number = 2): AudioBuffer {
    const ctx = this.ensureCtx();
    const rate = ctx.sampleRate;
    const len = Math.max(1, Math.floor(seconds * rate));
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  attachAudioElements(a: HTMLAudioElement, b: HTMLAudioElement) {
    this.audioElA = a;
    this.audioElB = b;
    const ctx = this.ensureCtx();

    // disconnect previous
    for (const s of [this.sourceA, this.sourceB]) {
      try { s?.disconnect(); } catch {}
    }
    this.sourceA = ctx.createMediaElementSource(a);
    this.sourceB = ctx.createMediaElementSource(b);
    this.sourceGainA = ctx.createGain();
    this.sourceGainB = ctx.createGain();
    this.sourceGainA.gain.value = 1.0;
    this.sourceGainB.gain.value = 0.0;

    // setup chain
    this.eqNodes = this.createEqNodes();
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -10;
    this.compressor.knee.value = 10;
    this.compressor.ratio.value = 3;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.25;

    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -2;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.05;

    this.panner = ctx.createStereoPanner();
    this.panner.pan.value = 0;

    this.convolver = ctx.createConvolver();
    this.convolver.buffer = this.buildImpulse(2.5, 2.5);
    this.wetGain = ctx.createGain();
    this.wetGain.gain.value = 0.0; // default off
    this.dryGain = ctx.createGain();
    this.dryGain.gain.value = 1.0;

    this.analyzer = ctx.createAnalyser();
    this.analyzer.fftSize = 2048;
    this.analyzer.smoothingTimeConstant = 0.8;

    this.streamDest = ctx.createMediaStreamDestination();

    // Merge sources -> preGain -> EQ -> compressor -> panner
    const preGain = ctx.createGain();
    this.sourceA.connect(this.sourceGainA!);
    this.sourceB.connect(this.sourceGainB!);
    this.sourceGainA!.connect(preGain);
    this.sourceGainB!.connect(preGain);

    let node: AudioNode = preGain;
    for (const eq of this.eqNodes) {
      node.connect(eq);
      node = eq;
    }
    node.connect(this.compressor!);
    node = this.compressor!;
    node.connect(this.panner!);
    node = this.panner!;

    // split dry/wet to mix reverb
    node.connect(this.dryGain!);
    node.connect(this.convolver!);
    this.convolver!.connect(this.wetGain!);

    // mix wet + dry -> limiter -> gain -> outputs
    const mixGain = ctx.createGain();
    this.dryGain!.connect(mixGain);
    this.wetGain!.connect(mixGain);

    this.gainNode = ctx.createGain();
    mixGain.connect(this.limiter!);
    this.limiter!.connect(this.gainNode);

    // tee to destination, analyzer, and streamDest
    this.gainNode.connect(ctx.destination);
    this.gainNode.connect(this.analyzer!);
    this.gainNode.connect(this.streamDest!);
  }

  resume() {
    const ctx = this.ensureCtx();
    if (ctx.state !== "running") return ctx.resume();
  }

  setVolume(v: number) {
    if (!this.gainNode) return;
    this.gainNode.gain.value = Math.min(1, Math.max(0, v));
  }

  setPlaybackRate(r: number) {
    const val = Math.min(2, Math.max(0.5, r));
    if (this.audioElA) this.audioElA.playbackRate = val;
    if (this.audioElB) this.audioElB.playbackRate = val;
  }

  setPan(p: number) {
    if (!this.panner) return;
    this.panner.pan.value = Math.min(1, Math.max(-1, p));
  }

  setCompressor(on: boolean) {
    if (!this.compressor) return;
    if (on) {
      this.compressor.threshold.value = -10;
      this.compressor.knee.value = 10;
      this.compressor.ratio.value = 3;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.25;
    } else {
      this.compressor.threshold.value = 0;
      this.compressor.knee.value = 0;
      this.compressor.ratio.value = 1;
      this.compressor.attack.value = 0.001;
      this.compressor.release.value = 0.05;
    }
  }

  setLimiter(on: boolean) {
    if (!this.limiter) return;
    if (on) {
      this.limiter.threshold.value = -2;
      this.limiter.knee.value = 0;
      this.limiter.ratio.value = 20;
      this.limiter.attack.value = 0.001;
      this.limiter.release.value = 0.05;
    } else {
      this.limiter.threshold.value = 0;
      this.limiter.knee.value = 0;
      this.limiter.ratio.value = 1;
      this.limiter.attack.value = 0.001;
      this.limiter.release.value = 0.05;
    }
  }

  setReverb(on: boolean) {
    if (!this.wetGain || !this.dryGain) return;
    this.wetGain.gain.value = on ? (this.wetGain.gain.value || 0.25) : 0.0;
    this.dryGain.gain.value = 1.0;
  }

  setReverbWet(value: number) {
    if (!this.wetGain) return;
    const v = Math.min(1, Math.max(0, value));
    this.wetGain.gain.value = v;
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

  setSourceGain(which: "A" | "B", value: number) {
    const g = which === "A" ? this.sourceGainA : this.sourceGainB;
    if (!g) return;
    g.gain.value = Math.min(1, Math.max(0, value));
  }

  rampSourceGain(which: "A" | "B", seconds: number, target: number) {
    const ctx = this.ensureCtx();
    const g = which === "A" ? this.sourceGainA : this.sourceGainB;
    if (!g) return;
    const now = ctx.currentTime;
    const clamped = Math.min(1, Math.max(0, target));
    try {
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.linearRampToValueAtTime(clamped, now + Math.max(0.01, seconds));
    } catch {}
  }

  setActiveSource(which: "A" | "B") {
    this.activeSource = which;
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
    const el = this.activeSource === "A" ? this.audioElA : this.audioElB;
    return el?.currentTime ?? 0;
  }

  getDuration(): number {
    const el = this.activeSource === "A" ? this.audioElA : this.audioElB;
    return el?.duration ?? 0;
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