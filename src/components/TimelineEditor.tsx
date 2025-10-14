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
  const [selectedKFs, setSelectedKFs] = useState<Array<{ prop: PropKey; index: number }>>([]);
  const [clipboardKFs, setClipboardKFs] = useState<Array<{ prop: PropKey; kf: any }>>([]);
  const [groupDrag, setGroupDrag] = useState<{
    prop: PropKey | null;
    startX: number;
    startTimes: Array<{ prop: PropKey; index: number; time: number }>;
  } | null>(null);
  const [bezierDrag, setBezierDrag] = useState<"p1" | "p2" | null>(null);

  // lane-specific snap overrides
  const [laneSnap, setLaneSnap] = useState<Partial<Record<PropKey, { enabled: boolean; step: number }>>>({
    x: { enabled: false, step: 0.1 },
    y: { enabled: false, step: 0.1 },
    opacity: { enabled: false, step: 0.05 },
    size: { enabled: false, step: 1 },
    rotation: { enabled: false, step: 1 }
  });

  // inline bezier segment editor state
  const [inlineBezierEdit, setInlineBezierEdit] = useState<{ prop: PropKey; startIndex: number; dragging: "p1" | "p2" | null } | null>(null);

  // drag-rectangle brush selection
  const [brush, setBrush] = useState<{ active: boolean; lane: PropKey | null; x0: number; y0: number; x1: number; y1: number } | null>(null);

  // undo/redo stacks for selected layer's keyframes
  const [undoStack, setUndoStack] = useState<any[]>([]);
  const [redoStack, setRedoStack] = useState<any[]>([]);

  const pushUndo = () => {
    if (!selected) return;
    const snap = JSON.parse(JSON.stringify(selected.kf || {}));
    setUndoStack((prev) => [...prev, snap]);
    setRedoStack([]);
  };
  const undo = () => {
    if (!selected) return;
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.slice();
      const snap = next.pop()!;
      setRedoStack((r) => [JSON.parse(JSON.stringify(selected.kf || {})), ...r]);
      updateLayer(selected.id, { kf: snap });
      return next;
    });
  };
  const redo = () => {
    if (!selected) return;
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.slice();
      const snap = next.shift()!;
      setUndoStack((u) => [...u, JSON.parse(JSON.stringify(selected.kf || {}))]);
      updateLayer(selected.id, { kf: snap });
      return next;
    });
  };

  const toggleLaneSnap = (p: PropKey, enabled: boolean) =>
    setLaneSnap((prev) => ({ ...prev, [p]: { enabled, step: prev[p]?.step ?? snapStep } }));
  const setLaneSnapStep = (p: PropKey, step: number) =>
    setLaneSnap((prev) => ({ ...prev, [p]: { enabled: prev[p]?.enabled ?? false, step: Math.max(0.01, step) } }));

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
    pushUndo();
    updateLayer(selected.id, { kf: nextKf });
  };


  const removeKeyframeFor = (propKey: PropKey, idx: number) => {
    if (!selected) return;
    const nextKf = { ...(selected.kf || {}) } as any;
    const list = Array.isArray(nextKf[propKey]) ? nextKf[propKey].slice() : [];
    list.splice(idx, 1);
    nextKf[propKey] = list;
    pushUndo();
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
          const dur = isFinite(duration) && duration > 0 ? duration : 60;

          // Delete removes active keyframe or all selected keyframes
          if (e.key === "Delete" || e.key === "Backspace") {
            if (selectedKFs.length > 0) {
              const nextKf = { ...(selected.kf || {}) } as any;
              for (const sel of selectedKFs) {
                const arr = (nextKf[sel.prop] || []).slice();
                arr.splice(sel.index, 1);
                nextKf[sel.prop] = arr;
              }
              updateLayer(selected.id, { kf: nextKf });
              setSelectedKFs([]);
              setActiveKF(null);
              e.preventDefault();
            } else if (activeKF) {
              removeKeyframeFor(activeKF.prop, activeKF.index);
              setActiveKF(null);
              e.preventDefault();
            }
          }

          // Copy selected keyframes
          else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
            const toCopy: Array<{ prop: PropKey; kf: any }> = [];
            if (selectedKFs.length > 0) {
              for (const sel of selectedKFs) {
                const arr = ((selected.kf?.[sel.prop] as any[]) || []).slice();
                const cur = arr[sel.index];
                if (cur) toCopy.push({ prop: sel.prop, kf: { ...cur } });
              }
            } else if (activeKF) {
              const arr = ((selected.kf?.[activeKF.prop] as any[]) || []).slice();
              const cur = arr[activeKF.index];
              if (cur) toCopy.push({ prop: activeKF.prop, kf: { ...cur } });
            }
            if (toCopy.length > 0) {
              setClipboardKFs(toCopy);
              e.preventDefault();
            }
          }

          // Paste at current time for each copied keyframe (same property lanes)
          else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
            if (clipboardKFs.length > 0) {
              const nextKf = { ...(selected.kf || {}) } as any;
              const tPaste = snapTime(audioEngine.getCurrentTime());
              // paste with offsets if Shift is held
              if (e.shiftKey) {
                const minT = Math.min(...clipboardKFs.map((c) => c.kf.time ?? 0));
                for (const item of clipboardKFs) {
                  const list = Array.isArray(nextKf[item.prop]) ? nextKf[item.prop].slice() : [];
                  const newTime = tPaste + ((item.kf.time ?? 0) - minT);
                  list.push({ ...item.kf, time: newTime });
                  nextKf[item.prop] = list;
                }
              } else {
                for (const item of clipboardKFs) {
                  const list = Array.isArray(nextKf[item.prop]) ? nextKf[item.prop].slice() : [];
                  list.push({ ...item.kf, time: tPaste });
                  nextKf[item.prop] = list;
                }
              }
              pushUndo();
              updateLayer(selected.id, { kf: nextKf });
              e.preventDefault();
            }
          }
          // Undo/Redo
          else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
            e.preventDefault();
            undo();
          }
          else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
            e.preventDefault();
            redo();
          }

          // Nudge left/right for selected or active keyframe(s)
          else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            const delta = (e.shiftKey ? snapStep : snapStep * 0.25) * (e.key === "ArrowLeft" ? -1 : 1);
            const nextKf = { ...(selected.kf || {}) } as any;
            const targets = selectedKFs.length > 0 ? selectedKFs : (activeKF ? [activeKF] : []);
            for (const t of targets as any[]) {
              const arr = (nextKf[t.prop] || []).slice();
              if (arr[t.index]) {
                const nt = Math.max(0, Math.min(dur, (arr[t.index].time ?? 0) + delta));
                arr[t.index] = { ...arr[t.index], time: snapEnabled ? Math.round(nt / snapStep) * snapStep : nt };
                nextKf[t.prop] = arr;
              }
            }
            if (targets.length > 0) {
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

      {/* Timeline toolbar */}
      <div className="flex items-center gap-2 mb-2">
        <button
          className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs"
          disabled={!selected}
          onClick={() => {
            if (!selected) return;
            const arr = ((selected.kf?.[prop] as any[]) || []);
            setSelectedKFs(arr.map((_, idx) => ({ prop, index: idx })));
          }}
          title="Select all keyframes in current lane"
        >
          Select All (lane)
        </button>

        <button
          className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs"
          disabled={!selected}
          onClick={() => {
            if (!selected) return;
            const all: Array<{ prop: PropKey; index: number }> = [];
            for (const p of props) {
              const arr = ((selected.kf?.[p] as any[]) || []);
              arr.forEach((_, idx) => all.push({ prop: p, index: idx }));
            }
            setSelectedKFs(all);
          }}
          title="Select all keyframes across all lanes"
        >
          Select All (layer)
        </button>

        <button
          className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs"
          disabled={!selected || (selectedKFs.length === 0 && !activeKF)}
          onClick={() => {
            if (!selected) return;
            const tPaste = snapTime(audioEngine.getCurrentTime());
            const targets = selectedKFs.length > 0 ? selectedKFs : (activeKF ? [activeKF] : []);
            const nextKf = { ...(selected.kf || {}) } as any;
            for (const t of targets as any[]) {
              const list = Array.isArray(nextKf[t.prop]) ? nextKf[t.prop].slice() : [];
              const cur = ((selected.kf?.[t.prop] as any[]) || [])[t.index];
              if (cur) {
                list.push({ ...cur, time: tPaste });
                nextKf[t.prop] = list;
              }
            }
            updateLayer(selected.id, { kf: nextKf });
          }}
          title="Duplicate selected to current time"
        >
          Duplicate to current
        </button>

        <button
          className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs"
          disabled={!selected || clipboardKFs.length === 0}
          onClick={() => {
            if (!selected || clipboardKFs.length === 0) return;
            const tPaste = snapTime(audioEngine.getCurrentTime());
            const nextKf = { ...(selected.kf || {}) } as any;
            const list = Array.isArray(nextKf[prop]) ? nextKf[prop].slice() : [];
            for (const item of clipboardKFs) {
              list.push({ ...item.kf, time: tPaste });
            }
            nextKf[prop] = list;
            pushUndo();
            updateLayer(selected.id, { kf: nextKf });
          }}
          title="Paste clipboard keyframes into current lane at current time"
        >
          Paste into lane
        </button>

        <button
          className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs"
          disabled={!selected || clipboardKFs.length === 0}
          onClick={() => {
            if (!selected || clipboardKFs.length === 0) return;
            const tPaste = snapTime(audioEngine.getCurrentTime());
            const nextKf = { ...(selected.kf || {}) } as any;
            const list = Array.isArray(nextKf[prop]) ? nextKf[prop].slice() : [];
            const minT = Math.min(...clipboardKFs.map((c) => c.kf.time ?? 0));
            for (const item of clipboardKFs) {
              const newTime = tPaste + ((item.kf.time ?? 0) - minT);
              list.push({ ...item.kf, time: newTime });
            }
            nextKf[prop] = list;
            pushUndo();
            updateLayer(selected.id, { kf: nextKf });
          }}
          title="Paste clipboard keyframes preserving relative offsets"
        >
          Paste with offsets
        </button>

        <button
          className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs"
          disabled={!selected}
          onClick={() => {
            if (!selected) return;
            const allInLane = ((selected.kf?.[prop] as any[]) || []);
            const current = selectedKFs.map((s) => s.index);
            const inverted = allInLane.map((_, idx) => ({ prop, index: idx })).filter((item) => !current.includes(item.index));
            setSelectedKFs(inverted);
          }}
          title="Invert selection (current lane)"
        >
          Invert (lane)
        </button>

        <button
          className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs"
          disabled={!selected}
          onClick={() => {
            if (!selected) return;
            const all: Array<{ prop: PropKey; index: number }> = [];
            for (const p of props) {
              const arr = ((selected.kf?.[p] as any[]) || []);
              arr.forEach((_, idx) => all.push({ prop: p, index: idx }));
            }
            const currentSet = new Set(selectedKFs.map((s) => `${s.prop}:${s.index}`));
            const inverted = all.filter((it) => !currentSet.has(`${it.prop}:${it.index}`));
            setSelectedKFs(inverted);
          }}
          title="Invert selection (layer)"
        >
          Invert (layer)
        </button>

        <button
          className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs"
          disabled={!selected || selectedKFs.length === 0}
          onClick={() => {
            if (!selected || selectedKFs.length === 0) return;
            const nextKf = { ...(selected.kf || {}) } as any;
            for (const m of markers) {
              const list = Array.isArray(nextKf[prop]) ? nextKf[prop].slice() : [];
              for (const s of selectedKFs.filter((skf) => skf.prop === prop)) {
                const cur = ((selected.kf?.[prop] as any[]) || [])[s.index];
                if (cur) list.push({ ...cur, time: m });
              }
              nextKf[prop] = list;
            }
            pushUndo();
            updateLayer(selected.id, { kf: nextKf });
          }}
          title="Duplicate selected keyframes to all markers (current lane)"
        >
          Duplicate to markers
        </button>

        <button
          className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs"
          disabled={!selected}
          onClick={() => {
            if (!selected) return;
            const arr = ((selected.kf?.[prop] as any[]) || []).slice().sort((a, b) => a.time - b.time);
            if (arr.length === 0) return;
            const vMin = Math.min(...arr.map((k: any) => k.value ?? 0));
            const vMax = Math.max(...arr.map((k: any) => k.value ?? 0));
            const vRange = vMax - vMin || 1;
            const nextKf = { ...(selected.kf || {}) } as any;
            const list = arr.map((k: any) => ({ ...k, value: (k.value - vMin) / vRange }));
            nextKf[prop] = list;
            pushUndo();
            updateLayer(selected.id, { kf: nextKf });
          }}
          title="Normalize current lane values to 0..1"
        >
          Normalize lane
        </button>

        <button
          className="ml-auto px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs"
          disabled={!selected || undoStack.length === 0}
          onClick={() => undo()}
          title="Undo (Ctrl/Cmd+Z)"
        >
          Undo
        </button>
        <button
          className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs"
          disabled={!selected || redoStack.length === 0}
          onClick={() => redo()}
          title="Redo (Ctrl/Cmd+Y)"
        >
          Redo
        </button>

        {/* Lane snap override */}
        <label className="text-xs ml-4 flex items-center gap-2">
          <input
            type="checkbox"
            checked={!!laneSnap[prop]?.enabled}
            onChange={(e) => toggleLaneSnap(prop, e.target.checked)}
          />
          Lane snap
        </label>
        <label className="text-xs">
          Lane step
          <input
            type="number"
            min={0.01}
            step={0.01}
            value={laneSnap[prop]?.step ?? snapStep}
            onChange={(e) => setLaneSnapStep(prop, Number(e.target.value))}
            className="w-24 bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs ml-1"
          />
        </label>

        <button
          className="ml-4 px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs"
          disabled={!selected}
          onClick={() => {
            if (!selected) return;
            const arr = ((selected.kf?.[prop] as any[]) || []);
            if (arr.length === 0) return;
            const ms = markers.slice().sort((a, b) => a - b);
            let start = 0, end = audioEngine.getDuration() || 60;
            const ct = audioEngine.getCurrentTime();
            if (ms.length >= 2) {
              let prev = ms[0], next = ms[ms.length - 1];
              for (let i = 0; i < ms.length - 1; i++) {
                if (ct >= ms[i] && ct <= ms[i + 1]) {
                  prev = ms[i]; next = ms[i + 1]; break;
                }
              }
              start = prev; end = next;
            } else {
              start = Math.max(0, ct - 2);
              end = Math.min(end, ct + 2);
            }
            const selectedRange = arr
              .map((_, idx) => ({ prop, index: idx }))
              .filter((item) => {
                const k = arr[item.index];
                return (k.time ?? 0) >= start && (k.time ?? 0) <= end;
              });
            setSelectedKFs(selectedRange);
          }}
          title="Select range around current time (between nearest markers or ±2s)"
        >
          Select range (lane)
        </button>
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

            // extended snapping to markers and other keyframes (lane-aware)
            const laneStep = laneSnap[laneProp]?.enabled ? (laneSnap[laneProp]?.step ?? snapStep) : snapStep;
            const snapTimeExt = (t: number) => {
              if (!snapEnabled && !laneSnap[laneProp]?.enabled) return t;
              const baseSnap = Math.round(t / laneStep) * laneStep;
              let best = baseSnap;
              let bestDiff = Math.abs(best - t);
              // marker snapping
              for (const m of markers) {
                const diff = Math.abs(m - t);
                if (diff < bestDiff && diff <= laneStep * 0.5) {
                  best = m; bestDiff = diff;
                }
              }
              // keyframe snapping (other times)
              for (const k of sortedKfs) {
                const diff = Math.abs(k.time - t);
                if (diff < bestDiff && diff <= laneStep * 0.5) {
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
                  onMouseDown={(e) => {
                    // Alt+Drag starts brush selection
                    if (e.altKey) {
                      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                      const x = e.clientX - rect.left;
                      const y = e.clientY - rect.top;
                      setBrush({ active: true, lane: laneProp, x0: x, y0: y, x1: x, y1: y });
                      e.preventDefault();
                    }
                  }}
                  onClick={(e) => {
                    // skip add on brush start
                    if (brush?.active) return;
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
                    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;
                    const w = rect.width;
                    const h = rect.height;

                    // brush update
                    if (brush?.active && brush.lane === laneProp) {
                      setBrush((prev) => prev ? { ...prev, x1: x, y1: y } : prev);
                      return;
                    }

                    // inline bezier handle drag
                    if (inlineBezierEdit && inlineBezierEdit.prop === laneProp && inlineBezierEdit.dragging) {
                      const xn = Math.max(0, Math.min(1, x / w));
                      const yn = Math.max(0, Math.min(1, y / h));
                      // read current segment start bezier
                      const segStart = sortedKfs[inlineBezierEdit.startIndex];
                      const bz = (segStart?.bezier) || { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 };
                      const newBz = {
                        x1: inlineBezierEdit.dragging === "p1" ? xn : bz.x1,
                        y1: inlineBezierEdit.dragging === "p1" ? (1 - yn) : bz.y1,
                        x2: inlineBezierEdit.dragging === "p2" ? xn : bz.x2,
                        y2: inlineBezierEdit.dragging === "p2" ? (1 - yn) : bz.y2
                      };
                      updateKeyframeFor(laneProp, inlineBezierEdit.startIndex, { easing: "bezier", bezier: newBz } as any);
                      return;
                    }

                    if (draggingIdx == null || draggingProp == null) return;
                    if (draggingProp !== laneProp) return;

                    const t = snapTimeExt(Math.max(0, Math.min(dur, (x / w) * dur)));
                    const valNorm = 1 - Math.max(0, Math.min(1, y / h));
                    const val = vMin + valNorm * vRange;

                    // group drag time shift
                    if (groupDrag && groupDrag.prop === laneProp && selectedKFs.length > 1) {
                      const dx = (x - groupDrag.startX) / w; // 0..1
                      const dt = dx * dur;
                      const nextKf = { ...(selected.kf || {}) } as any;
                      for (const s of selectedKFs) {
                        const arr = (nextKf[s.prop] || []).slice();
                        if (arr[s.index]) {
                          const base = groupDrag.startTimes.find(st => st.prop === s.prop && st.index === s(Math.max(0, Math.min(dur, (groupDrag.startTimes.find(st => st.prop === s.prop && st.index === s.index)?.time ?? arr[s.index].time) + dt)));
                          arr[s.index] = { ...arr[s.index], time: nt };
                          nextKf[s.prop] = arr;
                        }
                      }
                      updateLayer(selected.id, { kf: nextKf });
                    } else {
                      // single drag: time + value
                      updateKeyframeFor(laneProp, draggingIdx, { time: t, value: val });
                    }
                  }}
                  onMouseUp={(e) => {
                    // finalize brush selection
                    if (brush?.active && brush.lane === laneProp) {
                      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                      const w = rect.width, h = rect.height;
                      const x0 = Math.min(brush.x0, brush.x1);
                      const y0 = Math.min(brush.y0, brush.y1);
                      const x1 = Math.max(brush.x0, brush.x1);
                      const y1 = Math.max(brush.y0, brush.y1);
                      const t0 = snapTimeExt((x0 / w) * dur);
                      const t1 = snapTimeExt((x1 / w) * dur);
                      const v0 = vMin + (1 - Math.max(0, Math.min(1, y1 / h))) * vRange; // bottom bound
                      const v1 = vMin + (1 - Math.max(0, Math.min(1, y0 / h))) * vRange; // top bound
                      const inRect = ((selected.kf?.[laneProp] as any[]) || [])
                        .map((k: any, idx: number) => ({ k, idx }))
                        .filter(({ k }) => {
                          const kt = k.time ?? 0;
                          const kv = k.value ?? baseVal;
                          return kt >= Math.min(t0, t1) && kt <= Math.max(t0, t1) && kv >= Math.min(v0, v1) && kv <= Math.max(v0, v1);
                        })
                        .map(({ idx }) => ({ prop: laneProp, index: idx }));
                      setSelectedKFs(inRect);
                      setBrush(null);
                    }
                    setDraggingIdx(null);
                    setDraggingProp(null);
                    setGroupDrag(null);
                    setInlineBezierEdit(null);
                  }}
                  onMouseLeave={() => { setDraggingIdx(null); setDraggingProp(null); setGroupDrag(null); setInlineBezierEdit(null); }}
                  title={`Click to add keyframe on ${laneProp}`}
                >
                  {/* grid lines */}
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i}
                      className="absolute top-0 bottom-0 border-r border-gray-800"
                      style={{ left: `${(i / 10) * 100}%` }}
                    />
                  ))}

                  {/* brush overlay */}
                  {brush?.active && brush.lane === laneProp && (
                    <div
                      className="absolute border border-indigo-400/80 bg-indigo-400/10"
                      style={{
                        left: `${Math.min(brush.x0, brush.x1)}px`,
                        top: `${Math.min(brush.y0, brush.y1)}px`,
                        width: `${Math.abs(brush.x1 - brush.x0)}px`,
                        height: `${Math.abs(brush.y1 - brush.y0)}px`
                      }}
                    />
                  )}
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
                      onMouseDown={(ev) => {
                        setDraggingIdx(i);
                        setDraggingProp(laneProp);
                        setActiveKF({ prop: laneProp, index: i });
                        // selection toggle with Shift
                        if (ev.shiftKey) {
                          setSelectedKFs((prev) => {
                            const exists = prev.find((p) => p.prop === laneProp && p.index === i);
                            if (exists) return prev.filter((p) => !(p.prop === laneProp && p.index === i));
                            return [...prev, { prop: laneProp, index: i }];
                          });
                        } else {
                          setSelectedKFs([{ prop: laneProp, index: i }]);
                        }
                        // prepare group drag start across all selected lanes
                        const curSelected = ev.shiftKey ? selectedKFs : [{ prop: laneProp, index: i }];
                        const nextStartTimes: Array<{ prop: PropKey; index: number; time: number }> = [];
                        for (const sel of curSelected) {
                          const arrLane = ((selected.kf?.[sel.prop] as any[]) || []).slice();
                          const cur = arrLane[sel.index];
                          nextStartTimes.push({ prop: sel.prop, index: sel.index, time: cur?.time ?? 0 });
                        }
                        const rect = (ev.currentTarget as HTMLDivElement).getBoundingClientRect();
                        setGroupDrag({ prop: laneProp, startX: ev.clientX - rect.left, startTimes: nextStartTimes });
                      }}
                    />
                  ))}

                  {/* inline bezier segment editors */}
                  {sortedKfs.map((a: any, j: number) => {
                    if (j >= sortedKfs.length - 1) return null;
                    const b = sortedKfs[j + 1];
                    if ((a.easing ?? "linear") !== "bezier") return null;
                    const bz = a.bezier || { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 };
                    const mid = (a.time + b.time) * 0.5;
                    const leftPct = (Math.min(1, mid / dur) * 100) * (1 / zoom);
                    // mini box 64x64 positioned near segment center
                    const box = (
                      <div
                        key={`seg-${j}`}
                        className="absolute -translate-x-1/2"
                        style={{ left: `${leftPct}%`, top: "4px", width: 64, height: 64 }}
                        title="Drag handles to edit segment bezier"
                      >
                        <div
                          className="relative w-16 h-16 bg-gray-800/70 rounded border border-gray-700"
                          onMouseMove={(e) => {
                            if (!inlineBezierEdit || inlineBezierEdit.prop !== laneProp || inlineBezierEdit.startIndex !== j || !inlineBezierEdit.dragging) return;
                            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                            const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                            const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
                            const newBz = {
                              x1: inlineBezierEdit.dragging === "p1" ? x : bz.x1,
                              y1: inlineBezierEdit.dragging === "p1" ? (1 - y) : bz.y1,
                              x2: inlineBezierEdit.dragging === "p2" ? x : bz.x2,
                              y2: inlineBezierEdit.dragging === "p2" ? (1 - y) : bz.y2
                            };
                            updateKeyframeFor(laneProp, j, { easing: "bezier", bezier: newBz } as any);
                          }}
                          onMouseUp={() => setInlineBezierEdit(null)}
                          onMouseLeave={() => setInlineBezierEdit(null)}
                        >
                          <svg className="absolute inset-0" viewBox="0 0 1 1" preserveAspectRatio="none">
                            <rect x="0" y="0" width="1" height="1" fill="none" stroke="#444" strokeWidth="0.02" />
                            {/* visualize Y vs t */}
                            {(() => {
                              let path = "";
                              for (let i = 0; i <= 20; i++) {
                                const t = i / 20;
                                const u = 1 - t;
                                const y = (3 * u * u * t * bz.y1) + (3 * u * t * t * bz.y2) + (t * t * t);
                                const x = t;
                                path += i === 0 ? `M ${x} ${1 - y}` : ` L ${x} ${1 - y}`;
                              }
                              return <path d={path} fill="none" stroke="#22d3ee" strokeWidth="0.03" />;
                            })()}
                            {/* handles */}
                            <circle cx={bz.x1} cy={1 - bz.y1} r="0.05" fill="#6366f1"
                              onMouseDown={() => setInlineBezierEdit({ prop: laneProp, startIndex: j, dragging: "p1" })}
                            />
                            <circle cx={bz.x2} cy={1 - bz.y2} r="0.05" fill="#6366f1"
                              onMouseDown={() => setInlineBezierEdit({ prop: laneProp, startIndex: j, dragging: "p2" })}
                            />
                            {/* guides */}
                            <line x1="0" y1="1" x2={bz.x1} y2={1 - bz.y1} stroke="#555" strokeWidth="0.03" />
                            <line x1="1" y1="0" x2={bz.x2} y2={1 - bz.y2} stroke="#555" strokeWidth="0.03" />
                          </svg>
                        </div>
                      </div>
                    );

                    // inline overlay handles directly on lane
                    const left1 = (Math.min(1, (a.time + (b.time - a.time) * bz.x1) / dur) * 100) * (1 / zoom);
                    const top1 = (1 - bz.y1) * 100;
                    const left2 = (Math.min(1, (a.time + (b.time - a.time) * bz.x2) / dur) * 100) * (1 / zoom);
                    const top2 = (1 - bz.y2) * 100;

                    return (
                      <>
                        {box}
                        <div
                          className="absolute -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-indigo-500 rounded-full cursor-move hover:bg-indigo-400 hover:scale-125 transition-transform transition-colors"
                          style={{ left: `${left1}%`, top: `${top1}%` }}
                          onMouseDown={() => setInlineBezierEdit({ prop: laneProp, startIndex: j, dragging: "p1" })}
                          title="Bezier handle P1"
                        />
                        <div
                          className="absolute -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-indigo-500 rounded-full cursor-move hover:bg-indigo-400 hover:scale-125 transition-transform transition-colors"
                          style={{ left: `${left2}%`, top: `${top2}%` }}
                          onMouseDown={() => setInlineBezierEdit({ prop: laneProp, startIndex: j, dragging: "p2" })}
                          title="Bezier handle P2"
                        />
                      </>
                    );
                  })}
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

          {/* Bezier handle editor for active keyframe */}
          {activeKF && Array.isArray(selected.kf?.[activeKF.prop]) && (() => {
            const arr = (selected.kf![activeKF.prop] as any[]).slice();
            const cur = arr[activeKF.index];
            if (!cur || cur.easing !== "bezier") return null;
            const bz = cur.bezier || { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 };
            // Build curve path within 0..1 square
            let path = "";
            for (let i = 0; i <= 50; i++) {
              const t = i / 50;
              const u = 1 - t;
              // cubic bezier X: not used for time interpolation here, we visualize Y vs t
              const y = (3 * u * u * t * bz.y1) + (3 * u * t * t * bz.y2) + (t * t * t);
              const x = t;
              path += i === 0 ? `M ${x} ${1 - y}` : ` L ${x} ${1 - y}`;
            }
            const handleP1 = { x: bz.x1, y: 1 - bz.y1 };
            const handleP2 = { x: bz.x2, y: 1 - bz.y2 };

            return (
              <div className="mt-3 p-2 bg-gray-900 border border-gray-800 rounded">
                <div className="text-[11px] text-gray-400 mb-1">
                  Bezier easing editor (prop: {activeKF.prop}, keyframe #{activeKF.index + 1})
                </div>
                <div
                  className="relative w-40 h-40 bg-gray-800 rounded"
                  onMouseMove={(e) => {
                    if (!bezierDrag) return;
                    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
                    const newBz = {
                      x1: bezierDrag === "p1" ? x : bz.x1,
                      y1: bezierDrag === "p1" ? (1 - y) : bz.y1,
                      x2: bezierDrag === "p2" ? x : bz.x2,
                      y2: bezierDrag === "p2" ? (1 - y) : bz.y2
                    };
                    updateKeyframeFor(activeKF.prop, activeKF.index, { easing: "bezier", bezier: newBz } as any);
                  }}
                  onMouseUp={() => setBezierDrag(null)}
                  onMouseLeave={() => setBezierDrag(null)}
                >
                  <svg className="absolute inset-0" viewBox="0 0 1 1" preserveAspectRatio="none">
                    <rect x="0" y="0" width="1" height="1" fill="none" stroke="#444" strokeWidth="0.002" />
                    <path d={path} fill="none" stroke="#22d3ee" strokeWidth="0.005" />
                    {/* handles */}
                    <circle cx={handleP1.x} cy={handleP1.y} r="0.02" fill="#6366f1"
                      onMouseDown={() => setBezierDrag("p1")}
                    />
                    <circle cx={handleP2.x} cy={handleP2.y} r="0.02" fill="#6366f1"
                      onMouseDown={() => setBezierDrag("p2")}
                    />
                    {/* guide lines */}
                    <line x1="0" y1="1" x2={handleP1.x} y2={handleP1.y} stroke="#555" strokeWidth="0.003" />
                    <line x1="1" y1="0" x2={handleP2.x} y2={handleP2.y} stroke="#555" strokeWidth="0.003" />
                  </svg>
                </div>
                <div className="mt-2 flex gap-2 items-center">
                  <button
                    className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs"
                    onClick={() => updateKeyframeFor(activeKF.prop, activeKF.index, { easing: "bezier", bezier: { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 } } as any)}
                    title="Reset to default"
                  >
                    Reset
                  </button>
                  <div className="text-[11px] text-gray-400">
                    x1={bz.x1.toFixed(2)}, y1={bz.y1.toFixed(2)}, x2={bz.x2.toFixed(2)}, y2={bz.y2.toFixed(2)}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};

export default TimelineEditor;