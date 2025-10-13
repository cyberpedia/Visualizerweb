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

      <div className="mb-3 grid grid-cols-2 gap-3">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={template.showInfo ?? true}
            onChange={(e) => set({ showInfo: e.target.checked })}
          />
          <span className="text-xs text-gray-300">Show overlay info</span>
        </label>
        <div>
          <div className="text-xs text-gray-300 mb-1">Glow</div>
          <input
            type="range"
            min={0}
            max={30}
            step={1}
            value={template.glowStrength ?? 0}
            onChange={(e) => set({ glowStrength: Number(e.target.value) })}
            className="w-full accent-brand-500"
          />
        </div>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-3">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={template.showAlbumArt ?? false}
            onChange={(e) => set({ showAlbumArt: e.target.checked })}
          />
          <span className="text-xs text-gray-300">Show album art</span>
        </label>
        <div>
          <div className="text-xs text-gray-300 mb-1">Album art size</div>
          <input
            type="range"
            min={48}
            max={256}
            step={4}
            value={template.albumArtSize ?? 96}
            onChange={(e) => set({ albumArtSize: Number(e.target.value) })}
            className="w-full accent-brand-500"
          />
        </div>
        <label className="text-xs">
          Blend
          <select
            value={template.albumArtBlendMode ?? "source-over"}
            onChange={(e) => set({ albumArtBlendMode: e.target.value })}
            className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-sm w-full"
            title="Album art blend mode"
          >
            <option value="source-over">source-over</option>
            <option value="lighter">lighter (add)</option>
            <option value="multiply">multiply</option>
            <option value="screen">screen</option>
          </select>
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

      <div className="mb-3 grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs text-gray-300 mb-1">Renderer</div>
          <select
            className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-sm w-full"
            value={template.renderer ?? "canvas2d"}
            onChange={(e) => set({ renderer: e.target.value })}
            title="Rendering engine"
          >
            <option value="canvas2d">Canvas 2D</option>
            <option value="webgl">WebGL</option>
          </select>
        </div>
        <div>
          <div className="text-xs text-gray-300 mb-1">Background image URL</div>
          <input
            type="text"
            placeholder="https://example.com/image.jpg"
            value={template.backgroundImageUrl ?? ""}
            onChange={(e) => set({ backgroundImageUrl: e.target.value || null })}
            className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-sm"
          />
        </div>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-3">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={template.showGrid ?? false}
            onChange={(e) => set({ showGrid: e.target.checked })}
          />
          <span className="text-xs text-gray-300">Show editor grid</span>
        </label>
        <div>
          <div className="text-xs text-gray-300 mb-1">Grid size</div>
          <input
            type="range"
            min={8}
            max={128}
            step={4}
            value={template.gridSize ?? 32}
            onChange={(e) => set({ gridSize: Number(e.target.value) })}
            className="w-full accent-brand-500"
          />
        </div>
      </div>

      <div className="mb-3">
        <div className="text-xs text-gray-300 mb-1">Background video</div>
        <div className="grid grid-cols-3 gap-2">
          <input
            type="text"
            placeholder="https://example.com/video.mp4"
            value={template.backgroundVideoUrl ?? ""}
            onChange={(e) => set({ backgroundVideoUrl: e.target.value || null })}
            className="col-span-2 bg-gray-900 border border-gray-800 rounded px-2 py-1 text-sm"
          />
          <label className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 cursor-pointer text-center">
            Pick file
            <input
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const url = URL.createObjectURL(f);
                set({ backgroundVideoUrl: url });
              }}
            />
          </label>
          <button
            className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700"
            onClick={() => set({ backgroundVideoUrl: null })}
          >
            Clear
          </button>
        </div>
        <div className="text-[11px] text-gray-400 mt-1">
          Note: local video URLs are temporary and won’t persist after reload.
        </div>
      </div>

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

      <div className="mb-3 grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs text-gray-300 mb-1">Title overlay</div>
          <label className="flex items-center gap-2 mb-2">
            <input
              type="checkbox"
              checked={template.titleOverlay?.show ?? true}
              onChange={(e) =>
                set({ titleOverlay: { ...template.titleOverlay, show: e.target.checked } })
              }
            />
            <span className="text-xs text-gray-300">Show title</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="color"
              value={template.titleOverlay?.color ?? "#ffffff"}
              onChange={(e) =>
                set({ titleOverlay: { ...template.titleOverlay, color: e.target.value } })
              }
            />
            <input
              type="number"
              min={10}
              max={48}
              value={template.titleOverlay?.size ?? 16}
              onChange={(e) =>
                set({ titleOverlay: { ...template.titleOverlay, size: Number(e.target.value) } })
              }
              className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-sm"
            />
            <input
              type="number"
              value={template.titleOverlay?.x ?? 20}
              onChange={(e) =>
                set({ titleOverlay: { ...template.titleOverlay, x: Number(e.target.value) } })
              }
              className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-sm"
            />
            <input
              type="number"
              value={template.titleOverlay?.y ?? 30}
              onChange={(e) =>
                set({ titleOverlay: { ...template.titleOverlay, y: Number(e.target.value) } })
              }
              className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-sm"
            />
            <select
              value={template.titleOverlay?.align ?? "left"}
              onChange={(e) =>
                set({ titleOverlay: { ...template.titleOverlay, align: e.target.value } })
              }
              className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-sm"
            >
              <option value="left">left</option>
              <option value="center">center</option>
              <option value="right">right</option>
            </select>
            <select
              value={template.titleOverlay?.blendMode ?? "source-over"}
              onChange={(e) =>
                set({ titleOverlay: { ...template.titleOverlay, blendMode: e.target.value as any } })
              }
              className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-sm"
              title="Blend mode"
            >
              <option value="source-over">source-over</option>
              <option value="lighter">lighter (add)</option>
              <option value="multiply">multiply</option>
              <option value="screen">screen</option>
            </select>
          </div>
        </div>

        <div>
          <div className="text-xs text-gray-300 mb-1">Artist overlay</div>
          <label className="flex items-center gap-2 mb-2">
            <input
              type="checkbox"
              checked={template.artistOverlay?.show ?? true}
              onChange={(e) =>
                set({ artistOverlay: { ...template.artistOverlay, show: e.target.checked } })
              }
            />
            <span className="text-xs text-gray-300">Show artist</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="color"
              value={template.artistOverlay?.color ?? "#cbd5e1"}
              onChange={(e) =>
                set({ artistOverlay: { ...template.artistOverlay, color: e.target.value } })
              }
            />
            <input
              type="number"
              min={10}
              max={48}
              value={template.artistOverlay?.size ?? 13}
              onChange={(e) =>
                set({ artistOverlay: { ...template.artistOverlay, size: Number(e.target.value) } })
              }
              className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-sm"
            />
            <input
              type="number"
              value={template.artistOverlay?.x ?? 20}
              onChange={(e) =>
                set({ artistOverlay: { ...template.artistOverlay, x: Number(e.target.value) } })
              }
              className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-sm"
            />
            <input
              type="number"
              value={template.artistOverlay?.y ?? 50}
              onChange={(e) =>
                set({ artistOverlay: { ...template.artistOverlay, y: Number(e.target.value) } })
              }
              className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-sm"
            />
            <select
              value={template.artistOverlay?.align ?? "left"}
              onChange={(e) =>
                set({ artistOverlay: { ...template.artistOverlay, align: e.target.value } })
              }
              className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-sm"
            >
              <option value="left">left</option>
              <option value="center">center</option>
              <option value="right">right</option>
            </select>
            <select
              value={template.artistOverlay?.blendMode ?? "source-over"}
              onChange={(e) =>
                set({ artistOverlay: { ...template.artistOverlay, blendMode: e.target.value as any } })
              }
              className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-sm"
              title="Blend mode"
            >
              <option value="source-over">source-over</option>
              <option value="lighter">lighter (add)</option>
              <option value="multiply">multiply</option>
              <option value="screen">screen</option>
            </select>
          </div>
        </div>
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