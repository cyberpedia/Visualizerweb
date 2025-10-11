import { Visualizer, clear } from "./Base";

const Waveform: Visualizer = {
  draw(frame) {
    const { ctx, width, height, timeDomain, template } = frame;
    clear(frame);

    ctx.save();
    const margin = 24;
    const w = width - margin * 2;
    const h = height - margin * 2;
    ctx.translate(margin, margin);

    ctx.strokeStyle = template.color1;
    ctx.lineWidth = template.waveform?.thickness ?? 2;

    ctx.beginPath();
    for (let i = 0; i < timeDomain.length; i++) {
      const x = (i / (timeDomain.length - 1)) * w;
      const v = timeDomain[i] / 255;
      const y = h / 2 + (v - 0.5) * h * 0.9;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.restore();

    if (template.showInfo) {
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.font = "14px system-ui, -apple-system, Segoe UI, Roboto";
      ctx.fillText("Waveform", margin, margin + 12);
    }
  }
};

export default Waveform;