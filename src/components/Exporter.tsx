import React, { useEffect, useRef, useState } from "react";
import { audioEngine } from "../lib/audio";
import { usePlayerStore } from "../state/store";
import { exportOfflineMP4 } from "../lib/offlineExport";

const Exporter: React.FC = () => {
  const playing = usePlayerStore((s) => s.playing);
  const canvasEl = usePlayerStore((s) => s.canvasEl);
  const exportActive = usePlayerStore((s) => s.exportActive);
  const setExportActive = usePlayerStore((s) => s.setExportActive);
  const exportSettings = usePlayerStore((s) => s.exportSettings);
  const setExportSettings = usePlayerStore((s) => s.setExportSettings);
  const currentTrack = usePlayerStore((s) => s.playlist[s.currentIndex] ?? null);
  const template = usePlayerStore((s) => s.visualizerTemplate);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [offlineProgress, setOfflineProgress] = useState<{ p: number; phase: "capture" | "encode" | null }>({ p: 0, phase: null });
  const abortCtrlRef = useRef<AbortController | null>(null);

  const applyPreset = (profile: "fast" | "balanced" | "high") => {
    if (profile === "fast") {
      setExportSettings({
        encodeProfile: "fast",
        preset: "veryfast",
        forceCrf: false,
        crf: 24,
        bitrate: 6_000_000,
        audioBitrateKbps: 160,
        pixelFormat: "yuv420p",
        parallelWorkers: 3
      });
    } else if (profile === "balanced") {
      setExportSettings({
        encodeProfile: "balanced",
        preset: "fast",
        forceCrf: true,
        crf: 22,
        audioBitrateKbps: 192,
        pixelFormat: "yuv420p",
        parallelWorkers: 2
      });
    } else {
      setExportSettings({
        encodeProfile: "high",
        preset: "slow",
        forceCrf: true,
        crf: 18,
        audioBitrateKbps: 320,
        pixelFormat: "yuv444p",
        parallelWorkers: 1
      });
    }
  };

  useEffect(() => {
    if (!exportActive) return;

    if (exportSettings.engine === "offline") {
      // Offline export via ffmpeg.wasm
      const run = async () => {
        if (!canvasEl) {
          alert("No canvas detected.");
          setExportActive(false);
          return;
        }
        abortCtrlRef.current = new AbortController();

        try {
          const fps = exportSettings.fps || 30;
          // wait a tick for canvas to resize based on exportSettings
          await new Promise((r) => setTimeout(r, 50));

          // start capture & encode
          const blob = await exportOfflineMP4({
            canvas: canvasEl,
            fps,
            width: canvasEl.width,
            height: canvasEl.height,
            bitrate: exportSettings.bitrate || 4_000_000,
            track: currentTrack,
            template,
            onProgress: (p, phase) => setOfflineProgress({ p, phase }),
            signal: abortCtrlRef.current.signal,
            encode: {
              crf: exportSettings.forceCrf ? exportSettings.crf : undefined,
              preset: exportSettings.preset,
              audioBitrateKbps: exportSettings.audioBitrateKbps,
              pixelFormat: exportSettings.pixelFormat,
              videoCodec: "libx264"
            },
            parallelWorkers: exportSettings.parallelWorkers ?? 2
          });

          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `avee-export-${Date.now()}.mp4`;
          document.body.appendChild(a);
          a.click();
          a.remove();
        } catch (e) {
          if (!(e as any)?.message?.includes("aborted")) {
            alert("Offline export failed. Try a shorter clip or lower bitrate.");
          }
        } finally {
          setExportActive(false);
          setOfflineProgress({ p: 0, phase: null });
          abortCtrlRef.current = null;
        }
      };
      run();
      return;
    }

    // Real-time export via MediaRecorder
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
  }, [exportActive, canvasEl, exportSettings.fps, exportSettings.bitrate, exportSettings.engine, currentTrack?.id]);

  const toggleExport = () => {
    if (exportActive) {
      if (exportSettings.engine === "offline") {
        abortCtrlRef.current?.abort();
      } else {
        const rec = recorderRef.current;
        if (rec && rec.state !== "inactive") rec.stop();
      }
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
        value={exportSettings.engine ?? "realtime"}
        onChange={(e) => setExportSettings({ engine: e.target.value as any })}
        title="Choose export engine"
      >
        <option value="realtime">Realtime (WebM)</option>
        <option value="offline">Offline (MP4)</option>
      </select>

      {exportSettings.engine === "offline" && (
        <select
          className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
          value={exportSettings.encodeProfile ?? "balanced"}
          onChange={(e) => applyPreset(e.target.value as any)}
          title="Export preset"
        >
          <option value="fast">Fast</option>
          <option value="balanced">Balanced</option>
          <option value="high">High Quality</option>
        </select>
      )}

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
      {!(exportSettings.engine === "offline" && exportSettings.forceCrf) && (
        <input
          type="number"
          value={exportSettings.bitrate}
          onChange={(e) => setExportSettings({ bitrate: Number(e.target.value) })}
          className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs w-28"
          title="Bits per second"
        />
      )}

      {exportSettings.engine === "offline" && (
        <>
          <label className="flex items-center gap-1 text-xs text-gray-300">
            <input
              type="checkbox"
              checked={!!exportSettings.forceCrf}
              onChange={(e) => setExportSettings({ forceCrf: e.target.checked })}
            />
            Use CRF
          </label>
          <select
            className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
            value={exportSettings.preset ?? "veryfast"}
            onChange={(e) => setExportSettings({ preset: e.target.value as any })}
            title="x264 preset"
          >
            <option value="ultrafast">ultrafast</option>
            <option value="superfast">superfast</option>
            <option value="veryfast">veryfast</option>
            <option value="faster">faster</option>
            <option value="fast">fast</option>
            <option value="medium">medium</option>
            <option value="slow">slow</option>
          </select>
          <input
            type="number"
            value={exportSettings.crf ?? 23}
            onChange={(e) => setExportSettings({ crf: Number(e.target.value) })}
            className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs w-20"
            title="CRF (quality, lower is higher quality)"
          />
          <input
            type="number"
            value={exportSettings.audioBitrateKbps ?? 192}
            onChange={(e) => setExportSettings({ audioBitrateKbps: Number(e.target.value) })}
            className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs w-24"
            title="Audio kbps"
          />
          <select
            className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
            value={exportSettings.pixelFormat ?? "yuv420p"}
            onChange={(e) => setExportSettings({ pixelFormat: e.target.value as any })}
            title="Pixel format"
          >
            <option value="yuv420p">yuv420p</option>
            <option value="yuv444p">yuv444p</option>
          </select>
          <input
            type="number"
            value={exportSettings.parallelWorkers ?? 2}
            onChange={(e) => setExportSettings({ parallelWorkers: Math.max(1, Math.min(4, Number(e.target.value))) })}
            className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs w-24"
            title="Parallel workers (1-4)"
          />
        </>
      )}

      {exportActive && exportSettings.engine === "offline" && (
        <div className="text-xs text-gray-300 ml-2">
          {offlineProgress.phase === "capture" && `Capturing frames: ${Math.round(offlineProgress.p * 100)}%`}
          {offlineProgress.phase === "encode" && `Encoding...`}
        </div>
      )}
    </div>
  );
};

export default Exporter;