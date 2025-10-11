import React, { useState } from "react";
import { usePlayerStore, ExportPreset, ExportSettings } from "../state/store";

type BuiltIn = { name: string; settings: Partial<ExportSettings>; category?: string };

const BUILT_IN_PRESETS: BuiltIn[] = [
  {
    name: "Fast",
    category: "General",
    settings: {
      encodeProfile: "fast",
      preset: "veryfast",
      forceCrf: false,
      crf: 24,
      bitrate: 6_000_000,
      audioBitrateKbps: 160,
      pixelFormat: "yuv420p",
      parallelWorkers: 3
    }
  },
  {
    name: "Balanced",
    category: "General",
    settings: {
      encodeProfile: "balanced",
      preset: "fast",
      forceCrf: true,
      crf: 22,
      audioBitrateKbps: 192,
      pixelFormat: "yuv420p",
      parallelWorkers: 2
    }
  },
  {
    name: "High Quality",
    category: "General",
    settings: {
      encodeProfile: "high",
      preset: "slow",
      forceCrf: true,
      crf: 18,
      audioBitrateKbps: 320,
      pixelFormat: "yuv444p",
      profile: "high444p",
      parallelWorkers: 1
    }
  },
  {
    name: "Mobile 720p",
    category: "Mobile",
    settings: {
      mode: "720p",
      preset: "fast",
      forceCrf: true,
      crf: 24,
      audioBitrateKbps: 128,
      pixelFormat: "yuv420p",
      parallelWorkers: 2
    }
  },
  {
    name: "Streaming 1080p CBR",
    category: "Streaming",
    settings: {
      mode: "1080p",
      preset: "faster",
      forceCrf: false,
      bitrate: 8_000_000,
      audioBitrateKbps: 192,
      pixelFormat: "yuv420p",
      profile: "high",
      level: "4.1",
      parallelWorkers: 2
    }
  },
  // Additional built-ins
  {
    name: "4K 2160p (60fps)",
    category: "YouTube",
    settings: {
      mode: "custom",
      width: 3840,
      height: 2160,
      fps: 60,
      preset: "slow",
      forceCrf: true,
      crf: 20,
      audioBitrateKbps: 320,
      pixelFormat: "yuv420p",
      profile: "high",
      level: "5.2",
      tune: "film",
      parallelWorkers: 2
    }
  },
  {
    name: "YouTube 1080p (Film)",
    category: "YouTube",
    settings: {
      mode: "1080p",
      fps: 30,
      preset: "medium",
      forceCrf: true,
      crf: 20,
      audioBitrateKbps: 192,
      pixelFormat: "yuv420p",
      profile: "high",
      level: "4.1",
      tune: "film",
      parallelWorkers: 2
    }
  },
  {
    name: "Instagram Square 1080×1080",
    category: "Instagram",
    settings: {
      mode: "custom",
      width: 1080,
      height: 1080,
      fps: 30,
      preset: "fast",
      forceCrf: true,
      crf: 22,
      audioBitrateKbps: 160,
      pixelFormat: "yuv420p",
      profile: "high",
      level: "4.1",
      parallelWorkers: 2
    }
  },
  {
    name: "Instagram Square 1080×1080 (60fps)",
    category: "Instagram",
    settings: {
      mode: "custom",
      width: 1080,
      height: 1080,
      fps: 60,
      preset: "fast",
      forceCrf: true,
      crf: 22,
      audioBitrateKbps: 192,
      pixelFormat: "yuv420p",
      profile: "high",
      level: "4.1",
      parallelWorkers: 2
    }
  },
  {
    name: "TikTok Vertical 1080×1920",
    category: "TikTok",
    settings: {
      mode: "custom",
      width: 1080,
      height: 1920,
      fps: 30,
      preset: "fast",
      forceCrf: true,
      crf: 22,
      audioBitrateKbps: 192,
      pixelFormat: "yuv420p",
      profile: "high",
      level: "4.1",
      parallelWorkers: 2
    }
  },
  {
    name: "TikTok Vertical 1080×1920 (60fps)",
    category: "TikTok",
    settings: {
      mode: "custom",
      width: 1080,
      height: 1920,
      fps: 60,
      preset: "fast",
      forceCrf: true,
      crf: 22,
      audioBitrateKbps: 192,
      pixelFormat: "yuv420p",
      profile: "high",
      level: "4.1",
      parallelWorkers: 2
    }
  },
  {
    name: "Instagram Reels 720×1280",
    category: "Instagram",
    settings: {
      mode: "custom",
      width: 720,
      height: 1280,
      fps: 30,
      preset: "fast",
      forceCrf: true,
      crf: 22,
      audioBitrateKbps: 160,
      pixelFormat: "yuv420p",
      profile: "high",
      level: "3.1",
      parallelWorkers: 2
    }
  },
  {
    name: "YouTube Shorts 1080×1920 (60fps)",
    category: "YouTube",
    settings: {
      mode: "custom",
      width: 1080,
      height: 1920,
      fps: 60,
      preset: "medium",
      forceCrf: true,
      crf: 20,
      audioBitrateKbps: 192,
      pixelFormat: "yuv420p",
      profile: "high",
      level: "4.1",
      tune: "film",
      parallelWorkers: 2
    }
  },
  {
    name: "Twitter Square 720×720 (CBR)",
    category: "Twitter",
    settings: {
      mode: "custom",
      width: 720,
      height: 720,
      fps: 30,
      preset: "faster",
      forceCrf: false,
      bitrate: 4_000_000,
      audioBitrateKbps: 128,
      pixelFormat: "yuv420p",
      profile: "high",
      level: "3.1",
      parallelWorkers: 2
    }
  },
  {
    name: "Twitter 720p CBR",
    category: "Twitter",
    settings: {
      mode: "720p",
      fps: 30,
      preset: "faster",
      forceCrf: false,
      bitrate: 5_000_000,
      audioBitrateKbps: 128,
      pixelFormat: "yuv420p",
      profile: "high",
      level: "3.1",
      parallelWorkers: 2
    }
  },
  {
    name: "Instagram Reels 4K 2160×3840 (vertical)",
    category: "Instagram",
    settings: {
      mode: "custom",
      width: 2160,
      height: 3840,
      fps: 30,
      preset: "medium",
      forceCrf: true,
      crf: 20,
      audioBitrateKbps: 192,
      pixelFormat: "yuv420p",
      profile: "high",
      level: "5.1",
      parallelWorkers: 2
    }
  },
  {
    name: "YouTube 4K 2160p (60fps)",
    category: "YouTube",
    settings: {
      mode: "custom",
      width: 3840,
      height: 2160,
      fps: 60,
      preset: "slow",
      forceCrf: true,
      crf: 20,
      audioBitrateKbps: 320,
      pixelFormat: "yuv420p",
      profile: "high",
      level: "5.1",
      tune: "film",
      parallelWorkers: 2
    }
  },
  {
    name: "YouTube HDR-like 1080p",
    category: "YouTube",
    settings: {
      mode: "1080p",
      fps: 30,
      preset: "slow",
      forceCrf: true,
      crf: 18,
      audioBitrateKbps: 320,
      pixelFormat: "yuv444p",
      profile: "high444p",
      level: "4.1",
      tune: "film",
      parallelWorkers: 1
    }
  },
  {
    name: "Instagram HDR-like Vertical 1080×1920",
    category: "Instagram",
    settings: {
      mode: "custom",
      width: 1080,
      height: 1920,
      fps: 30,
      preset: "slow",
      forceCrf: true,
      crf: 18,
      audioBitrateKbps: 256,
      pixelFormat: "yuv444p",
      profile: "high444p",
      level: "4.1",
      parallelWorkers: 1
    }
  }
];

