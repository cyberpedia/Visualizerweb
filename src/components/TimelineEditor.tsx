import React, { useMemo, useState } from "react";
import { usePlayerStore, Layer } from "../state/store";
import { audioEngine } from "../lib/audio";

type PropKey = "x" | "y" | "opacity" | "size" | "rotation";

const props: PropKey[] = ["x", "y", "opacity", "size", "rotation"];

const TimelineEditor: React.FC = () => {
  const template = usePlayerStore((s) => s.visualizerTemplate);
  const updateLayer = usePlayerStore((s) => s.updateLayer);
  const [layerId, setLayerId] = useState<string>("");
  const [prop, setProp] = useState<PropKey>("x");

  const layers = useMemo(() => (template.layers ?? []).slice().sort((a, b) => a.zIndex - b.zIndex), [template.layers]);
  const selected = layers.find((l) => l.id === layerId) as any;

  const currentTime = audioEngine.getCurrentTime();
  const duration = audioEngine.getDuration();

  const addKeyframe = () => {
    if (!selected) return;
    const curVal = (selected as any)[prop] ?? 0;
    const kf = { time: currentTime, value: curVal, easing: "linear" as const };
    const nextKf = { ...(selected.kf || {}) };
    const list = Array.isArray(nextKf[prop]) ? nextKf[prop].slice() : [];
    list.push(kf);
    nextKf[prop] = list;
    updateLayer(selected.id, { kf: nextKf });
  };

  const removeKeyframe = (idx: number) => {
    if (!selected) return;
    const nextKf = { ...(selected.kf || {}) };
    const list = Array.isArray(nextKf[prop]) ? nextKf[prop].slice() : [];
    list.splice(idx, 1);
    nextKf[prop] = list;
    updateLayer(selected.id, { kf: nextKf });
  };

  return (
    <div className="p-3 border-t border-gray-800">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">Timeline / Keyframes</h3>
        <div className="text-xs text-gray-400">
          {isFinite(duration) && duration > 0 ? `Dur: ${Math.round(duration)}s` : ""}
        </div>
      </div>
      <div className="flex items-center gap-2 mb-2">
        <select
          className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
          value={layerId}
          onChange={(e) => setLayerId(e.target.value)}
        >
          <option value="">(select layer)</option>
          {layers.map((l) => (
            <option key={l.id} value={l.id}>{`${l.type} (${l.id.slice(0, 6)})`}</option>
          ))}
        </select>
        <select
          className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
          value={prop}
          onChange={(e) => setProp(e.target.value as PropKey)}
        >
          {props.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <button
          className="px-2 py-1 rounded bg-brand-600 hover:bg-brand-500 text-xs"
          onClick={addKeyframe}
          disabled={!selected}
          title="Add keyframe at current playback time"
        >
          Add Keyframe
        </button>
      </div>

      {selected && (
        <div className="text-xs">
          <div className="text-gray-300 mb-1">
            Keyframes for {prop} on layer {selected.id.slice(0, 6)}
          </div>
          <ul className="space-y-1">
            {Array.isArray(selected.kf?.[prop]) && (selected.kf![prop] as any[])
              .slice()
              .sort((a: any, b: any) => a.time - b.time)
              .map((k: any, i: number) => (
                <li key={i} className="flex items-center justify-between bg-gray-900/40 px-2 py-1 rounded">
                  <span>
                    t={k.time.toFixed(2)}s, v={k.value}
                    {k.easing ? `, ${k.easing}` : ""}
                  </span>
                  <button
                    className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700"
                    onClick={() => removeKeyframe(i)}
                    title="Remove keyframe"
                  >
                    Remove
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default TimelineEditor;