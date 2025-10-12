import React, { useEffect, useRef, useState } from "react";
import { audioEngine } from "../lib/audio";
import { usePlayerStore } from "../state/store";
import { exportOfflineMP4 } from "../lib/offlineExport";
import ExportPresetsEditor from "./ExportPresetsEditor";

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
  const [showPresets, setShowPresets] = useState(false);
  const [showExpert, setShowExpert] = useState(false);
  const [showPlatformTips, setShowPlatformTips] = useState(false);
  const [engineHint, setEngineHint] = useState<string>("");

  const addPreset = usePlayerStore((s) => s.addExportPreset);
  const exportPresetsList = usePlayerStore((s) => s.exportPresets);
  const applyExportPresetById = usePlayerStore((s) => s.applyExportPreset);
  const removeExportPresetById = usePlayerStore((s) => s.removeExportPreset);
  const [selectedPresetId, setSelectedPresetId] = useState<string>("");
  const [importingJSON, setImportingJSON] = useState(false);

  const quickSavePreset = () => {
    const name = `Preset ${exportPresetsList.length + 1}`;
    const s = exportSettings;
    addPreset(name, {
      engine: s.engine,
      mode: s.mode,
      width: s.width,
      height: s.height,
      fps: s.fps,
      bitrate: s.bitrate,
      forceCrf: s.forceCrf,
      crf: s.crf,
      preset: s.preset,
      audioBitrateKbps: s.audioBitrateKbps,
      pixelFormat: s.pixelFormat,
      parallelWorkers: s.parallelWorkers,
      tune: s.tune,
      profile: s.profile,
      level: s.level
    }, undefined, "Custom");
  };

  const exportPresetsJSON = () => {
    const json = JSON.stringify(
      { version: 1, presets: exportPresetsList.map((p) => ({ name: p.name, settings: p.settings, notes: p.notes, category: p.category })) },
      null,
      2
    );
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `export-presets-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const importPresetsJSON = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const list: Array<{ name: string; settings: any, notes?: string, category?: string }> =
        Array.isArray(data) ? data :
        Array.isArray(data?.presets) ? data.presets :
        [];
      if (!Array.isArray(list) || list.length === 0) {
        alert("No presets found in JSON.");
        return;
      }
      for (const item of list) {
        if (!item || typeof item !== "object") continue;
        const name = typeof item.name === "string" && item.name.trim().length ? item.name : `Imported ${Date.now()}`;
        const settings = (item.settings && typeof item.settings === "object") ? item.settings : {};
        const notes = typeof item.notes === "string" ? item.notes : undefined;
        const category = typeof item.category === "string" ? item.category : undefined;
        addPreset(name, settings, notes, category);
      }
    } catch {
      alert("Failed to import presets JSON.");
    } finally {
      setImportingJSON(false);
    }
  };

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
        profile: "high444p",
        parallelWorkers: 1
      });
    }
  };

  const computeWarnings = (): string[] => {
    const out: string[] = [];
    const mode = exportSettings.mode;
    const fps = exportSettings.fps || 30;
    const dims = (() => {
      if (mode === "1080p") return { width: 1920, height: 1080 };
      if (mode === "720p") return { width: 1280, height: 720 };
      if (mode === "custom") return { width: exportSettings.width ?? (canvasEl?.width || 1920), height: exportSettings.height ?? (canvasEl?.height || 1080) };
      return { width: canvasEl?.width || 1920, height: canvasEl?.height || 1080 };
    })();
    const levelNum = exportSettings.level ? parseFloat(exportSettings.level) : NaN;

    if (exportSettings.outputType === "audio" && exportSettings.engine === "realtime") {
      out.push("Audio-only export is only available in Offline (MP4/M4A). Switch engine to Offline.");
    }

    if (exportSettings.pixelFormat === "yuv444p") {
      out.push("yuv444p has limited hardware decoder support. Use yuv420p for widest compatibility.");
      if (exportSettings.profile && exportSettings.profile !== "high444p") {
        out.push("yuv444p typically requires the High 4:4:4 Predictive profile (high444p).");
      }
    }

    if (dims.height >= 1080 && fps >= 60 && (!exportSettings.level || (isFinite(levelNum) && levelNum < 4.1))) {
      out.push("1080p60 H.264 commonly requires Level 4.1 or higher.");
    } else if (dims.height >= 1080 && fps >= 30 && (!exportSettings.level || (isFinite(levelNum) && levelNum < 4.0))) {
      out.push("1080p30 H.264 commonly requires Level 4.0 or higher.");
    }

    if (exportSettings.profile === "baseline") {
      out.push("Baseline profile reduces compression efficiency; consider 'high' for better quality at the same bitrate.");
    }

    if (!exportSettings.forceCrf && (exportSettings.preset === "ultrafast" || exportSettings.preset === "superfast")) {
      out.push("Bitrate with ultrafast/superfast preset may produce lower visual quality. Consider CRF or a slower preset.");
    }

    if (exportSettings.videoCodec && exportSettings.videoCodec !== "libx264") {
      out.push("Selected codec may not be available in the current ffmpeg.wasm build. If export fails, switch to H.264 (libx264).");
    }

    return out;
  };

  useEffect(() => {
    // Auto-fallback for Safari/iOS: use offline export for best compatibility
    const ua = navigator.userAgent || "";
    const isIOS = /iPad|iPhone|iPod/.test(ua);
    const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
    if ((isIOS || isSafari) && exportSettings.engine === "realtime" && (exportSettings.outputType ?? "video") === "video") {
      setExportSettings({ engine: "offline" });
      setEngineHint("Safari/iOS detected: switched export engine to Offline (MP4) for compatibility.");
    } else {
      setEngineHint("");
    }

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
            outputType: exportSettings.outputType,
            pitchSemitones: exportSettings.pitchSemitones,
            onProgress: (p, phase) => setOfflineProgress({ p, phase }),
            signal: abortCtrlRef.current.signal,
            normalizeAudio: exportSettings.normalizeAudio,
            encode: {
              crf: exportSettings.forceCrf ? exportSettings.crf : undefined,
              preset: exportSettings.preset,
              audioBitrateKbps: exportSettings.audioBitrateKbps,
              pixelFormat: exportSettings.pixelFormat,
              videoCodec: exportSettings.videoCodec,
              profile: exportSettings.profile,
              level: exportSettings.level,
              tune: exportSettings.tune
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
    <>
    <div className="flex items-center gap-2">
      <button
        className={`px-3 py-1 rounded ${exportActive ? "bg-red-600 hover:bg-red-500" : "bg-gray-800 hover:bg-gray-700"}`}
        onClick={toggleExport}
        title={!playing ? "Start playback to enable export" : ""}
      >
        {exportActive ? "Stop Export" : (exportSettings.outputType === "audio" ? "Export Audio" : "Export Video")}
      </button>
      {engineHint && (
        <span className="px-2 py-1 rounded bg-blue-800 text-blue-100 text-xs" title={engineHint}>
          {engineHint}
        </span>
      )}
      {(() => {
        const warnings = computeWarnings();
        return warnings.length > 0 ? (
          <span
            className="px-2 py-1 rounded bg-yellow-700 text-yellow-100 text-xs"
            title={warnings.join("\n")}
          >
            ⚠ {warnings.length}
          </span>
        ) : null;
      })()}

      <select
        className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
        value={exportSettings.engine ?? "realtime"}
        onChange={(e) => setExportSettings({ engine: e.target.value as any })}
        title="Choose export engine"
      >
        <option value="realtime">Realtime (WebM)</option>
        <option value="offline">Offline (MP4)</option>
      </select>
      <select
        className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
        value={exportSettings.outputType ?? "video"}
        onChange={(e) => setExportSettings({ outputType: e.target.value as any })}
        title="Output type"
      >
        <option value="video">Video + Audio</option>
        <option value="audio">Audio Only (Offline)</option>
      </select>
      <button
        className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs"
        onClick={() => setShowPlatformTips((v) => !v)}
        title="Show platform-specific export tips"
      >
        {showPlatformTips ? "Hide Tips" : "Platform Tips"}
      </button>

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

      {exportSettings.engine === "offline" && (
        <>
          <button
            className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs"
            onClick={() => setShowPresets((v) => !v)}
            title="Manage custom encoding presets"
          >
            {showPresets ? "Hide Presets" : "Manage Presets"}
          </button>
          <button
            className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-xs"
            onClick={quickSavePreset}
            title="Quick save current settings as a preset"
          >
            Save Preset
          </button>
          <button
            className="px-2 py-1 rounded bg-indigo-700 hover:bg-indigo-600 text-xs"
            onClick={() => {
              const name = window.prompt("Preset name", `Preset ${exportPresetsList.length + 1}`)?.trim();
              if (!name) return;
              const s = exportSettings;
              addPreset(name, {
                engine: s.engine,
                mode: s.mode,
                width: s.width,
                height: s.height,
                fps: s.fps,
                bitrate: s.bitrate,
                forceCrf: s.forceCrf,
                crf: s.crf,
                preset: s.preset,
                audioBitrateKbps: s.audioBitrateKbps,
                pixelFormat: s.pixelFormat,
                parallelWorkers: s.parallelWorkers,
                tune: s.tune,
                profile: s.profile,
                level: s.level
              }, undefined, "Custom");
            }}
            title="Save current settings with a custom name"
          >
            Save As…
          </button>
          <button
            className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs"
            onClick={exportPresetsJSON}
            title="Export custom presets to JSON"
          >
            Export JSON
          </button>
          <label className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs cursor-pointer" title="Import presets from JSON">
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setImportingJSON(true);
                  importPresetsJSON(f);
                  e.currentTarget.value = "";
                }
              }}
            />
            Import JSON
          </label>
          {importingJSON && <span className="text-xs text-gray-400">Importing…</span>}

          {/* Custom presets quick apply/duplicate */}
          {exportPresetsList.length > 0 && (
            <>
              <select
                className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                value={selectedPresetId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedPresetId(id);
                  if (id) applyExportPresetById(id);
                }}
                title="Custom presets"
              >
                <option value="">(select preset)</option>
                {exportPresetsList.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <button
                className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs"
                disabled={!selectedPresetId}
                onClick={() => {
                  const p = exportPresetsList.find((pp) => pp.id === selectedPresetId);
                  if (p) addPreset(`Copy of ${p.name}`, p.settings, p.notes, p.category);
                }}
                title="Duplicate selected preset"
              >
                Duplicate Selected
              </button>
              <button
                className="px-2 py-1 rounded bg-red-700 hover:bg-red-600 text-xs"
                disabled={!selectedPresetId}
                onClick={() => {
                  if (selectedPresetId) {
                    const p = exportPresetsList.find((pp) => pp.id === selectedPresetId);
                    const name = p?.name ?? "selected preset";
                    const ok = window.confirm(`Delete "${name}"? This cannot be undone.`);
                    if (!ok) return;
                    removeExportPresetById(selectedPresetId);
                    setSelectedPresetId("");
                  }
                }}
                title="Remove selected preset"
              >
                Remove Selected
              </button>
            </>
          )}
        </>
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
            <span
              className="ml-1 px-1 rounded bg-gray-800 text-gray-300"
              title="CRF vs Bitrate: CRF targets quality (lower=better, typical 18–24). Bitrate targets a fixed video data rate. Use CRF for quality-focused exports; use bitrate to control file size or streaming constraints."
            >
              ?
            </span>
          </label>
          <label className="flex items-center gap-1 text-xs text-gray-300 ml-3">
            <input
              type="checkbox"
              checked={!!exportSettings.normalizeAudio}
              onChange={(e) => setExportSettings({ normalizeAudio: e.target.checked })}
            />
            Normalize audio
            <span
              className="ml-1 px-1 rounded bg-gray-800 text-gray-300"
              title="RMS-based loudness normalization with peak limiting (offline only)."
            >
              ?
            </span>
          </label>
          <select
            className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
            value={exportSettings.preset ?? "veryfast"}
            onChange={(e) => setExportSettings({ preset: e.target.value as any })}
            title="Encoder preset"
          >
            <option value="ultrafast">ultrafast</option>
            <option value="superfast">superfast</option>
            <option value="veryfast">veryfast</option>
            <option value="faster">faster</option>
            <option value="fast">fast</option>
            <option value="medium">medium</option>
            <option value="slow">slow</option>
          </select>
          <select
            className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
            value={exportSettings.videoCodec ?? "libx264"}
            onChange={(e) => setExportSettings({ videoCodec: e.target.value as any })}
            title="Video codec"
          >
            <option value="libx264">H.264 (libx264)</option>
            <option value="libvpx-vp9">VP9 (libvpx-vp9)</option>
            <option value="libx265">HEVC (libx265)</option>
          </select>
          <input
            type="number"
            value={exportSettings.crf ?? 23}
            onChange={(e) => setExportSettings({ crf: Number(e.target.value) })}
            className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs w-20"
            title="CRF (quality, lower is higher quality). Recommended: 18–24 for x264."
          />
          <input
            type="number"
            value={exportSettings.audioBitrateKbps ?? 192}
            onChange={(e) => setExportSettings({ audioBitrateKbps: Number(e.target.value) })}
            className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs w-24"
            title="Audio kbps (192–320 recommended for music)"
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
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-300">Pitch</span>
            <input
              type="range"
              min={-12}
              max={12}
              step={1}
              value={exportSettings.pitchSemitones ?? 0}
              onChange={(e) => setExportSettings({ pitchSemitones: Number(e.target.value) })}
              className="accent-brand-500"
              title="Pitch shift in semitones (offline export only)"
            />
          </div>
          <button
            className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs"
            onClick={() => setShowExpert((v) => !v)}
            title="Show expert codec options"
          >
            {showExpert ? "Hide Expert" : "Expert"}
          </button>
        </>
      )}

      {exportActive && exportSettings.engine === "offline" && (
        <div className="text-xs text-gray-300 ml-2">
          {offlineProgress.phase === "capture" && `Capturing frames: ${Math.round(offlineProgress.p * 100)}%`}
          {offlineProgress.phase === "encode" && `Encoding...`}
        </div>
      )}
    </div>

    {showPresets && exportSettings.engine === "offline" && (
      <div className="mt-2">
        <ExportPresetsEditor />
      </div>
    )}

    {showExpert && exportSettings.engine === "offline" && (
      <div className="mt-2 bg-gray-900 border border-gray-800 rounded p-3 text-xs text-gray-300">
        <div className="flex items-center gap-2">
          <select
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1"
            value={exportSettings.tune ?? ""}
            onChange={(e) => setExportSettings({ tune: (e.target.value || undefined) as any })}
            title="x264 tune"
          >
            <option value="">(none)</option>
            <option value="film">film</option>
            <option value="animation">animation</option>
            <option value="grain">grain</option>
            <option value="stillimage">stillimage</option>
            <option value="psnr">psnr</option>
            <option value="ssim">ssim</option>
            <option value="fastdecode">fastdecode</option>
            <option value="zerolatency">zerolatency</option>
          </select>
          <select
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1"
            value={exportSettings.profile ?? ""}
            onChange={(e) => setExportSettings({ profile: (e.target.value || undefined) as any })}
            title="H.264 profile"
          >
            <option value="">(auto)</option>
            <option value="baseline">baseline</option>
            <option value="main">main</option>
            <option value="high">high</option>
            <option value="high444p">high444p</option>
          </select>
          <select
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1"
            value={exportSettings.level ?? ""}
            onChange={(e) => setExportSettings({ level: (e.target.value || undefined) as any })}
            title="H.264 level"
          >
            <option value="">(auto)</option>
            <option value="3.0">3.0</option>
            <option value="3.1">3.1</option>
            <option value="4.0">4.0</option>
            <option value="4.1">4.1</option>
            <option value="5.0">5.0</option>
            <option value="5.1">5.1</option>
            <option value="5.2">5.2</option>
          </select>
          <span
            className="ml-1 px-1 rounded bg-gray-800 text-gray-300"
            title="Expert: profile/level are constraints for decoder compatibility. Tune tweaks encoder for specific content. Leave as auto unless you have a target device."
          >
            ?
          </span>
        </div>

        {(() => {
          const warnings = computeWarnings();
          return warnings.length > 0 ? (
            <div className="mt-2 text-yellow-300">
              <div className="mb-1">Compatibility/quality warnings:</div>
              <ul className="list-disc ml-4">
                {warnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </div>
          ) : null;
        })()}
      </div>
    )
    }

    {showPlatformTips && (
      <div className="mt-2 bg-gray-900 border border-gray-800 rounded p-3 text-xs text-gray-300">
        <div className="font-semibold mb-1">Platform export tips</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <div className="text-gray-200 mb-1">YouTube</div>
            <ul className="list-disc ml-4">
              <li>Resolution: 1080p (1920×1080), 1440p (2560×1440), or 4K (3840×2160)</li>
              <li>FPS: 30 or 60</li>
              <li>Encoding: CRF 18–22, preset medium/fast, pixelFormat yuv420p</li>
              <li>Profile/Level: high, 4.0 (1080p30) or 4.1 (1080p60)</li>
              <li>Tune: film or ssim for visuals</li>
              <li>Audio: 192–320 kbps AAC</li>
            </ul>
          </div>
          <div>
            <div className="text-gray-200 mb-1">TikTok</div>
            <ul className="list-disc ml-4">
              <li>Resolution: 1080×1920 (vertical), or 1440×2560 for higher quality</li>
              <li>FPS: 30 or 60</li>
              <li>Encoding: CRF 20–24, preset fast/medium, yuv420p</li>
              <li>Profile/Level: high, 4.1 recommended</li>
              <li>Audio: 192 kbps AAC</li>
            </ul>
          </div>
          <div>
            <div className="text-gray-200 mb-1">Instagram</div>
            <ul className="list-disc ml-4">
              <li>Square: 1080×1080 (30/60 fps)</li>
              <li>Reels (vertical): 720×1280, 1080×1920, or 1440×2560</li>
              <li>Encoding: CRF 20–24, preset fast/medium, yuv420p</li>
              <li>Profile/Level: high, 3.1 (720p) or 4.1 (1080p)</li>
              <li>Audio: 160–192 kbps AAC</li>
            </ul>
          </div>
          <div>
            <div className="text-gray-200 mb-1">Twitter/X</div>
            <ul className="list-disc ml-4">
              <li>Resolution: 720p or 1080p (square 720×720 supported)</li>
              <li>FPS: 30 recommended</li>
              <li>Encoding: Bitrate 4–8 Mbps or CRF ~22, preset faster/fast</li>
              <li>Pixel format: yuv420p, profile high, level 3.1 (720p) or 4.0 (1080p)</li>
              <li>Audio: 128–192 kbps AAC</li>
            </ul>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

export default Exporter;