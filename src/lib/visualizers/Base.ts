import { TemplateConfig } from "../../state/store";

export type VisualizerFrame = {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  time: number;
  freq: Uint8Array;
  timeDomain: Uint8Array;
  template: TemplateConfig;
  beatPulse: number; // 0..1, rises on beat and decays
  bpm?: number;
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
  ctx.clearRect(0, 0, width, height);
  if (template.backgroundImageUrl || template.backgroundVideoUrl) {
    // When using a media background, do not fill here.
    return;
  }
  const bg = template.background ?? "#0b1020";
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
}