import { Layer, KeyframeNumber, TemplateConfig, Mask } from "../state/store";

function cubicBezierY(t: number, x1: number, y1: number, x2: number, y2: number): number {
  const u = 1 - t;
  return (3 * u * u * t * y1) + (3 * u * t * t * y2) + (t * t * t);
}

function interpKF(kf: KeyframeNumber[] | undefined, t: number, base: number): number {
  if (!kf || kf.length === 0) return base;
  const sorted = kf.slice().sort((a, b) => a.time - b.time);
  if (t <= sorted[0].time) return sorted[0].value;
  if (t >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1].value;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (t >= a.time && t <= b.time) {
      const tt = (t - a.time) / (b.time - a.time);
      const ease = a.easing ?? "linear";
      let e =
        ease === "easeIn" ? tt * tt :
        ease === "easeOut" ? tt * (2 - tt) :
        ease === "easeInOut" ? (tt < 0.5 ? 2 * tt * tt : -1 + (4 - 2 * tt) * tt) :
        tt;
      if (ease === "bezier" && a.bezier) {
        e = cubicBezierY(tt, a.bezier.x1, a.bezier.y1, a.bezier.x2, a.bezier.y2);
      }
      return a.value + (b.value - a.value) * e;
    }
  }
  return base;
}

function reactiveVal(base: number, layer: any, prop: "x" | "y" | "opacity" | "size", beatPulse: number): number {
  const r = layer.reactive;
  if (!r || r.target !== prop) return base;
  const amt = r.amount ?? 0;
  const sm = Math.max(0, Math.min(1, r.smooth ?? 0));
  const p = beatPulse;
  // simple smoothing: dampen pulse influence
  const eff = p * (1 - sm) + (p * p) * sm * 0.5;
  return base + amt * eff;
}

function applyCommon(ctx: CanvasRenderingContext2D, layer: any, x: number, y: number) {
  ctx.globalCompositeOperation = layer.blendMode || "source-over";
  ctx.shadowBlur = layer.shadowBlur || 0;
  ctx.shadowColor = layer.shadowColor || "transparent";
  // Canvas2D filters
  const f = layer.filters || {};
  const parts: string[] = [];
  if (typeof f.blur === "number" && f.blur > 0) parts.push(`blur(${f.blur}px)`);
  if (typeof f.hue === "number" && f.hue !== 0) parts.push(`hue-rotate(${f.hue}deg)`);
  if (typeof f.saturate === "number" && f.saturate > 0 && f.saturate !== 1) parts.push(`saturate(${f.saturate})`);
  if (typeof f.brightness === "number" && f.brightness > 0 && f.brightness !== 1) parts.push(`brightness(${f.brightness})`);
  if (typeof f.contrast === "number" && f.contrast > 0 && f.contrast !== 1) parts.push(`contrast(${f.contrast})`);
  (ctx as any).filter = parts.length ? parts.join(" ") : "none";

  const rot = (layer.rotation || 0) * Math.PI / 180;
  const sx = layer.scaleX ?? 1;
  const sy = layer.scaleY ?? 1;
  const ax = layer.anchorX ?? 0;
  const ay = layer.anchorY ?? 0;
  ctx.translate(x + ax, y + ay);
  if (rot) ctx.rotate(rot);
  if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
  ctx.translate(-(x + ax), -(y + ay));
}

function applyMask(
  ctx: CanvasRenderingContext2D,
  mask?: Mask,
  maskTransform?: { x?: number; y?: number; rotation?: number; scaleX?: number; scaleY?: number }
) {
  if (!mask) return;
  if (mask.type === "image") {
    // handled separately via destination-in compositing after drawing
    return;
  }
  ctx.save();
  if (maskTransform) {
    const mx = maskTransform.x ?? 0;
    const my = maskTransform.y ?? 0;
    const mr = (maskTransform.rotation ?? 0) * Math.PI / 180;
    const msx = maskTransform.scaleX ?? 1;
    const msy = maskTransform.scaleY ?? 1;
    ctx.translate(mx, my);
    if (mr) ctx.rotate(mr);
    if (msx !== 1 || msy !== 1) ctx.scale(msx, msy);
  }
  ctx.beginPath();
  if ((mask as any).type === "rect") {
    const m = mask as any;
    ctx.rect(m.x, m.y, m.width, m.height);
  } else if ((mask as any).type === "circle") {
    const m = mask as any;
    ctx.arc(m.x, m.y, m.radius, 0, Math.PI * 2);
  } else if ((mask as any).type === "polygon" && Array.isArray((mask as any).points) && (mask as any).points.length) {
    const pts = (mask as any).points as Array<{ x: number; y: number }>;
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
  }
  ctx.closePath();
  ctx.clip();
}