const ExportPresetsEditor: React.FC = () => {
  const presets = usePlayerStore((s) => s.exportPresets);
  const addPreset = usePlayerStore((s) => s.addExportPreset);
  const removePreset = usePlayerStore((s) => s.removeExportPreset);
  const renamePreset = usePlayerStore((s) => s.renameExportPreset);
  const updatePresetNotes = usePlayerStore((s) => s.updateExportPresetNotes);
  const applyPreset = usePlayerStore((s) => s.applyExportPreset);
  const setExportSettings = usePlayerStore((s) => s.setExportSettings);
  const current = usePlayerStore((s) => s.exportSettings);

  const [newName, setNewName] = useState("");
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");

  const categories = ["All", "General", "YouTube", "Instagram", "TikTok", "Twitter", "Streaming", "Mobile"];

  const filteredBuiltIns = BUILT_IN_PRESETS.filter((bp) => {
    const matchesSearch = bp.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = category === "All" || (bp.category ?? "General") === category;
    return matchesSearch && matchesCategory;
  });

  const filteredCustom = presets.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

  const isLimited = (s: Partial<ExportSettings>) =>
    s.pixelFormat === "yuv444p" || s.profile === "high444p";

  const saveCurrent = () => {
    const settings: Partial<ExportSettings> = {
      engine: current.engine,
      mode: current.mode,
      width: current.width,
      height: current.height,
      fps: current.fps,
      bitrate: current.bitrate,
      forceCrf: current.forceCrf,
      crf: current.crf,
      preset: current.preset,
      audioBitrateKbps: current.audioBitrateKbps,
      pixelFormat: current.pixelFormat,
      parallelWorkers: current.parallelWorkers,
      tune: current.tune,
      profile: current.profile,
      level: current.level
    };
    const name = newName.trim() || `Preset ${presets.length + 1}`;
    addPreset(name, settings);
    setNewName("");
  };

  const applyBuiltIn = (bp: BuiltIn) => {
    setExportSettings(bp.settings);
  };

  const cloneBuiltIn = (bp: BuiltIn) => {
    addPreset(`Copy of ${bp.name}`, bp.settings);
  };

  const exportJSON = () => {
    const json = JSON.stringify(
      { version: 1, presets: presets.map((p) => ({ name: p.name, settings: p.settings, notes: p.notes })) },
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

  const importJSON = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const list: Array<{ name: string; settings: Partial<ExportSettings>, notes?: string }> =
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
        addPreset(name, settings, notes);
      }
      setImporting(false);
    } catch {
      alert("Failed to import presets JSON.");
      setImporting(false);
    }
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded p-3 text-sm">
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="text-xs text-gray-300">Built-in presets (read-only)</div>
          <input
            type="text"
            placeholder="Search presets"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs flex-1"
          />
          <select
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            title="Filter by category"
          >
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <ul className="space-y-2">
          {filteredBuiltIns.map((bp) => (
            <li key={bp.name} className="flex items-center gap-2">
              <div className="flex-1 text-xs text-gray-200">{bp.name}</div>
              <span className="text-[10px] text-gray-500 px-2 py-0.5 border border-gray-700 rounded">{bp.category ?? "General"}</span>
              {isLimited(bp.settings) && (
                <span
                  className="text-[10px] text-red-300 px-2 py-0.5 border border-red-700 rounded"
                  title="Limited hardware decoder support; use yuv420p for widest compatibility."
                >
                  Limited
                </span>
              )}
              <button
                className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs"
                onClick={() => applyBuiltIn(bp)}
                title="Apply built-in preset"
              >
                Apply
              </button>
              <button
                className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-xs"
                onClick={() => cloneBuiltIn(bp)}
                title="Clone to custom presets"
              >
                Clone
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <input
          type="text"
          placeholder="Preset name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs flex-1"
        />
        <button
          className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-xs"
          onClick={saveCurrent}
          title="Save current export settings as a preset"
        >
          Save Current
        </button>
      </div>

      {filteredCustom.length === 0 ? (
        <div className="text-gray-400 text-xs">No custom presets yet. Create one from current settings or clone a built-in.</div>
      ) : (
        <ul className="space-y-2">
          {filteredCustom.map((p: ExportPreset) => (
            <li key={p.id} className="space-y-1">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={p.name}
                  onChange={(e) => renamePreset(p.id, e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs flex-1"
                />
                {isLimited(p.settings) && (
                  <span
                    className="text-[10px] text-red-300 px-2 py-0.5 border border-red-700 rounded"
                    title="Limited hardware decoder support; use yuv420p for widest compatibility."
                  >
                    Limited
                  </span>
                )}
                <button
                  className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs"
                  onClick={() => applyPreset(p.id)}
                  title="Apply preset"
                >
                  Apply
                </button>
                <button
                  className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs"
                  onClick={() => addPreset(`Copy of ${p.name}`, p.settings)}
                  title="Duplicate preset"
                >
                  Duplicate
                </button>
                <button
                  className="px-2 py-1 rounded bg-red-700 hover:bg-red-600 text-xs"
                  onClick={() => removePreset(p.id)}
                  title="Delete preset"
                >
                  Delete
                </button>
              </div>
              <div>
                <input
                  type="text"
                  placeholder="Notes"
                  value={p.notes ?? ""}
                  onChange={(e) => updatePresetNotes(p.id, e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] w-full"
                  title="Optional notes for this preset"
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          className="px-3 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs"
          onClick={exportJSON}
          title="Export custom presets to JSON"
        >
          Export JSON
        </button>
        <label className="px-3 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs cursor-pointer">
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setImporting(true);
                importJSON(f);
                e.currentTarget.value = "";
              }
            }}
          />
          Import JSON
        </label>
        {importing && <span className="text-xs text-gray-400">Importing…</span>}
      </div>
    </div>
  );
};

export default ExportPresetsEditor;