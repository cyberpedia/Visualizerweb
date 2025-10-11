import { createFFmpeg } from "@ffmpeg/ffmpeg";

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

type DoneMsg = { type: "done" };
type ErrorMsg = { type: "error"; message: string };

let aborted = false;

self.onmessage = async (e: MessageEvent<DecodeMsg | { type: "abort" }>) => {
  const data = e.data as any;
  if (data.type === "abort") {
    aborted = true;
    return;
  }
  if (data.type !== "decode") return;

  const { bytes, url, fps, width, height } = data as DecodeMsg;
  try {
    const ffmpeg = createFFmpeg({ log: false });
    await ffmpeg.load();

    // Write input file
    let inName = "input.mp4";
    if (url && !bytes) {
      // Fetch to bytes to avoid CORS issues
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