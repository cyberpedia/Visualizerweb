import { createFFmpeg } from "@ffmpeg/ffmpeg";
import MP4Box from "mp4box";

type DecodeMsg = {
  type: "decode";
  bytes?: ArrayBuffer;
  url?: string;
  fps: number;
  width: number;
  height: number;
};

type FrameMsg = {
  type: "frame";
  index: number;
  bytes: ArrayBuffer;
};

type RawFrameMsg = {
  type: "frameRaw";
  index: number;
  width: number;
  height: number;
  rgba: ArrayBuffer; // RGBA8 pixel data
};

type DoneMsg = { type: "done" };
type ErrorMsg = { type: "error"; message: string };
type InfoMsg = { type: "info"; message: string };

let aborted = false;

async function decodeWithWebCodecs(bytes: ArrayBuffer, fps: number, width: number, height: number): Promise<void> {
  const hasWebCodecs = typeof (self as any).VideoDecoder !== "undefined";
  if (!hasWebCodecs) throw new Error("WebCodecs not available");

  // Demux MP4 using mp4box.js
  const mp4boxfile = MP4Box.createFile();
  let videoTrack: any = null;
  let timescale = 0;

  const chunks: Array<{ data: Uint8Array; timestamp: number; duration: number; type: "key" | "delta" }> = [];

  mp4boxfile.onReady = (info: any) => {
    if (info && info.videoTracks && info.videoTracks.length) {
      videoTrack = info.videoTracks[0];
      timescale = videoTrack.timescale || 1;
      mp4boxfile.setExtractionOptions(videoTrack.id, "video", { nbSamples: 0, rapAlignment: true });
      mp4boxfile.start();
    } else {
      throw new Error("No video track in container");
    }
  };

  mp4boxfile.onSamples = (_id: number, _user: any, samples: any[]) => {
    for (const s of samples) {
      const data = s.data as Uint8Array;
      const dts = s.dts as number;
      const dur = s.duration as number;
      const ts = Math.round((dts / timescale) * 1e6); // microseconds
      const td = Math.round((dur / timescale) * 1e6);
      chunks.push({ data, timestamp: ts, duration: td, type: s.is_sync ? "key" : "delta" });
    }
  };

  // mp4box requires fileStart on buffer
  (bytes as any).fileStart = 0;
  mp4boxfile.appendBuffer(bytes);
  mp4boxfile.flush();

  if (!videoTrack) throw new Error("Video track not found");

  // Configure decoder
  const decoder = new (self as any).VideoDecoder({
    output: async (frame: any) => {
      try {
        if (aborted) { frame.close(); return; }
        const tsUs = frame.timestamp || 0;
        const tsSec = tsUs / 1e6;

        // Downsample to requested fps by scheduling next target time
        if ((decodeWithWebCodecs as any)._nextTimeSec == null) {
          (decodeWithWebCodecs as any)._nextTimeSec = 0;
          (decodeWithWebCodecs as any)._index = 0;
        }
        const nextT = (decodeWithWebCodecs as any)._nextTimeSec as number;
        const idx = (decodeWithWebCodecs as any)._index as number;
        const step = 1 / fps;
        if (tsSec + 1e-6 >= nextT) {
          // Draw to OffscreenCanvas and emit raw RGBA bytes
          const off = new OffscreenCanvas(width, height);
          const ctx = off.getContext("2d")!;
          ctx.drawImage(frame, 0, 0, width, height);
          const imgData = ctx.getImageData(0, 0, width, height);
          const rgba = imgData.data.buffer;
          const msg: RawFrameMsg = { type: "frameRaw", index: idx, width, height, rgba };
          (self as any).postMessage(msg, [msg.rgba]);
          (decodeWithWebCodecs as any)._nextTimeSec = nextT + step;
          (decodeWithWebCodecs as any)._index = idx + 1;
        }
      } catch (e) {
        // swallow per-frame errors
      } finally {
        try { frame.close(); } catch {}
      }
    },
    error: (e: any) => {
      // @ts-ignore
      (self as any).postMessage({ type: "error", message: e?.message || String(e) } as ErrorMsg);
    }
  });

  const codec = videoTrack.codec || "avc1.42E01E"; // default H.264 baseline if missing
  decoder.configure({ codec, codedWidth: videoTrack.track_width || width, codedHeight: videoTrack.track_height || height });

  // Feed chunks
  for (const c of chunks) {
    if (aborted) break;
    const chunk = new (self as any).EncodedVideoChunk({
      type: c.type,
      timestamp: c.timestamp,
      duration: c.duration,
      data: c.data
    });
    decoder.decode(chunk);
  }
  await decoder.flush();
}

self.onmessage = async (e: MessageEvent<DecodeMsg | { type: "abort" }>) => {
  const data = e.data as any;
  if (data.type === "abort") {
    aborted = true;
    return;
  }
  if (data.type !== "decode") return;

  const { bytes, url, fps, width, height } = data as DecodeMsg;

  // Try WebCodecs-based decode in worker (MP4 demux via mp4box.js)
  try {
    const sourceBytes = bytes ? bytes : (await (await fetch(url!)).arrayBuffer());
    // @ts-ignore
    postMessage({ type: "info", message: "Decoding background video with WebCodecs (worker) if supported..." } as InfoMsg);
    await decodeWithWebCodecs(sourceBytes, fps, width, height);
    // @ts-ignore
    postMessage({ type: "done" } as DoneMsg);
    return;
  } catch (err) {
    // Fallback path via ffmpeg.wasm
    try {
      // @ts-ignore
      postMessage({ type: "info", message: "WebCodecs decode unavailable or failed; falling back to ffmpeg.wasm." } as InfoMsg);
    } catch {}
  }

  // Fallback: ffmpeg.wasm frame extraction
  try {
    const ffmpeg = createFFmpeg({ log: false });
    await ffmpeg.load();

    // Write input file
    let inName = "input.mp4";
    if (url && !bytes) {
      const res = await fetch(url);
      const buf = await res.arrayBuffer();
      ffmpeg.FS("writeFile", inName, new Uint8Array(buf));
    } else if (bytes) {
      ffmpeg.FS("writeFile", inName, new Uint8Array(bytes));
    } else {
      const err: ErrorMsg = { type: "error", message: "No input provided" };
      // @ts-ignore
      postMessage(err);
      return;
    }

    // Transcode to PNG frames with scaling and desired FPS
    const outPattern = "bg_%05d.png";
    const vf = `scale=${width}:${height},fps=${fps}`;
    await ffmpeg.run("-i", inName, "-vf", vf, "-vsync", "vfr", outPattern);

    // Read frames sequentially
    let idx = 1;
    while (!aborted) {
      const name = `bg_${String(idx).padStart(5, "0")}.png`;
      let bytesOut: Uint8Array | null = null;
      try {
        bytesOut = ffmpeg.FS("readFile", name);
      } catch {
        break;
      }
      if (bytesOut) {
        const msg: FrameMsg = { type: "frame", index: idx - 1, bytes: bytesOut.buffer };
        // @ts-ignore
        postMessage(msg, [msg.bytes]);
      }
      idx++;
    }

    const done: DoneMsg = { type: "done" };
    // @ts-ignore
    postMessage(done);
  } catch (e: any) {
    const err: ErrorMsg = { type: "error", message: e?.message || String(e) };
    // @ts-ignore
    postMessage(err);
  }
};