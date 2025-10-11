import React from "react";
import { usePlayerStore, VisualizerType } from "../state/store";

const TemplateEditor: React.FC = () => {
  const template = usePlayerStore((s) => s.visualizerTemplate);
  const setTemplate = usePlayerStore((s) => s.setTemplate);

  const set = (patch: any) => setTemplate(patch);

  const setType = (t: VisualizerType) => set({ type: t });

  return (
    <div className="p-3">
      <h2 className="text-sm font-semibold mb-2">Visualizer Template</h2>

      <div className="mb-3">
        <div className="text-xs text-gray-300 mb-1">Type</div>
        <div className="flex items-center gap-2">
          {(["bars", "circle", "waveform"] as VisualizerType[]).map((t) => (
            <button
              key={t}
              className={`px-2 py-1 rounded text-xs ${
                template.type === t ? "bg-brand-700/50" : "bg-gray-800 hover:bg-gray-700"
              }`}
              onClick={() => setType(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs text-gray-300 mb-1">Primary Color</div>
          <input
            type="color"
            value={template.color1}
            onChange={(e) => set({ color1: e.target.value })}
          />
        </div>
        <div>
          <div className="text-xs text-gray-300 mb-1">Secondary Color</div>
          <input
            type="color"
            value={template.color2}
            onChange={(e) => set({ color2: e.target.value })}
          />
        </div>
      </div>

      <div className="mb-3">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={template.showInfo ?? true}
            onChange={(e) => set({ showInfo: e.target.checked })}
          />
          <span className="text-xs text-gray-300">Show overlay info</span>
        </label>
      </div>

      {template.type === "bars" && (
        <div className="mb-3">
          <div className="text-xs text-gray-300 mb-1">Bar Count</div>
          <input
            type="range"
            min={16}
            max={128}
            step={1}
            value={template.barCount ?? 64}
            onChange={(e) => set({ barCount: Number(e.target.value) })}
            className="w-full accent-brand-500"
          />
        </div>
      )}

      {template.type === "circle" && (
        <div className="mb-3 grid grid-cols-3 gap-3">
          <div>
            <div className="text-xs text-gray-300 mb-1">Radius</div>
            <input
              type="range"
              min={80}
              max={300}
              step={1}
              value={template.circle?.radius ?? 160}
              onChange={(e) =>
                set({ circle: { ...template.circle, radius: Number(e.target.value) } })
              }
              className="w-full accent-brand-500"
            />
          </div>
          <div>
            <div className="text-xs text-gray-300 mb-1">Thickness</div>
            <input
              type="range"
              min={1}
              max={16}
              step={1}
              value={template.circle?.thickness ?? 8}
              onChange={(e) =>
                set({ circle: { ...template.circle, thickness: Number(e.target.value) } })
              }
              className="w-full accent-brand-500"
            />
          </div>
          <div>
            <div className="text-xs text-gray-300 mb-1">Gap</div>
            <input
              type="range"
              min={0}
              max={10}
              step={1}
              value={template.circle?.gap ?? 2}
              onChange={(e) =>
                set({ circle: { ...template.circle, gap: Number(e.target.value) } })
              }
              className="w-full accent-brand-500"
            />
          </div>
        </div>
      )}

      {template.type === "waveform" && (
        <div className="mb-3">
          <div className="text-xs text-gray-300 mb-1">Thickness</div>
          <input
            type="range"
            min={1}
            max={8}
            step={1}
            value={template.waveform?.thickness ?? 2}
            onChange={(e) =>
              set({ waveform: { ...template.waveform, thickness: Number(e.target.value) } })
            }
            className="w-full accent-brand-500"
          />
        </div>
      )}

      <div className="mb-3">
        <div className="text-xs text-gray-300 mb-1">Background (hex)</div>
        <input
          type="text"
          placeholder="#0b1020"
          value={template.background ?? ""}
          onChange={(e) => set({ background: e.target.value || null })}
          className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-sm"
        />
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          className="px-3 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs"
          onClick={() => {
            const data = JSON.stringify(template, null, 2);
            const blob = new Blob([data], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `visualizer-template-${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
          }}
        >
          Export Template (JSON)
        </button>
        <label className="text-xs px-3 py-1 rounded bg-gray-800 hover:bg-gray-700 cursor-pointer">
          Import Template
          <input
            type="file"
            accept="application/json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const text = await f.text();
              try {
                const obj = JSON.parse(text);
                set(obj);
              } catch {
                alert("Invalid template JSON");
              }
            }}
          />
        </label>
      </div>
    </div>
  );
};

export default TemplateEditor;