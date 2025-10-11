import { Visualizer, clear } from "./Base";

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

const BarSpectrum: Visualizer = {
  draw(frame) {
    const { ctx, width, height, freq, template, beatPulse } = frame;
    clear(frame);

    const bars = template.barCount ?? 64;
    const margin = 24;
    const available = width - margin * 2;
    const gap = 4;
    const barW = available / bars - gap;
    const maxH = height - margin * 2;

    ctx.save();
    ctx.translate(margin, height - margin);
    ctx.shadowColor = template.color2;
    ctx.shadowBlur = template.glowStrength ?? 0;

    for (let i = 0; i < bars; i++) {
      const idx = Math.floor((i / bars) * freq.length);
      const v = freq[idx] / 255;
      const h = v * maxH * (1 + 0.15 * (beatPulse || 0));
      const color = lerpColor(template.color1, template.color2, v);
      ctx.fillStyle = color;
      ctx.fillRect(i * (barW + gap), -h, barW, h);
    }

    ctx.restore();

    if (template.showInfo) {
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.font = "14px system-ui, -apple-system, Segoe UI, Roboto";
      ctx.fillText("Bar Spectrum", margin, margin + 12);
    }
  }
};

export default BarSpectrum;