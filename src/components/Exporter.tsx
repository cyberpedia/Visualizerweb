import React, { useEffect, useRef, useState } from "react";
import { audioEngine } from "../lib/audio";
import { usePlayerStore } from "../state/store";

const Exporter: React.FC = () => {
  const playing = usePlayerStore((s) => s.playing);
  const canvasEl = usePlayerStore((s) => s.canvasEl);
  const exportActive = usePlayerStore((s) => s.exportActive);
  const setExportActive = usePlayerStore((s) => s.setExportActive);
  const exportSettings = usePlayerStore((s) => s.exportSettings);
  const setExportSettings = usePlayerStore((s) => s.setExportSettings);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (!exportActive) return;

    // wait a tick for canvas to resize based on exportSettings
    const start = async () => {
      if (!canvasEl) {
        alert("No canvas detected.");
        setExportActive(false);
        return;
      }
      const fps = exportSettings.fps || 30;
      const videoStream = canvasEl.captureStream(fps);
      const audioStream = audioEngine.getAudioStream();
      if (!audioStream) {
        alert("Unable to capture audio stream.");
        setExportActive(false);
        return;
      }

      const composed = new MediaStream();
      for (const t of videoStream.getVideoTracks()) composed.addTrack(t);
      const audioTrack = audioStream.getAudioTracks()[0];
      if (audioTrack) composed.addTrack(audioTrack);

      const options: MediaRecorderOptions = {
        mimeType: "video/webm;codecs=vp9,opus",
        bitsPerSecond: exportSettings.bitrate || 4_000_000
      };

      try {
        const rec = new MediaRecorder(composed, options);
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
          setExportActive(false);
        };

        rec.start();
      } catch (e) {
        alert("MediaRecorder not supported with the chosen settings. Try Chrome/Edge.");
        setExportActive(false);
      }
    };

    const id = requestAnimationFrame(() => start());
    return () => cancelAnimationFrame(id);
  }, [exportActive, canvasEl, exportSettings.fps, exportSettings.bitrate]);

  const toggleExport = () => {
    if (exportActive) {
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") rec.stop();
      setExportActive(false);
    } else {
      if (!playing) {
        alert("Start playback before exporting.");
        return;
      }
      setExportActive(true);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        className={`px-3 py-1 rounded ${exportActive ? "bg-red-600 hover:bg-red-500" : "bg-gray-800 hover:bg-gray-700"}`}
        onClick={toggleExport}
        title={!playing ? "Start playback to enable export" : ""}
      >
        {exportActive ? "Stop Export" : "Export Video"}
      </button>
      <select
        className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
        value={exportSettings.mode}
        onChange={(e) => setExportSettings({ mode: e.target.value as any })}
      >
        <option value="auto">Auto</option>
        <option value="1080p">1080p</option>
        <option value="720p">720p</option>
        <option value="custom">Custom</option>
      </select>
      {exportSettings.mode === "custom" && (
        <>
          <input
            type="number"
            placeholder="Width"
            value={exportSettings.width ?? ""}
            onChange={(e) => setExportSettings({ width: Number(e.target.value) })}
            className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs w-20"
          />
          <input
            type="number"
            placeholder="Height"
            value={exportSettings.height ?? ""}
            onChange={(e) => setExportSettings({ height: Number(e.target.value) })}
            className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs w-20"
          />
        </>
      )}
      <select
        className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
        value={exportSettings.fps}
        onChange={(e) => setExportSettings({ fps: Number(e.target.value) })}
      >
        <option value={24}>24 fps</option>
        <option value={30}>30 fps</option>
        <option value={60}>60 fps</option>
      </select>
      <input
        type="number"
        value={exportSettings.bitrate}
        onChange={(e) => setExportSettings({ bitrate: Number(e.target.value) })}
        className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs w-28"
        title="Bits per second"
      />
    </div>
  );
};

export default Exporter;