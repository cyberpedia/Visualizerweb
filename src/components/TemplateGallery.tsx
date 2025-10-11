import React, { useEffect, useState } from "react";
import { TemplateConfig, usePlayerStore } from "../state/store";

type SavedTemplate = {
  id: string;
  name: string;
  template: TemplateConfig;
};

const STORAGE_KEY = "avee-web-templates";

function loadTemplates(): SavedTemplate[] {
  try {
    const txt = localStorage.getItem(STORAGE_KEY);
    if (!txt) return [];
    return JSON.parse(txt);
  } catch {
    return [];
  }
}

function saveTemplates(list: SavedTemplate[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

const defaults: SavedTemplate[] = [
  {
    id: "bars-default",
    name: "Bars Default",
    template: {
      type: "bars",
      color1: "#6366f1",
      color2: "#22d3ee",
      background: "#0b1020",
      backgroundImageUrl: null,
      glowStrength: 0,
      showInfo: false,
      showAlbumArt: true,
      albumArtSize: 96,
      barCount: 64,
      circle: { radius: 160, thickness: 8, gap: 2 },
      waveform: { thickness: 2 },
      titleOverlay: { show: true, color: "#ffffff", size: 16, x: 20, y: 30, align: "left" },
      artistOverlay: { show: true, color: "#cbd5e1", size: 13, x: 20, y: 50, align: "left" }
    }
  },
  {
    id: "circle-neon",
    name: "Circle Neon",
    template: {
      type: "circle",
      color1: "#22d3ee",
      color2: "#ec4899",
      background: "#0b1020",
      backgroundImageUrl: null,
      glowStrength: 12,
      showInfo: false,
      showAlbumArt: true,
      albumArtSize: 96,
      barCount: 64,
      circle: { radius: 180, thickness: 6, gap: 2 },
      waveform: { thickness: 2 },
      titleOverlay: { show: true, color: "#ffffff", size: 16, x: 20, y: 30, align: "left" },
      artistOverlay: { show: true, color: "#cbd5e1", size: 13, x: 20, y: 50, align: "left" }
    }
  },
  {
    id: "wave-soft",
    name: "Wave Soft",
    template: {
      type: "waveform",
      color1: "#a5b4fc",
      color2: "#22d3ee",
      background: "#0b1020",
      backgroundImageUrl: null,
      glowStrength: 6,
      showInfo: false,
      showAlbumArt: false,
      albumArtSize: 96,
      barCount: 64,
      circle: { radius: 160, thickness: 8, gap: 2 },
      waveform: { thickness: 3 },
      titleOverlay: { show: true, color: "#ffffff", size: 16, x: 20, y: 30, align: "left" },
      artistOverlay: { show: true, color: "#cbd5e1", size: 13, x: 20, y: 50, align: "left" }
    }
  }
];

const TemplateGallery: React.FC = () => {
  const [custom, setCustom] = useState<SavedTemplate[]>([]);
  const setTemplate = usePlayerStore((s) => s.setTemplate);
  const currentTemplate = usePlayerStore((s) => s.visualizerTemplate);

  useEffect(() => {
    setCustom(loadTemplates());
  }, []);

  const apply = (tpl: TemplateConfig) => setTemplate({ ...tpl });

  const saveCurrent = () => {
    const name = prompt("Preset name?");
    if (!name) return;
    const entry: SavedTemplate = {
      id: crypto.randomUUID(),
      name,
      template: currentTemplate
    };
    const next = [...custom, entry];
    setCustom(next);
    saveTemplates(next);
  };

  const remove = (id: string) => {
    const next = custom.filter((t) => t.id !== id);
    setCustom(next);
    saveTemplates(next);
  };

  return (
    <div className="p-3 border-t border-gray-800">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold">Template Gallery</h2>
        <button
          className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700"
          onClick={saveCurrent}
        >
          Save Current
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {[...defaults, ...custom].map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between p-2 rounded bg-gray-900 hover:bg-gray-800"
          >
            <div className="text-sm">{item.name}</div>
            <div className="flex items-center gap-2">
              <button
                className="text-xs px-2 py-1 rounded bg-brand-600 hover:bg-brand-500"
                onClick={() => apply(item.template)}
              >
                Apply
              </button>
              {custom.some((c) => c.id === item.id) && (
                <button
                  className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700"
                  onClick={() => remove(item.id)}
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TemplateGallery;