function endMask(ctx: CanvasRenderingContext2D, mask?: Mask) {
  if (!mask) return;
  if (mask.type === "image") return;
  ctx.restore();
}

// Image mask via destination-in compositing
function applyImageMask(ctx: CanvasRenderingContext2D, mask: Mask | undefined, x: number, y: number, w: number, h: number) {
  if (!mask || mask.type !== "image" || !mask.src) return;
  const img = new Image();
  img.src = mask.src;
  if (!img.complete) return;
  const prev = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(img, x, y, w, h);
  ctx.globalCompositeOperation = prev;
}

function drawText(
  ctx: CanvasRenderingContext2D,
  layer: any,
  time: number,
  beatPulse: number
) {
  let x = interpKF(layer.kf?.x, time, layer.x);
  let y = interpKF(layer.kf?.y, time, layer.y);
  let opacity = interpKF(layer.kf?.opacity, time, layer.opacity);
  let size = interpKF(layer.kf?.size, time, layer.size);
  x = reactiveVal(x, layer, "x", beatPulse);
  y = reactiveVal(y, layer, "y", beatPulse);
  opacity = reactiveVal(opacity, layer, "opacity", beatPulse);
  size = reactiveVal(size, layer, "size", beatPulse);

  ctx.save();
  ctx.globalAlpha = opacity;
  applyCommon(ctx, layer, x, y);
  applyMask(ctx, layer.mask, layer.maskTransform);
  ctx.fillStyle = layer.color;
  ctx.font = `${size}px system-ui, -apple-system, Segoe UI, Roboto`;
  ctx.textAlign = layer.align as CanvasTextAlign;
  if (layer.strokeColor && layer.strokeWidth) {
    ctx.lineWidth = layer.strokeWidth;
    ctx.strokeStyle = layer.strokeColor;
    ctx.strokeText(layer.text, x, y);
  }
  ctx.fillText(layer.text, x, y);
  endMask(ctx, layer.mask);
  const w = Math.ceil(ctx.measureText(layer.text).width);
  const h = Math.ceil(size * 1.3);
  applyImageMask(ctx, layer.mask, x, y - size * 0.05, w, h);
  ctx.restore();
}

function drawImage(
  ctx: CanvasRenderingContext2D,
  layer: any,
  time: number,
  beatPulse: number
) {
  let x = interpKF(layer.kf?.x, time, layer.x);
  let y = interpKF(layer.kf?.y, time, layer.y);
  let opacity = interpKF(layer.kf?.opacity, time, layer.opacity);
  let size = interpKF(layer.kf?.size, time, Math.max(layer.width, layer.height));
  x = reactiveVal(x, layer, "x", beatPulse);
  y = reactiveVal(y, layer, "y", beatPulse);
  opacity = reactiveVal(opacity, layer, "opacity", beatPulse);
  size = reactiveVal(size, layer, "size", beatPulse);

  const img = new Image();
  img.src = layer.src;
  if (!img.complete) return;
  const w = layer.width ?? size;
  const h = layer.height ?? size;
  ctx.save();
  ctx.globalAlpha = opacity;
  applyCommon(ctx, layer, x, y);
  if (layer.clipCircle) {
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
  } else {
    applyMask(ctx, layer.mask, layer.maskTransform);
  }
  ctx.drawImage(img, x, y, w, h);
  endMask(ctx, layer.mask);
  applyImageMask(ctx, layer.mask, x, y, w, h);
  ctx.restore();
}

