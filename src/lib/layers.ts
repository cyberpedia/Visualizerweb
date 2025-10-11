import { Layer, KeyframeNumber, TemplateConfig } from "../state/store";

function interpKF(kf: KeyframeNumber[] | undefined, t: number, base: number): number {
  if (!kf || kf.length === 0) return base;
  const sorted = kf.slice().sort((a, b) => a.time - b.time);
  if (t <= sorted[0].time) return sorted[0].value;
  if (t >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1].value;
  // find segment
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (t >= a.time && t <= b.time) {
      const tt = (t - a.time) / (b.time - a.time);
      const ease = a.easing ?? "linear";
      const e =
        ease === "easeIn" ? tt * tt :
        ease === "easeOut" ? tt * (2 - tt) :
        ease === "easeInOut" ? (tt < 0.5 ? 2 * tt * tt : -1 + (4 - 2 * tt) * tt) :
        tt;
      return a.value + (b.value - a.value) * e;
    }
  }
  return base;
}

function drawText(
  ctx: CanvasRenderingContext2D,
  layer: any,
  time: number
) {
  const x = interpKF(layer.kf?.x, time, layer.x);
  const y = interpKF(layer.kf?.y, time, layer.y);
  const opacity = interpKF(layer.kf?.opacity, time, layer.opacity);
  const size = interpKF(layer.kf?.size, time, layer.size);

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = layer.color;
  ctx.font = `${size}px system-ui, -apple-system, Segoe UI, Roboto`;
  ctx.textAlign = layer.align;
  ctx.fillText(layer.text, x, y);
  ctx.restore();
}

function drawImage(
  ctx: CanvasRenderingContext2D,
  layer: any,
  time: number
) {
  const x = interpKF(layer.kf?.x, time, layer.x);
  const y = interpKF(layer.kf?.y, time, layer.y);
  const opacity = interpKF(layer.kf?.opacity, time, layer.opacity);
  const size = interpKF(layer.kf?.size, time, Math.max(layer.width, layer.height));

  const img = new Image();
  img.src = layer.src;
  if (!img.complete) return;
  const w = layer.width ?? size;
  const h = layer.height ?? size;
  ctx.save();
  ctx.globalAlpha = opacity;
  if (layer.clipCircle) {
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
  }
  ctx.drawImage(img, x, y, w, h);
  ctx.restore();
}

function drawShape(
  ctx: CanvasRenderingContext2D,
  layer: any,
  time: number
) {
  const x = interpKF(layer.kf?.x, time, layer.x);
  const y = interpKF(layer.kf?.y, time, layer.y);
  const opacity = interpKF(layer.kf?.opacity, time, layer.opacity);
  ctx.save();
  ctx.globalAlpha = opacity;
  if (layer.shape === "rect") {
    const w = layer.width ?? 100;
    const h = layer.height ?? 50;
    if (layer.fillColor) {
      ctx.fillStyle = layer.fillColor;
      ctx.fillRect(x, y, w, h);
    }
    if (layer.strokeColor && layer.strokeWidth) {
      ctx.strokeStyle = layer.strokeColor;
      ctx.lineWidth = layer.strokeWidth;
      ctx.strokeRect(x, y, w, h);
    }
  } else if (layer.shape === "circle") {
    const r = layer.radius ?? 40;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.closePath();
    if (layer.fillColor) {
      ctx.fillStyle = layer.fillColor;
      ctx.fill();
    }
    if (layer.strokeColor && layer.strokeWidth) {
      ctx.strokeStyle = layer.strokeColor;
      ctx.lineWidth = layer.strokeWidth;
      ctx.stroke();
    }
  }
  ctx.restore();
}

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

function drawProgressRing(
  ctx: CanvasRenderingContext2D,
  layer: any,
  time: number,
  duration: number
) {
  const x = interpKF(layer.kf?.x, time, layer.x);
  const y = interpKF(layer.kf?.y, time, layer.y);
  const opacity = interpKF(layer.kf?.opacity, time, layer.opacity);
  const radius = interpKF(layer.kf?.size, time, layer.radius);
  const thick = layer.thickness ?? 8;

  const t = duration > 0 ? Math.min(1, Math.max(0, time / duration)) : 0;
  const endAngle = -Math.PI / 2 + t * Math.PI * 2;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.lineWidth = thick;
  ctx.strokeStyle = lerpColor(layer.color1, layer.color2, t);
  ctx.beginPath();
  ctx.arc(x, y, radius, -Math.PI / 2, endAngle);
  ctx.stroke();
  ctx.restore();
}

// simple particles cache per invocation
const particlesCache = new WeakMap<Layer, { x: number; y: number }[]>();

function drawParticles(
  ctx: CanvasRenderingContext2D,
  layer: any,
  width: number,
  height: number,
  beatPulse: number
) {
  let parts = particlesCache.get(layer);
  if (!parts) {
    parts = Array.from({ length: layer.count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height
    }));
    particlesCache.set(layer, parts);
  }

  ctx.save();
  ctx.globalAlpha = layer.opacity;
  ctx.fillStyle = layer.color;
  const speed = layer.speed * (1 + 0.5 * (beatPulse || 0));
  for (const p of parts) {
    p.y -= speed;
    if (p.y < -10) p.y = height + 10;
    const s = layer.size * (1 + 0.3 * (beatPulse || 0));
    ctx.beginPath();
    ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawLayers(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  template: TemplateConfig,
  time: number,
  duration: number,
  beatPulse: number
) {
  const layers = (template.layers ?? []).slice().sort((a, b) => a.zIndex - b.zIndex);
  for (const layer of layers) {
    if (!layer.visible) continue;
    switch (layer.type) {
      case "text":
        drawText(ctx, layer, time);
        break;
      case "image":
        drawImage(ctx, layer, time);
        break;
      case "shape":
        drawShape(ctx, layer, time);
        break;
      case "progressRing":
        drawProgressRing(ctx, layer, time, duration);
        break;
      case "particles":
        drawParticles(ctx, layer, width, height, beatPulse);
        break;
    }
  }
}