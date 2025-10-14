import React, { useMemo, useState } from "react";
import { usePlayerStore, Layer } from "../state/store";
import { audioEngine } from "../lib/audio";

type PropKey = "x" | "y" | "opacity" | "size" | "rotation";

const props: PropKey[] = ["x", "y", "opacity", "size", "rotation"];

const TimelineEditor: React.FC = () => {
  const template = usePlayerStore((s) => s.visualizerTemplate);
  const updateLayer = usePlayerStore((s) => s.updateLayer);
  const addMarker = usePlayerStore((s) => s.addMarker);
  const removeMarker = usePlayerStore((s) => s.removeMarker);
  const clearMarkers = usePlayerStore((s) => s.clearMarkers);
  const snapEnabled = usePlayerStore((s) => s.timelineSnapEnabled);
  const snapStep = usePlayerStore((s) => s.timelineSnapStep);
  const setSnapEnabled = usePlayerStore((s) => s.setTimelineSnapEnabled);
  const setSnapStep = usePlayerStore((s) => s.setTimelineSnapStep);
  const markers = usePlayerStore((s) => s.timelineMarkers);

  const [layerId, setLayerId] = useState<string>("");
  const [prop, setProp] = useState<PropKey>("x");
  const [zoom, setZoom] = useState<number>(1);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

  const layers = useMemo(() => (template.layers ?? []).slice().sort((a, b) => a.zIndex - b.zIndex), [template.layers]);
  const selected = layers.find((l) => l.id === layerId) as any;

  const currentTime = audioEngine.getCurrentTime();
  const duration = audioEngine.getDuration();

  const snapTime = (t: number) => (snapEnabled ? Math.round(t / snapStep) * snapStep : t);

  const addKeyframe = () => {
    if (!selected) return;
    const curVal = (selected as any)[prop] ?? 0;
    const kf = { time: snapTime(currentTime), value: curVal, easing: "linear" as const };
    const nextKf = { ...(selected.kf || {}) };
    const list = Array.isArray(nextKf[prop]) ? nextKf[prop].slice() : [];
    list.push(kf);
    nextKf[prop] = list;
    updateLayer(selected.id, { kf: nextKf });
  };

  const updateKeyframe = (idx: number, patch: Partial<{ time: number; value: number; easing: string }>) => {
    if (!selected) return;
    const nextKf = { ...(selected.kf || {}) };
    const list = Array.isArray(nextKf[prop]) ? nextKf[prop].slice() : [];
    const cur = list[idx];
    if (!cur) return;
    const next = { ...cur, ...patch };
    list[idx] = next;
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

      <div className="mb-2 grid grid-cols-3 gap-2">
        <label className="text-xs flex items-center gap-2">
          <input
            type="checkbox"
            checked={snapEnabled}
            onChange={(e) => setSnapEnabled(e.target.checked)}
          />
          Snap
        </label>
        <label className="text-xs">
          Snap step (s)
          <input
            type="number"
            min={0.01}
            step={0.01}
            value={snapStep}
            onChange={(e) => setSnapStep(Number(e.target.value))}
            className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
          />
        </label>
        <div className="flex items-center gap-2">
          <button
            className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs"
            onClick={() => addMarker(snapTime(currentTime))}
            title="Add marker at current time"
          >
            + Marker
          </button>
          <button
            className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs"
            onClick={() => clearMarkers()}
            title="Clear markers"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="mb-2 text-[11px] text-gray-400">
        Markers: {markers.sort((a, b) => a - b).map((m, i) => (
          <span key={i} className="inline-flex items-center gap-1 mr-2">
            <span>{m.toFixed(2)}s</span>
            <button
              className="px-1 py-0.5 rounded bg-gray-800 hover:bg-gray-700"
              onClick={() => removeMarker(m)}
              title="Remove"
            >
              ×
            </button>
          </span>
        ))}
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
        <label className="text-xs ml-4">
          Zoom
          <input
            type="range"
            min={0.5}
            max={4}
            step={0.1}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="ml-2 align-middle"
          />
        </label>
      </div>

      {/* Timeline track */}
      {selected && (
        <div className="relative w-full h-16 bg-gray-900 border border-gray-800 rounded mb-3"
          onClick={(e) => {
            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            const x = e.clientX - rect.left;
            const w = rect.width;
            const dur = isFinite(duration) && duration > 0 ? duration : 60;
            const t = snapTime((x / w) * dur / zoom);
            const curVal = (selected as any)[prop] ?? 0;
            const kf = { time: t, value: curVal, easing: "linear" as const };
            const nextKf = { ...(selected.kf || {}) };
            const list = Array.isArray(nextKf[prop]) ? nextKf[prop].slice() : [];
            list.push(kf);
            nextKf[prop] = list;
            updateLayer(selected.id, { kf: nextKf });
          }}
          onMouseMove={(e) => {
            if (draggingIdx == null) return;
            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            const x = e.clientX - rect.left;
            const w = rect.width;
            const dur = isFinite(duration) && duration > 0 ? duration : 60;
            const t = snapTime(Math.max(0, Math.min(dur, (x / w) * dur / zoom)));
            updateKeyframe(draggingIdx, { time: t });
          }}
          onMouseUp={() => setDraggingIdx(null)}
          onMouseLeave={() => setDraggingIdx(null)}
          title="Click to add keyframe at position"
        >
          {/* grid lines */}
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i}
              className="absolute top-0 bottom-0 border-r border-gray-800"
              style={{ left: `${(i / 10) * 100}%` }}
            />
          ))}
          {/* markers */}
          {markers.map((m, i) => (
            <div key={i}
              className="absolute top-0 bottom-0 border-l border-gray-600"
              style={{
                left: `${(Math.min(1, m / (isFinite(duration) && duration > 0 ? duration : 60)) * 100) * (1 / zoom)}%`
              }}
              title={`${m.toFixed(2)}s`}
            />
          ))}
          {/* keyframes for selected prop */}
          {Array.isArray(selected.kf?.[prop]) && (selected.kf![prop] as any[])
            .slice()
            .sort((a: any, b: any) => a.time - b.time)
            .map((k: any, i: number) => (
              <div key={i}
                className="absolute -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-brand-500 rounded-full cursor-ew-resize"
                style={{
                  left: `${(Math.min(1, k.time / (isFinite(duration) && duration > 0 ? duration : 60)) * 100) * (1 / zoom)}%`,
                  top: "50%"
                }}
                title={`t=${k.time.toFixed(2)}s, v=${k.value}`}
                onMouseDown={() => setDraggingIdx(i)}
              />
            ))}
        </div>
      )}

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
                <li key={i} className="grid grid-cols-5 items-center bg-gray-900/40 px-2 py-1 rounded gap-2">
                  <label className="text-xs">
                    Time (s)
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={k.time}
                      onChange={(e) => updateKeyframe(i, { time: Number(e.target.value) })}
                      className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                    />
                  </label>
                  <label className="text-xs">
                    Value
                    <input
                      type="number"
                      step={prop === "opacity" ? 0.05 : 1}
                      value={k.value}
                      onChange={(e) => updateKeyframe(i, { value: Number(e.target.value) })}
                      className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                    />
                  </label>
                  <label className="text-xs">
                    Easing
                    <select
                      value={k.easing || "linear"}
                      onChange={(e) => updateKeyframe(i, { easing: e.target.value })}
                      className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                    >
                      <option value="linear">linear</option>
                      <option value="easeIn">easeIn</option>
                      <option value="easeOut">easeOut</option>
                      <option value="easeInOut">easeInOut</option>
                      <option value="bezier">bezier</option>
                    </select>
                  </label>
                  {k.easing === "bezier" && (
                    <div className="col-span-2 grid grid-cols-4 gap-2">
                      <label className="text-xs">
                        x1
                        <input
                          type="number"
                          step={0.01}
                          min={0}
                          max={1}
                          value={k.bezier?.x1 ?? 0.25}
                          onChange={(e) => updateKeyframe(i, { easing: "bezier", ...(k.bezier || {}), bezier: { x1: Number(e.target.value), y1: k.bezier?.y1 ?? 0.1, x2: k.bezier?.x2 ?? 0.25, y2: k.bezier?.y2 ?? 1 } } as any)}
                          className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                        />
                      </label>
                      <label className="text-xs">
                        y1
                        <input
                          type="number"
                          step={0.01}
                          min={0}
                          max={1}
                          value={k.bezier?.y1 ?? 0.1}
                          onChange={(e) => updateKeyframe(i, { easing: "bezier", ...(k.bezier || {}), bezier: { x1: k.bezier?.x1 ?? 0.25, y1: Number(e.target.value), x2: k.bezier?.x2 ?? 0.25, y2: k.bezier?.y2 ?? 1 } } as any)}
                          className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                        />
                      </label>
                      <label className="text-xs">
                        x2
                        <input
                          type="number"
                          step={0.01}
                          min={0}
                          max={1}
                          value={k.bezier?.x2 ?? 0.25}
                          onChange={(e) => updateKeyframe(i, { easing: "bezier", ...(k.bezier || {}), bezier: { x1: k.bezier?.x1 ?? 0.25, y1: k.bezier?.y1 ?? 0.1, x2: Number(e.target.value), y2: k.bezier?.y2 ?? 1 } } as any)}
                          className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                        />
                      </label>
                      <label className="text-xs">
                        y2
                        <input
                          type="number"
                          step={0.01}
                          min={0}
                          max={1}
                          value={k.bezier?.y2 ?? 1}
                          onChange={(e) => updateKeyframe(i, { easing: "bezier", ...(k.bezier || {}), bezier: { x1: k.bezier?.x1 ?? 0.25, y1: k.bezier?.y1 ?? 0.1, x2: k.bezier?.x2 ?? 0.25, y2: Number(e.target.value) } } as any)}
                          className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                        />
                      </label>
                    </div>
                  )}
                  <div className="text-[11px] text-gray-400 self-end">
                    t={k.time.toFixed(2)}s, v={k.value}
                  </div>
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