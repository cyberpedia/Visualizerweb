import { createFFmpeg, FetchFile } from "@ffmpeg/ffmpeg";
import { Track } from "../state/store";

export type OfflineExportOptions = {
  canvas: HTMLCanvasElement;
  fps: number;
  width: number;
  height: number;
  bitrate: number;
  track: Track | null;
  onProgress?: (p: number, phase: "capture" | "encode") => void;
  signal?: AbortSignal;
};

async function canvasToPNGBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((b) => {
        if (!b) reject(new Error("toBlob failed"));
        else resolve(b);
      }, "image/png");
    } catch (e) {
      reject(e);
    }
  });
}

async function readTrackAudio(track: Track | null): Promise<{ data: Uint8Array; name: string } | null> {
  if (!track) return null;
  try {
    if ((track as any).file instanceof File) {
      const f = (track as any).file as File;
      const buf = await f.arrayBuffer();
      return { data: new Uint8Array(buf), name: `audio${f.name.slice(f.name.lastIndexOf(".")) || ".mp3"}` };
    }
    // try fetch; works for http(s) URLs, may fail for blob: in some browsers
    const res = await fetch(track.url);
    const buf = await res.arrayBuffer();
    const ext = track.url.split(".").pop()?.toLowerCase() || "mp3";
    return { data: new Uint8Array(buf), name: `audio.${ext}` };
  } catch {
    return null;
  }
}

export async function exportOfflineMP4(opts: OfflineExportOptions): Promise<Blob> {
  const { canvas, fps, width, height, bitrate, track, onProgress, signal } = opts;

  // Ensure canvas is at desired resolution
  // We assume caller has already set exportActive and canvas resize logic is in place
  const durationSec = (track?.duration ?? 0) || 0;
  const frameCount = durationSec > 0 ? Math.ceil(durationSec * fps) : fps * 10; // fallback 10s

  // Capture frames while playback continues
  const frames: Uint8Array[] = [];
  for (let i = 0; i < frameCount; i++) {
    if (signal?.aborted) throw new Error("aborted");
    const blob = await canvasToPNGBlob(canvas);
    const ab = await blob.arrayBuffer();
    frames.push(new Uint8Array(ab));
    if (onProgress) onProgress(i / frameCount, "capture");
    // attempt to pace to fps
    await new Promise((r) => setTimeout(r, Math.max(0, Math.round(1000 / fps))));
  }

  // Prepare ffmpeg
  const ffmpeg = createFFmpeg({ log: true });
  await ffmpeg.load();

  // Write frames
  for (let i = 0; i < frames.length; i++) {
    const name = `frame_${String(i + 1).padStart(5, "0")}.png`;
    ffmpeg.FS("writeFile", name, frames[i]);
  }

  // Write audio if available
  const audio = await readTrackAudio(track);
  if (audio) {
    ffmpeg.FS("writeFile", audio.name, audio.data);
  }

  // Run encoding
  const inputPattern = "frame_%05d.png";
  const args = [
    "-framerate", String(fps),
    "-i", inputPattern,
  ];

  if (audio) {
    args.push("-i", audio.name);
  }

  // video codec and options
  args.push(
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-preset", "veryfast",
    "-b:v", String(bitrate || 4_000_000),
  );

  if (audio) {
    // try aac, fallback handled by ffmpeg
    args.push("-c:a", "aac");
    // ensure shortest in case of frame count mismatch
    args.push("-shortest");
  }

  args.push("out.mp4");

  await ffmpeg.run(...args);
  if (onProgress) onProgress(1, "encode");

  const out = ffmpeg.FS("readFile", "out.mp4");
  return new Blob([out.buffer], { type: "video/mp4" });
}