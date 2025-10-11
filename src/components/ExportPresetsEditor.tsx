import React, { useState } from "react";
import { usePlayerStore, ExportPreset, ExportSettings } from "../state/store";

const ExportPresetsEditor: React.FC = () => {
  const presets = usePlayerStore((s) => s.exportPresets);
  const addPreset = usePlayerStore((s) => s.addExportPreset);
  const removePreset = usePlayerStore((s) => s.removeExportPreset);
  const renamePreset = usePlayerStore((s) => s.renameExportPreset);
  const applyPreset = usePlayerStore((s) => s.applyExportPreset);
  const current = usePlayerStore((s) => s.exportSettings);

  const [newName, setNewName] = useState("");

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

  return (
    <div className="bg-gray-900 border border-gray-800 rounded p-3 text-sm">
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

      {presets.length === 0 ? (
        <div className="text-gray-400 text-xs">No custom presets yet. Create one from current settings.</div>
      ) : (
        <ul className="space-y-2">
          {presets.map((p: ExportPreset) => (
            <li key={p.id} className="flex items-center gap-2">
              <input
                type="text"
                value={p.name}
                onChange={(e) => renamePreset(p.id, e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs flex-1"
              />
              <button
                className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs"
                onClick={() => applyPreset(p.id)}
                title="Apply preset"
              >
                Apply
              </button>
              <button
                className="px-2 py-1 rounded bg-red-700 hover:bg-red-600 text-xs"
                onClick={() => removePreset(p.id)}
                title="Delete preset"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ExportPresetsEditor;