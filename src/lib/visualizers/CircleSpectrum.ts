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

const CircleSpectrum: Visualizer = {
  draw(frame) {
    const { ctx, width, height, freq, template, beatPulse } = frame;
    clear(frame);

    const centerX = width / 2;
    const centerY = height / 2;
    const baseRadius = template.circle?.radius ?? 160;
    const thickness = template.circle?.thickness ?? 8;
    const gap = template.circle?.gap ?? 2;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.shadowColor = template.color2;
    ctx.shadowBlur = template.glowStrength ?? 0;

    const points = 128;
    for (let i = 0; i < points; i++) {
      const angle = (i / points) * Math.PI * 2;
      const idx = Math.floor((i / points) * freq.length);
      const v = Math.pow(freq[idx] / 255, 1.2);
      const color = lerpColor(template.color1, template.color2, v);

      const r1 = baseRadius;
      const r2 = baseRadius + v * 120 * (1 + 0.15 * (beatPulse || 0));

      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = thickness;
      ctx.moveTo(Math.cos(angle) * r1, Math.sin(angle) * r1);
      ctx.lineTo(Math.cos(angle) * r2, Math.sin(angle) * r2);
      ctx.stroke();
    }

    ctx.restore();

    if (template.showInfo) {
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.font = "14px system-ui, -apple-system, Segoe UI, Roboto";
      ctx.textAlign = "center";
      ctx.fillText("Circle Spectrum", width / 2, height - 16);
      ctx.textAlign = "start";
    }
  }
};

export default CircleSpectrum;