function drawShape(
  ctx: CanvasRenderingContext2D,
  layer: any,
  time: number,
  beatPulse: number
) {
  let x = interpKF(layer.kf?.x, time, layer.x);
  let y = interpKF(layer.kf?.y, time, layer.y);
  let opacity = interpKF(layer.kf?.opacity, time, layer.opacity);
  x = reactiveVal(x, layer, "x", beatPulse);
  y = reactiveVal(y, layer, "y", beatPulse);
  opacity = reactiveVal(opacity, layer, "opacity", beatPulse);

  ctx.save();
  ctx.globalAlpha = opacity;
  applyCommon(ctx, layer, x, y);
  applyMask(ctx, layer.mask, layer.maskTransform);
  let wRect = 100, hRect = 50;
  if (layer.shape === "rect") {
    const w = layer.width ?? 100;
    const h = layer.height ?? 50;
    wRect = w; hRect = h;
    if (layer.fillGradient && (layer.fillGradient.from && layer.fillGradient.to)) {
      const grad = layer.fillGradient.horizontal
        ? ctx.createLinearGradient(x, y, x + w, y)
        : ctx.createLinearGradient(x, y, x, y + h);
      grad.addColorStop(0, layer.fillGradient.from);
      grad.addColorStop(1, layer.fillGradient.to);
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, w, h);
    } else if (layer.fillColor) {
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
    wRect = r * 2; hRect = r * 2;
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
  endMask(ctx, layer.mask);
  applyImageMask(ctx, layer.mask, x, y, wRect, hRect);
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
  duration: number,
  beatPulse: number
) {
  let x = interpKF(layer.kf?.x, time, layer.x);
  let y = interpKF(layer.kf?.y, time, layer.y);
  let opacity = interpKF(layer.kf?.opacity, time, layer.opacity);
  let radius = interpKF(layer.kf?.size, time, layer.radius);
  x = reactiveVal(x, layer, "x", beatPulse);
  y = reactiveVal(y, layer, "y", beatPulse);
  opacity = reactiveVal(opacity, layer, "opacity", beatPulse);
  radius = reactiveVal(radius, layer, "size", beatPulse);

  const thick = layer.thickness ?? 8;

  const t = duration > 0 ? Math.min(1, Math.max(0, time / duration)) : 0;
  const endAngle = -Math.PI / 2 + t * Math.PI * 2;

  ctx.save();
  ctx.globalAlpha = opacity;
  applyMask(ctx, layer.mask, layer.maskTransform);
  ctx.lineWidth = thick;
  ctx.strokeStyle = lerpColor(layer.color1, layer.color2, t);
  ctx.beginPath();
  ctx.arc(x, y, radius, -Math.PI / 2, endAngle);
  ctx.stroke();
  endMask(ctx, layer.mask);
  // image mask centered around ring bounds
  applyImageMask(ctx, layer.mask, x - radius, y - radius, radius * 2, radius * 2);
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
  applyMask(ctx, layer.mask, layer.maskTransform);
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
  endMask(ctx, layer.mask);
  // image mask across full canvas if specified
  applyImageMask(ctx, layer.mask, 0, 0, width, height);
  ctx.restore();
}

function renderGroup(
  ctx: CanvasRenderingContext2D,
  group: any,
  width: number,
  height: number,
  template: TemplateConfig,
  time: number,
  duration: number,
  beatPulse: number
) {
  const x = interpKF(group.kf?.x, time, group.x);
  const y = interpKF(group.kf?.y, time, group.y);
  const opacity = interpKF(group.kf?.opacity, time, group.opacity);
  ctx.save();
  ctx.globalAlpha = opacity;
  applyCommon(ctx, group, x, y);
  applyMask(ctx, group.mask, group.maskTransform);

  const children = (template.layers ?? [])
    .filter((l) => (l as any).parentId === group.id)
    .slice()
    .sort((a, b) => a.zIndex - b.zIndex);

  for (const child of children as any[]) {
    if (!child.visible) continue;
    switch (child.type) {
      case "text":
        drawText(ctx, child, time, beatPulse);
        break;
      case "image":
        drawImage(ctx, child, time, beatPulse);
        break;
      case "shape":
        drawShape(ctx, child, time, beatPulse);
        break;
      case "progressRing":
        drawProgressRing(ctx, child, time, duration, beatPulse);
        break;
      case "particles":
        drawParticles(ctx, child, width, height, beatPulse);
        break;
      case "group":
        renderGroup(ctx, child, width, height, template, time, duration, beatPulse);
        break;
    }
  }

  endMask(ctx, group.mask);
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
  for (const layer of layers as any[]) {
    if (!layer.visible) continue;
    // render only root-level layers in this pass; groups will render their children recursively
    if (layer.parentId) continue;
    switch (layer.type) {
      case "text":
        drawText(ctx, layer, time, beatPulse);
        break;
      case "image":
        drawImage(ctx, layer, time, beatPulse);
        break;
      case "shape":
        drawShape(ctx, layer, time, beatPulse);
        break;
      case "progressRing":
        drawProgressRing(ctx, layer, time, duration, beatPulse);
        break;
      case "particles":
        drawParticles(ctx, layer, width, height, beatPulse);
        break;
      case "group":
        renderGroup(ctx, layer, width, height, template, time, duration, beatPulse);
        break;
    }
  }
}

// simple particles cache per invocation
const particlesCache = new WeakMap<Layer, { x: number; y: number }[]>();



