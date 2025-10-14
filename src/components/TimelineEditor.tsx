import React, { useMemo, useState } from "react";
import { usePlayerStore, Layer } from "../state/store";
import { audioEngine } from "../lib/audio";

type PropKey = "x" | "y" | "opacity" | "size" | "rotation";

const props: PropKey[] = ["x", "y", "opacity", "size", "rotation"];

// helpers for curve rendering
function cubicBezierY(t: number, x1: number, y1: number, x2: number, y2: number): number {
  const u = 1 - t;
  return (3 * u * u * t * y1) + (3 * u * t * t * y2) + (t * t * t);
}

function interpKF(kf: any[] | undefined, t: number, base: number): number {
  if (!kf || kf.length === 0) return base;
  const sorted = kf.slice().sort((a: any, b: any) => a.time - b.time);
  if (t <= sorted[0].time) return sorted[0].value;
  if (t >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1].value;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (t >= a.time && t <= b.time) {
      const tt = (t - a.time) / (b.time - a.time);
      const ease = a.easing ?? "linear";
      let e =
        ease === "easeIn" ? tt * tt :
        ease === "easeOut" ? tt * (2 - tt) :
        ease === "easeInOut" ? (tt < 0.5 ? 2 * tt * tt : -1 + (4 - 2 * tt) * tt) :
        tt;
      if (ease === "bezier" && a.bezier) {
        e = cubicBezierY(tt, a.bezier.x1, a.bezier.y1, a.bezier.x2, a.bezier.y2);
      }
      return a.value + (b.value - a.value) * e;
    }
  }
  return base;
}

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
  const [draggingProp, setDraggingProp] = useState<PropKey | null>(null);
  const [activeKF, setActiveKF] = useState<{ prop: PropKey; index: number } | null>(null);
  const [clipboardKF, setClipboardKF] = useState<{ prop: PropKey; kf: any } | null>(null);

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

  const updateKeyframeFor = (propKey: PropKey, idx: number, patch: Partial<{ time: number; value: number; easing: string }>) => {
    if (!selected) return;
    const nextKf = { ...(selected.kf || {}) } as any;
    const list = Array.isArray(nextKf[propKey]) ? nextKf[propKey].slice() : [];
    const cur = list[idx];
    if (!cur) return;
    const next = { ...cur, ...patch };
    list[idx] = next;
    nextKf[propKey] = list;
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

  const removeKeyframeFor = (propKey: PropKey, idx: number) => {
    if (!selected) return;
    const nextKf = { ...(selected.kf || {}) } as any;
    const list = Array.isArray(nextKf[propKey]) ? nextKf[propKey].slice() : [];
    list.splice(idx, 1);
    nextKf[propKey] = list;
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

      {/* keybindings */}
      <div
        tabIndex={0}
        onKeyDown={(e) => {
          if (!selected) return;
          if (e.key === "Delete" || e.key === "Backspace") {
            if (activeKF) {
              removeKeyframeFor(activeKF.prop, activeKF.index);
              e.preventDefault();
            }
          } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
            if (activeKF) {
              const arr = ((selected.kf?.[activeKF.prop] as any[]) || []).slice();
              const cur = arr[activeKF.index];
              if (cur) {
                setClipboardKF({ prop: activeKF.prop, kf: { ...cur } });
              }
              e.preventDefault();
            }
          } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
            if (clipboardKF) {
              const nextKf = { ...(selected.kf || {}) } as any;
              const list = Array.isArray(nextKf[clipboardKF.prop]) ? nextKf[clipboardKF.prop].slice() : [];
              const t = snapTime(audioEngine.getCurrentTime());
              list.push({ ...clipboardKF.kf, time: t });
              nextKf[clipboardKF.prop] = list;
              updateLayer(selected.id, { kf: nextKf });
              e.preventDefault();
            }
          }
        }}
        className="mb-2 grid grid-cols-3 gap-2 outline-none"
      >
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

      {/* Multi-lane timeline tracks */}
      {selected && (
        <div className="space-y-2 mb-3">
          {props.map((laneProp) => {
            const kfs = (selected.kf?.[laneProp] as any[]) || [];
            const sortedKfs = kfs.slice().sort((a, b) => a.time - b.time);

            // derive duration and sampling
            const dur = isFinite(duration) && duration > 0 ? duration : 60;
            const samples = 64;

            // compute curve min/max by sampling to scale vertically
            const baseVal = (selected as any)[laneProp] ?? 0;
            const vals: number[] = [];
            for (let i = 0; i <= samples; i++) {
              const tt = (i / samples) * dur;
              vals.push(interpKF(sortedKfs, tt, baseVal));
            }
            const vMin = Math.min(...vals);
            const vMax = Math.max(...vals);
            const vRange = vMax - vMin || 1;

            // build normalized path (viewBox 0..1000 x, 0..100 y)
            let d = "";
            for (let i = 0; i <= samples; i++) {
              const tt = (i / samples) * dur;
              const val = interpKF(sortedKfs, tt, baseVal);
              const nx = (i / samples) * (1000 / zoom);
              const ny = (1 - (val - vMin) / vRange) * 100;
              d += (i === 0 ? `M ${nx} ${ny}` : ` L ${nx} ${ny}`);
            }

            // extended snapping to markers and other keyframes
            const snapTimeExt = (t: number) => {
              if (!snapEnabled) return t;
              const baseSnap = Math.round(t / snapStep) * snapStep;
              let best = baseSnap;
              let bestDiff = Math.abs(best - t);
              // marker snapping
              for (const m of markers) {
                const diff = Math.abs(m - t);
                if (diff < bestDiff && diff <= snapStep * 0.5) {
                  best = m; bestDiff = diff;
                }
              }
              // keyframe snapping (other times)
              for (const k of sortedKfs) {
                const diff = Math.abs(k.time - t);
                if (diff < bestDiff && diff <= snapStep * 0.5) {
                  best = k.time; bestDiff = diff;
                }
              }
              return Math.max(0, Math.min(dur, best));
            };

            return (
              <div key={laneProp} className="relative w-full h-14 bg-gray-900 border border-gray-800 rounded">
                <div className="absolute left-2 top-1 text-[11px] text-gray-400">{laneProp}</div>

                {/* curve path */}
                <svg className="absolute inset-0" viewBox={`0 0 ${1000 / zoom} 100`} preserveAspectRatio="none">
                  <path d={d} fill="none" stroke="url(#gradTimeline)" strokeWidth={1} />
                  <defs>
                    <linearGradient id="gradTimeline" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#6366f1" />
                      <stop offset="100%" stopColor="#22d3ee" />
                    </linearGradient>
                  </defs>
                </svg>

                <div
                  className="absolute inset-0"
                  onClick={(e) => {
                    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;
                    const w = rect.width;
                    const h = rect.height;
                    const t = snapTimeExt((x / w) * dur);
                    const valNorm = 1 - Math.max(0, Math.min(1, y / h));
                    const val = vMin + valNorm * vRange;
                    const kf = { time: t, value: val, easing: "linear" as const };
                    const nextKf = { ...(selected.kf || {}) } as any;
                    const list = Array.isArray(nextKf[laneProp]) ? nextKf[laneProp].slice() : [];
                    list.push(kf);
                    nextKf[laneProp] = list;
                    updateLayer(selected.id, { kf: nextKf });
                  }}
                  onMouseMove={(e) => {
                    if (draggingIdx == null || draggingProp == null) return;
                    if (draggingProp !== laneProp) return;
                    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;
                    const w = rect.width;
                    const h = rect.height;
                    const t = snapTimeExt(Math.max(0, Math.min(dur, (x / w) * dur)));
                    const valNorm = 1 - Math.max(0, Math.min(1, y / h));
                    const val = vMin + valNorm * vRange;
                    updateKeyframeFor(laneProp, draggingIdx, { time: t, value: val });
                  }}
                  onMouseUp={() => { setDraggingIdx(null); setDraggingProp(null); }}
                  onMouseLeave={() => { setDraggingIdx(null); setDraggingProp(null); }}
                  title={`Click to add keyframe on ${laneProp}`}
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
                        left: `${(Math.min(1, m / dur) * 100) * (1 / zoom)}%`
                      }}
                      title={`${m.toFixed(2)}s`}
                    />
                  ))}
                  {/* keyframes for laneProp */}
                  {sortedKfs.map((k: any, i: number) => (
                    <div key={i}
                      className="absolute -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-brand-500 rounded-full cursor-ew-resize"
                      style={{
                        left: `${(Math.min(1, k.time / dur) * 100) * (1 / zoom)}%`,
                        // place marker vertically near curve value (approximate)
                        top: `${(1 - (Math.max(0, Math.min(1, (k.value - vMin) / vRange)))) * 100}%`
                      }}
                      title={`t=${k.time.toFixed(2)}s, v=${k.value}`}
                      onMouseDown={() => { setDraggingIdx(i); setDraggingProp(laneProp); setActiveKF({ prop: laneProp, index: i }); }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
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
                      onChange={(e) => updateKeyframeFor(prop, i, { time: Number(e.target.value) })}
                      className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                    />
                  </label>
                  <label className="text-xs">
                    Value
                    <input
                      type="number"
                      step={prop === "opacity" ? 0.05 : 1}
                      value={k.value}
                      onChange={(e) => updateKeyframeFor(prop, i, { value: Number(e.target.value) })}
                      className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                    />
                  </label>
                  <label className="text-xs">
                    Easing
                    <select
                      value={k.easing || "linear"}
                      onChange={(e) => updateKeyframeFor(prop, i, { easing: e.target.value })}
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
                          onChange={(e) => updateKeyframeFor(prop, i, { easing: "bezier", ...(k.bezier || {}), bezier: { x1: Number(e.target.value), y1: k.bezier?.y1 ?? 0.1, x2: k.bezier?.x2 ?? 0.25, y2: k.bezier?.y2 ?? 1 } } as any)}
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
                          onChange={(e) => updateKeyframeFor(prop, i, { easing: "bezier", ...(k.bezier || {}), bezier: { x1: k.bezier?.x1 ?? 0.25, y1: Number(e.target.value), x2: k.bezier?.x2 ?? 0.25, y2: k.bezier?.y2 ?? 1 } } as any)}
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
                          onChange={(e) => updateKeyframeFor(prop, i, { easing: "bezier", ...(k.bezier || {}), bezier: { x1: k.bezier?.x1 ?? 0.25, y1: k.bezier?.y1 ?? 0.1, x2: Number(e.target.value), y2: k.bezier?.y2 ?? 1 } } as any)}
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
                          onChange={(e) => updateKeyframeFor(prop, i, { easing: "bezier", ...(k.bezier || {}), bezier: { x1: k.bezier?.x1 ?? 0.25, y1: k.bezier?.y1 ?? 0.1, x2: k.bezier?.x2 ?? 0.25, y2: Number(e.target.value) } } as any)}
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