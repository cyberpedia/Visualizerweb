import { TemplateConfig } from "../../state/store";

export type VisualizerFrame = {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  time: number;
  freq: Uint8Array;
  timeDomain: Uint8Array;
  template: TemplateConfig;
  trackInfo?: {
    title?: string;
    artist?: string;
  };
};

export type Visualizer = {
  draw: (frame: VisualizerFrame) => void;
};

export function clear(frame: VisualizerFrame) {
  const { ctx, width, height, template } = frame;
  if (template.background) {
    // Simple gradient background
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, template.background);
    grad.addColorStop(1, "#000000");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#0b1020";
    ctx.fillRect(0, 0, width, height);
  }
}