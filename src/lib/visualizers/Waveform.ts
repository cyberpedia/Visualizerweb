import { Visualizer, clear } from "./Base";

const Waveform: Visualizer = {
  draw(frame) {
    const { ctx, width, height, timeDomain, template, beatPulse, bpm } = frame;
    clear(frame);

    ctx.save();
    const margin = 24;
    const w = width - margin * 2;
    const h = height - margin * 2;
    ctx.translate(margin, margin);

    ctx.strokeStyle = template.color1;
    const baseThick = template.waveform?.thickness ?? 2;
    ctx.lineWidth = baseThick * (1 + 0.25 * (beatPulse || 0));
    ctx.shadowColor = template.color2;
    ctx.shadowBlur = template.glowStrength ?? 0;

    ctx.beginPath();
    for (let i = 0; i < timeDomain.length; i++) {
      const x = (i / (timeDomain.length - 1)) * w;
      const v = timeDomain[i] / 255;
      const y = h / 2 + (v - 0.5) * h * 0.9 * (1 + 0.1 * (beatPulse || 0));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.restore();

    if (template.showInfo) {
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.font = "14px system-ui, -apple-system, Segoe UI, Roboto";
      const text = bpm ? `Waveform • BPM ${Math.round(bpm)}` : "Waveform";
      ctx.fillText(text, margin, margin + 12);
    }
  }
};

export default Waveform;