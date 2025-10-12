import { TemplateConfig } from "../state/store";

type TrackInfo = {
  title?: string;
  artist?: string;
  artUrl?: string | null;
};

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  template: TemplateConfig
) {
  if (template.backgroundImageUrl) {
    // draw image as background if provided
    const img = new Image();
    img.src = template.backgroundImageUrl;
    img.onload = () => {
      ctx.drawImage(img, 0, 0, width, height);
    };
    // fallback fill while loading
    if (template.background) {
      ctx.fillStyle = template.background;
      ctx.fillRect(0, 0, width, height);
    }
  } else {
    const bg = template.background ?? "#0b1020";
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
  }
}

export function drawOverlays(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  template: TemplateConfig,
  track: TrackInfo
) {
  // album art
  if (template.showAlbumArt && track.artUrl) {
    try {
      const img = new Image();
      img.src = track.artUrl;
      const size = template.albumArtSize ?? 96;
      const pad = 16;
      img.onload = () => {
        ctx.save();
        // compositing
        ctx.globalCompositeOperation = template.albumArtBlendMode || "source-over";
        // circular mask
        ctx.beginPath();
        ctx.arc(pad + size / 2, pad + size / 2, size / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(img, pad, pad, size, size);
        ctx.restore();
      };
    } catch {}
  }

  // title overlay
  if (template.titleOverlay?.show && track.title) {
    ctx.save();
    ctx.globalCompositeOperation = template.titleOverlay.blendMode || "source-over";
    ctx.fillStyle = template.titleOverlay.color;
    ctx.font = `${template.titleOverlay.size}px system-ui, -apple-system, Segoe UI, Roboto`;
    ctx.textAlign = template.titleOverlay.align as any;
    const x = template.titleOverlay.x;
    const y = template.titleOverlay.y;
    ctx.fillText(track.title, x, y);
    ctx.restore();
  }

  // artist overlay
  if (template.artistOverlay?.show && track.artist) {
    ctx.save();
    ctx.globalCompositeOperation = template.artistOverlay.blendMode || "source-over";
    ctx.fillStyle = template.artistOverlay.color;
    ctx.font = `${template.artistOverlay.size}px system-ui, -apple-system, Segoe UI, Roboto`;
    ctx.textAlign = template.artistOverlay.align as any;
    const x = template.artistOverlay.x;
    const y = template.artistOverlay.y;
    ctx.fillText(track.artist, x, y);
    ctx.restore();
  }
}