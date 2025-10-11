import React, { useEffect, useRef, useState } from "react";
import { audioEngine } from "../lib/audio";
import { usePlayerStore } from "../state/store";

const Exporter: React.FC = () => {
  const playing = usePlayerStore((s) => s.playing);
  const [recording, setRecording] = useState(false);
  const [size, setSize] = useState("auto");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (!recording) return;
    // webm recording will work in Chromium-based browsers
    const stream = audioEngine.getStream();
    if (!stream) {
      alert("Unable to capture stream. Try Chrome/Edge and ensure a track and visualizer are active.");
      setRecording(false);
      return;
    }
    const rec = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9,opus" });
    recorderRef.current = rec;
    chunksRef.current = [];

    rec.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
    };
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `avee-export-${Date.now()}.webm`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setRecording(false);
    };

    rec.start();
    return () => {
      if (rec.state !== "inactive") rec.stop();
    };
  }, [recording]);

  return (
    <div className="flex items-center gap-2">
      <button
        className={`px-3 py-1 rounded ${recording ? "bg-red-600 hover:bg-red-500" : "bg-gray-800 hover:bg-gray-700"}`}
        onClick={() => setRecording((r) => !r)}
        disabled={!playing}
        title={!playing ? "Start playback to enable export" : ""}
      >
        {recording ? "Stop Export" : "Export Video"}
      </button>
      <select
        className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
        value={size}
        onChange={(e) => setSize(e.target.value)}
      >
        <option value="auto">Auto</option>
        <option value="1080p">1080p</option>
        <option value="720p">720p</option>
      </select>
    </div>
  );
};

export default Exporter;