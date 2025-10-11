export async function computeWaveform(file: File, bins: number = 1024): Promise<Uint8Array | null> {
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  try {
    const buf = await file.arrayBuffer();
    const audioBuf = await ctx.decodeAudioData(buf);
    const ch0 = audioBuf.getChannelData(0);
    const ch1 = audioBuf.numberOfChannels > 1 ? audioBuf.getChannelData(1) : null;
    const len = audioBuf.length;
    const out = new Uint8Array(bins);
    const step = Math.max(1, Math.floor(len / bins));
    for (let i = 0; i < bins; i++) {
      const start = i * step;
      const end = Math.min(len, start + step);
      let peak = 0;
      for (let j = start; j < end; j++) {
        const v = ch1 ? (ch0[j] + ch1[j]) * 0.5 : ch0[j];
        const a = Math.abs(v);
        if (a > peak) peak = a;
      }
      out[i] = Math.max(0, Math.min(255, Math.round(peak * 255)));
    }
    try { ctx.close(); } catch {}
    return out;
  } catch {
    try { ctx.close(); } catch {}
    return null;
  }
}