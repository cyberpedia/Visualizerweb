import React from "react";
import { usePlayerStore, Layer } from "../state/store";
import { audioEngine } from "../lib/audio";

function newTextLayer(): Layer {
  return {
    id: crypto.randomUUID(),
    type: "text",
    visible: true,
    zIndex: 100,
    x: 200,
    y: 200,
    opacity: 1,
    text: "Sample Text",
    color: "#ffffff",
    size: 20,
    align: "left",
    kf: {}
  } as any;
}

function newImageLayer(): Layer {
  return {
    id: crypto.randomUUID(),
    type: "image",
    visible: true,
    zIndex: 100,
    x: 100,
    y: 100,
    opacity: 1,
    src: "",
    width: 128,
    height: 128,
    clipCircle: false,
    kf: {}
  } as any;
}

function newProgressRingLayer(): Layer {
  return {
    id: crypto.randomUUID(),
    type: "progressRing",
    visible: true,
    zIndex: 100,
    x: 80,
    y: 80,
    opacity: 1,
    radius: 60,
    thickness: 8,
    color1: "#22d3ee",
    color2: "#ec4899",
    kf: {}
  } as any;
}

function newParticlesLayer(): Layer {
  return {
    id: crypto.randomUUID(),
    type: "particles",
    visible: true,
    zIndex: 10,
    x: 0,
    y: 0,
    opacity: 0.6,
    count: 80,
    size: 2,
    speed: 1.2,
    color: "#22d3ee",
    kf: {}
  } as any;
}

const LayerEditor: React.FC = () => {
  const template = usePlayerStore((s) => s.visualizerTemplate);
  const addLayer = usePlayerStore((s) => s.addLayer);
  const addGroupLayer = usePlayerStore((s) => s.addGroupLayer);
  const updateLayer = usePlayerStore((s) => s.updateLayer);
  const removeLayer = usePlayerStore((s) => s.removeLayer);
  const setLayerParent = usePlayerStore((s) => s.setLayerParent);
  const setLayerLocked = usePlayerStore((s) => s.setLayerLocked);
  const moveLayerZIndex = usePlayerStore((s) => s.moveLayerZIndex);

  const addKF = (id: string, prop: "x" | "y" | "opacity" | "size" | "rotation") => {
    const time = audioEngine.getCurrentTime();
    const layer = (template.layers ?? []).find((l) => l.id === id);
    if (!layer) return;
    const base =
      prop === "x" ? layer.x :
      prop === "y" ? layer.y :
      prop === "opacity" ? layer.opacity :
      prop === "rotation" ? (layer as any).rotation ?? 0 :
      (layer as any).size ?? 0;

    const nextKF = [...(layer.kf?.[prop] ?? []), { time, value: base, easing: "linear" }];
    updateLayer(id, { kf: { ...layer.kf, [prop]: nextKF } } as any);
  };

  const groupOptions = (template.layers ?? []).filter((l) => l.type === "group");

  return (
    <div className="p-3 border-t border-gray-800">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold">Layer Editor</h2>
        <div className="flex items-center gap-2">
          <button
            className="text-xs px-2 py-1 rounded bg-brand-600 hover:bg-brand-500"
            onClick={() => addLayer(newTextLayer())}
          >
            + Text
          </button>
          <button
            className="text-xs px-2 py-1 rounded bg-brand-600 hover:bg-brand-500"
            onClick={() => addLayer(newImageLayer())}
          >
            + Image
          </button>
          <button
            className="text-xs px-2 py-1 rounded bg-brand-600 hover:bg-brand-500"
            onClick={() => addLayer(newProgressRingLayer())}
          >
            + Progress Ring
          </button>
          <button
            className="text-xs px-2 py-1 rounded bg-brand-600 hover:bg-brand-500"
            onClick={() => addLayer(newParticlesLayer())}
          >
            + Particles
          </button>
          <button
            className="text-xs px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500"
            onClick={() => addGroupLayer({ zIndex: 50, x: 0, y: 0 })}
            title="Add group"
          >
            + Group
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {(template.layers ?? []).map((layer) => (
          <div key={layer.id} className="p-2 rounded bg-gray-900 border border-gray-800">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-wide text-gray-400">{layer.type}</div>
              <div className="flex items-center gap-2">
                <label className="text-xs flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={layer.visible}
                    onChange={(e) => updateLayer(layer.id, { visible: e.target.checked })}
                  />
                  visible
                </label>
                <button
                  className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700"
                  onClick={() => removeLayer(layer.id)}
                >
                  Delete
                </button>
              </div>
            </div>

            <div className="mt-2 grid grid-cols-3 gap-2">
              <label className="text-xs">
                X
                <input
                  type="number"
                  value={layer.x}
                  onChange={(e) => updateLayer(layer.id, { x: Number(e.target.value) })}
                  className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                />
                <button
                  className="mt-1 text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700"
                  onClick={() => addKF(layer.id, "x")}
                >
                  + keyframe
                </button>
              </label>
              <label className="text-xs">
                Y
                <input
                  type="number"
                  value={layer.y}
                  onChange={(e) => updateLayer(layer.id, { y: Number(e.target.value) })}
                  className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                />
                <button
                  className="mt-1 text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700"
                  onClick={() => addKF(layer.id, "y")}
                >
                  + keyframe
                </button>
              </label>
              <label className="text-xs">
                Opacity
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={layer.opacity}
                  onChange={(e) => updateLayer(layer.id, { opacity: Number(e.target.value) })}
                  className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                />
                <button
                  className="mt-1 text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700"
                  onClick={() => addKF(layer.id, "opacity")}
                >
                  + keyframe
                </button>
              </label>
            </div>

            <div className="mt-2 grid grid-cols-3 gap-2">
              <label className="text-xs">
                Blend mode
                <select
                  value={(layer as any).blendMode || "source-over"}
                  onChange={(e) => updateLayer(layer.id, { blendMode: e.target.value as any } as any)}
                  className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                >
                  <option value="source-over">source-over</option>
                  <option value="lighter">lighter (add)</option>
                  <option value="multiply">multiply</option>
                  <option value="screen">screen</option>
                </select>
              </label>
              <label className="text-xs">
                Shadow color
                <input
                  type="color"
                  value={(layer as any).shadowColor || "#000000"}
                  onChange={(e) => updateLayer(layer.id, { shadowColor: e.target.value } as any)}
                />
              </label>
              <label className="text-xs">
                Shadow blur
                <input
                  type="number"
                  value={(layer as any).shadowBlur || 0}
                  onChange={(e) => updateLayer(layer.id, { shadowBlur: Number(e.target.value) } as any)}
                  className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                />
              </label>
            </div>

            {/* Filters */}
            <div className="mt-2 grid grid-cols-5 gap-2">
              <label className="text-xs">
                Blur (px)
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={(layer as any).filters?.blur ?? 0}
                  onChange={(e) => updateLayer(layer.id, { filters: { ...((layer as any).filters || {}), blur: Number(e.target.value) } } as any)}
                  className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                />
              </label>
              <label className="text-xs">
                Hue (deg)
                <input
                  type="number"
                  step={1}
                  value={(layer as any).filters?.hue ?? 0}
                  onChange={(e) => updateLayer(layer.id, { filters: { ...((layer as any).filters || {}), hue: Number(e.target.value) } } as any)}
                  className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                />
              </label>
              <label className="text-xs">
                Saturate
                <input
                  type="number"
                  step={0.1}
                  value={(layer as any).filters?.saturate ?? 1}
                  onChange={(e) => updateLayer(layer.id, { filters: { ...((layer as any).filters || {}), saturate: Number(e.target.value) } } as any)}
                  className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                />
              </label>
              <label className="text-xs">
                Brightness
                <input
                  type="number"
                  step={0.1}
                  value={(layer as any).filters?.brightness ?? 1}
                  onChange={(e) => updateLayer(layer.id, { filters: { ...((layer as any).filters || {}), brightness: Number(e.target.value) } } as any)}
                  className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                />
              </label>
              <label className="text-xs">
                Contrast
                <input
                  type="number"
                  step={0.1}
                  value={(layer as any).filters?.contrast ?? 1}
                  onChange={(e) => updateLayer(layer.id, { filters: { ...((layer as any).filters || {}), contrast: Number(e.target.value) } } as any)}
                  className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                />
              </label>
            </div>

            <div className="mt-2 grid grid-cols-3 gap-2">
              <label className="text-xs">
                Audio-reactive target
                <select
                  value={(layer as any).reactive?.target || ""}
                  onChange={(e) => updateLayer(layer.id, { reactive: { ...((layer as any).reactive || {}), target: (e.target.value || undefined) } } as any)}
                  className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                >
                  <option value="">(none)</option>
                  <option value="x">x</option>
                  <option value="y">y</option>
                  <option value="opacity">opacity</option>
                  <option value="size">size</option>
                </select>
              </label>
              <label className="text-xs">
                Source
                <select
                  value={(layer as any).reactive?.source || "beat"}
                  onChange={(e) => updateLayer(layer.id, { reactive: { ...((layer as any).reactive || {}), source: e.target.value } } as any)}
                  className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                >
                  <option value="beat">beat</option>
                </select>
              </label>
              <label className="text-xs">
                Amount
                <input
                  type="number"
                  step={0.1}
                  value={(layer as any).reactive?.amount ?? 0}
                  onChange={(e) => updateLayer(layer.id, { reactive: { ...((layer as any).reactive || {}), amount: Number(e.target.value) } } as any)}
                  className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                />
              </label>
              <label className="text-xs">
                Smooth
                <input
                  type="number"
                  step={0.01}
                  value={(layer as any).reactive?.smooth ?? 0}
                  onChange={(e) => updateLayer(layer.id, { reactive: { ...((layer as any).reactive || {}), smooth: Number(e.target.value) } } as any)}
                  className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                />
              </label>
            </div>

            <div className="mt-2 grid grid-cols-3 gap-2">
              <label className="text-xs flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={(layer as any).locked || false}
                  onChange={(e) => setLayerLocked(layer.id, e.target.checked)}
                />
                locked
              </label>
              <label className="text-xs">
                z-index
                <input
                  type="number"
                  value={layer.zIndex}
                  onChange={(e) => moveLayerZIndex(layer.id, Number(e.target.value))}
                  className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                />
                <div className="mt-1 flex items-center gap-1">
                  <button
                    className="text-[11px] px-2 py-1 rounded bg-gray-800 hover:bg-gray-700"
                    onClick={() => moveLayerZIndex(layer.id, layer.zIndex + 1)}
                  >
                    Up
                  </button>
                  <button
                    className="text-[11px] px-2 py-1 rounded bg-gray-800 hover:bg-gray-700"
                    onClick={() => moveLayerZIndex(layer.id, Math.max(0, layer.zIndex - 1))}
                  >
                    Down
                  </button>
                </div>
              </label>
              <label className="text-xs">
                Parent group
                <select
                  value={(layer as any).parentId || ""}
                  onChange={(e) => setLayerParent(layer.id, e.target.value || null)}
                  className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                >
                  <option value="">(none)</option>
                  {(template.layers ?? []).filter((l) => (l as any).type === "group").map((g) => (
                    <option key={g.id} value={g.id}>{`group (${g.id.slice(0,6)})`}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-2 grid grid-cols-3 gap-2">
              <label className="text-xs">
                Mask
                <select
                  value={(layer as any).mask?.type || "none"}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "none") updateLayer(layer.id, { mask: undefined } as any);
                    else if (val === "rect") updateLayer(layer.id, { mask: { type: "rect", x: layer.x, y: layer.y, width: 100, height: 50 } } as any);
                    else if (val === "circle") updateLayer(layer.id, { mask: { type: "circle", x: layer.x, y: layer.y, radius: 40 } } as any);
                    else if (val === "image") updateLayer(layer.id, { mask: { type: "image", src: "" } } as any);
                    else if (val === "polygon") updateLayer(layer.id, { mask: { type: "polygon", points: [{ x: 0, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 80 }, { x: 0, y: 80 }] } } as any);
                  }}
                  className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                >
                  <option value="none">none</option>
                  <option value="rect">rect</option>
                  <option value="circle">circle</option>
                  <option value="image">image</option>
                  <option value="polygon">polygon</option>
                </select>
              </label>
              {(layer as any).mask?.type === "rect" && (
                <>
                  <label className="text-xs">
                    Mask X
                    <input
                      type="number"
                      value={(layer as any).mask?.x || 0}
                      onChange={(e) => updateLayer(layer.id, { mask: { ...(layer as any).mask, x: Number(e.target.value) } } as any)}
                      className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                    />
                  </label>
                  <label className="text-xs">
                    Mask Y
                    <input
                      type="number"
                      value={(layer as any).mask?.y || 0}
                      onChange={(e) => updateLayer(layer.id, { mask: { ...(layer as any).mask, y: Number(e.target.value) } } as any)}
                      className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                    />
                  </label>
                  <label className="text-xs">
                    Width
                    <input
                      type="number"
                      value={(layer as any).mask?.width || 100}
                      onChange={(e) => updateLayer(layer.id, { mask: { ...(layer as any).mask, width: Number(e.target.value) } } as any)}
                      className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                    />
                  </label>
                  <label className="text-xs">
                    Height
                    <input
                      type="number"
                      value={(layer as any).mask?.height || 50}
                      onChange={(e) => updateLayer(layer.id, { mask: { ...(layer as any).mask, height: Number(e.target.value) } } as any)}
                      className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                    />
                  </label>
                </>
              )}
              {(layer as any).mask?.type === "circle" && (
                <>
                  <label className="text-xs">
                    Mask X
                    <input
                      type="number"
                      value={(layer as any).mask?.x || 0}
                      onChange={(e) => updateLayer(layer.id, { mask: { ...(layer as any).mask, x: Number(e.target.value) } } as any)}
                      className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                    />
                  </label>
                  <label className="text-xs">
                    Mask Y
                    <input
                      type="number"
                      value={(layer as any).mask?.y || 0}
                      onChange={(e) => updateLayer(layer.id, { mask: { ...(layer as any).mask, y: Number(e.target.value) } } as any)}
                      className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                    />
                  </label>
                  <label className="text-xs">
                    Radius
                    <input
                      type="number"
                      value={(layer as any).mask?.radius || 40}
                      onChange={(e) => updateLayer(layer.id, { mask: { ...(layer as any).mask, radius: Number(e.target.value) } } as any)}
                      className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                    />
                  </label>
                </>
              )}
              {(layer as any).mask?.type === "polygon" && (
                <>
                  <label className="text-xs col-span-2">
                    Points (x,y pairs separated by spaces)
                    <input
                      type="text"
                      value={((layer as any).mask?.points || []).map((p: any) => `${p.x},${p.y}`).join(" ") || ""}
                      onChange={(e) => {
                        const parts = e.target.value.trim().split(/\s+/).filter(Boolean);
                        const pts = parts.map((s) => {
                          const [xs, ys] = s.split(",");
                          const x = Number(xs); const y = Number(ys);
                          return { x: isFinite(x) ? x : 0, y: isFinite(y) ? y : 0 };
                        });
                        updateLayer(layer.id, { mask: { ...(layer as any).mask, points: pts } } as any);
                      }}
                      className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                      placeholder="0,0 120,0 120,80 0,80"
                    />
                  </label>
                  <label className="text-xs">
                    Feather
                    <input
                      type="number"
                      value={(layer as any).mask?.feather || 0}
                      onChange={(e) => updateLayer(layer.id, { mask: { ...(layer as any).mask, feather: Number(e.target.value) } } as any)}
                      className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                    />
                  </label>
                  <div className="text-[11px] text-gray-400 col-span-3">
                    Polygon mask clips the layer using the polygon path. Feather adds a soft edge (Canvas2D/Offline). WebGL uses a rasterized mask texture.
                  </div>
                </>
              )}
              {(layer as any).mask?.type === "image" && (
                <>
                  <label className="text-xs col-span-2">
                    Mask image URL
                    <input
                      type="text"
                      value={(layer as any).mask?.src || ""}
                      onChange={(e) => updateLayer(layer.id, { mask: { ...(layer as any).mask, src: e.target.value } } as any)}
                      className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                      placeholder="https://example.com/mask.png"
                    />
                  </label>
                  <label className="text-xs">
                    Pick file
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const url = URL.createObjectURL(f);
                        updateLayer(layer.id, { mask: { ...(layer as any).mask, src: url } } as any);
                      }}
                    />
                  </label>
                  <div className="text-[11px] text-gray-400 col-span-3">
                    The mask's alpha channel is used to clip the layer (destination-in). Ensure the mask aligns with the layer's bounds.
                  </div>
                </>
              )}
              {(layer as any).mask?.type === "image" && (
                <>
                  <label className="text-xs col-span-2">
                    Mask image URL
                    <input
                      type="text"
                      value={(layer as any).mask?.src || ""}
                      onChange={(e) => updateLayer(layer.id, { mask: { type: "image", src: e.target.value } } as any)}
                      className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                    />
                  </label>
                  <label className="text-xs">
                    Pick file
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const url = URL.createObjectURL(f);
                        updateLayer(layer.id, { mask: { type: "image", src: url } } as any);
                      }}
                    />
                  </label>
                  <div className="text-[11px] text-gray-400 col-span-3">
                    Image mask alpha will be used to cut the layer. It maps to the layer’s quad (no scaling controls yet).
                  </div>
                </>
              )}
            </div>

            {/* Mask transform */}
            <div className="mt-2 grid grid-cols-5 gap-2">
              <label className="text-xs">
                Mask X
                <input
                  type="number"
                  value={(layer as any).maskTransform?.x ?? 0}
                  onChange={(e) => updateLayer(layer.id, { maskTransform: { ...((layer as any).maskTransform || {}), x: Number(e.target.value) } } as any)}
                  className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                />
              </label>
              <label className="text-xs">
                Mask Y
                <input
                  type="number"
                  value={(layer as any).maskTransform?.y ?? 0}
                  onChange={(e) => updateLayer(layer.id, { maskTransform: { ...((layer as any).maskTransform || {}), y: Number(e.target.value) } } as any)}
                  className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                />
              </label>
              <label className="text-xs">
                Mask rotation (deg)
                <input
                  type="number"
                  value={(layer as any).maskTransform?.rotation ?? 0}
                  onChange={(e) => updateLayer(layer.id, { maskTransform: { ...((layer as any).maskTransform || {}), rotation: Number(e.target.value) } } as any)}
                  className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                />
              </label>
              <label className="text-xs">
                Mask scale X
                <input
                  type="number"
                  step={0.01}
                  value={(layer as any).maskTransform?.scaleX ?? 1}
                  onChange={(e) => updateLayer(layer.id, { maskTransform: { ...((layer as any).maskTransform || {}), scaleX: Number(e.target.value) } } as any)}
                  className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                />
              </label>
              <label className="text-xs">
                Mask scale Y
                <input
                  type="number"
                  step={0.01}
                  value={(layer as any).maskTransform?.scaleY ?? 1}
                  onChange={(e) => updateLayer(layer.id, { maskTransform: { ...((layer as any).maskTransform || {}), scaleY: Number(e.target.value) } } as any)}
                  className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                />
              </label>
            </div>

            {layer.type === "text" && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                <label className="text-xs col-span-2">
                  Text
                  <input
                    type="text"
                    value={(layer as any).text}
                    onChange={(e) => updateLayer(layer.id, { text: e.target.value } as any)}
                    className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                  />
                </label>
                <label className="text-xs">
                  Size
                  <input
                    type="number"
                    value={(layer as any).size}
                    onChange={(e) => updateLayer(layer.id, { size: Number(e.target.value) } as any)}
                    className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                  />
                  <button
                    className="mt-1 text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700"
                    onClick={() => addKF(layer.id, "size")}
                  >
                    + keyframe
                  </button>
                </label>
                <label className="text-xs">
                  Color
                  <input
                    type="color"
                    value={(layer as any).color}
                    onChange={(e) => updateLayer(layer.id, { color: e.target.value } as any)}
                  />
                </label>
                <label className="text-xs">
                  Align
                  <select
                    value={(layer as any).align}
                    onChange={(e) => updateLayer(layer.id, { align: e.target.value } as any)}
                    className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                  >
                    <option value="left">left</option>
                    <option value="center">center</option>
                    <option value="right">right</option>
                  </select>
                </label>
              </div>
            )}

            {layer.type === "image" && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                <label className="text-xs col-span-2">
                  Src
                  <input
                    type="text"
                    value={(layer as any).src}
                    onChange={(e) => updateLayer(layer.id, { src: e.target.value } as any)}
                    className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                  />
                </label>
                <label className="text-xs">
                  Pick file
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const url = URL.createObjectURL(f);
                      updateLayer(layer.id, { src: url } as any);
                    }}
                  />
                </label>
                <label className="text-xs">
                  Width
                  <input
                    type="number"
                    value={(layer as any).width}
                    onChange={(e) => updateLayer(layer.id, { width: Number(e.target.value) } as any)}
                    className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                  />
                </label>
                <label className="text-xs">
                  Height
                  <input
                    type="number"
                    value={(layer as any).height}
                    onChange={(e) => updateLayer(layer.id, { height: Number(e.target.value) } as any)}
                    className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                  />
                </label>
                <label className="text-xs flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={(layer as any).clipCircle || false}
                    onChange={(e) => updateLayer(layer.id, { clipCircle: e.target.checked } as any)}
                  />
                  circle mask
                </label>
              </div>
            )}

            {layer.type === "shape" && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                <label className="text-xs">
                  Shape
                  <select
                    value={(layer as any).shape}
                    onChange={(e) => updateLayer(layer.id, { shape: e.target.value } as any)}
                    className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                  >
                    <option value="rect">rect</option>
                    <option value="circle">circle</option>
                  </select>
                </label>
                <label className="text-xs">
                  Width
                  <input
                    type="number"
                    value={(layer as any).width ?? 100}
                    onChange={(e) => updateLayer(layer.id, { width: Number(e.target.value) } as any)}
                    className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                  />
                </label>
                <label className="text-xs">
                  Height
                  <input
                    type="number"
                    value={(layer as any).height ?? 50}
                    onChange={(e) => updateLayer(layer.id, { height: Number(e.target.value) } as any)}
                    className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                  />
                </label>
                <label className="text-xs">
                  Radius
                  <input
                    type="number"
                    value={(layer as any).radius ?? 40}
                    onChange={(e) => updateLayer(layer.id, { radius: Number(e.target.value) } as any)}
                    className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                  />
                </label>
                <label className="text-xs">
                  Fill
                  <input
                    type="color"
                    value={(layer as any).fillColor}
                    onChange={(e) => updateLayer(layer.id, { fillColor: e.target.value } as any)}
                  />
                </label>
                <label className="text-xs">
                  Stroke
                  <input
                    type="color"
                    value={(layer as any).strokeColor ?? "#000000"}
                    onChange={(e) => updateLayer(layer.id, { strokeColor: e.target.value } as any)}
                  />
                  <input
                    type="number"
                    value={(layer as any).strokeWidth ?? 0}
                    onChange={(e) => updateLayer(layer.id, { strokeWidth: Number(e.target.value) } as any)}
                    className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs mt-1"
                  />
                </label>
              </div>
            )}

            {layer.type === "progressRing" && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                <label className="text-xs">
                  Radius
                  <input
                    type="number"
                    value={(layer as any).radius}
                    onChange={(e) => updateLayer(layer.id, { radius: Number(e.target.value) } as any)}
                    className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                  />
                </label>
                <label className="text-xs">
                  Thickness
                  <input
                    type="number"
                    value={(layer as any).thickness}
                    onChange={(e) => updateLayer(layer.id, { thickness: Number(e.target.value) } as any)}
                    className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                  />
                </label>
                <label className="text-xs">
                  Color 1
                  <input
                    type="color"
                    value={(layer as any).color1}
                    onChange={(e) => updateLayer(layer.id, { color1: e.target.value } as any)}
                  />
                </label>
                <label className="text-xs">
                  Color 2
                  <input
                    type="color"
                    value={(layer as any).color2}
                    onChange={(e) => updateLayer(layer.id, { color2: e.target.value } as any)}
                  />
                </label>
                <button
                  className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700"
                  onClick={() => addKF(layer.id, "size")}
                >
                  + radius keyframe
                </button>
              </div>
            )}

            {layer.type === "group" && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                <label className="text-xs">
                  Rotation (deg)
                  <input
                    type="number"
                    value={(layer as any).rotation || 0}
                    onChange={(e) => updateLayer(layer.id, { rotation: Number(e.target.value) } as any)}
                    className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                  />
                  <button
                    className="mt-1 text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700"
                    onClick={() => addKF(layer.id, "rotation")}
                  >
                    + rotation keyframe
                  </button>
                </label>
                <label className="text-xs">
                  Scale X
                  <input
                    type="number"
                    step={0.01}
                    value={(layer as any).scaleX ?? 1}
                    onChange={(e) => updateLayer(layer.id, { scaleX: Number(e.target.value) } as any)}
                    className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                  />
                </label>
                <label className="text-xs">
                  Scale Y
                  <input
                    type="number"
                    step={0.01}
                    value={(layer as any).scaleY ?? 1}
                    onChange={(e) => updateLayer(layer.id, { scaleY: Number(e.target.value) } as any)}
                    className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                  />
                </label>
                <label className="text-xs">
                  Anchor X
                  <input
                    type="number"
                    value={(layer as any).anchorX ?? 0}
                    onChange={(e) => updateLayer(layer.id, { anchorX: Number(e.target.value) } as any)}
                    className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                  />
                </label>
                <label className="text-xs">
                  Anchor Y
                  <input
                    type="number"
                    value={(layer as any).anchorY ?? 0}
                    onChange={(e) => updateLayer(layer.id, { anchorY: Number(e.target.value) } as any)}
                    className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                  />
                </label>
                <div className="text-[11px] text-gray-400 col-span-3">
                  Group transforms affect all child layers (parented to this group). Use masks on the group to clip children collectively.
                </div>
              </div>
            )}

            {layer.kf && (
              <div className="mt-2">
                <div className="text-[11px] text-gray-400">Keyframes:</div>
                <pre className="text-[10px] bg-gray-950 rounded p-2 overflow-auto max-h-32">
                  {JSON.stringify(layer.kf, null, 2)}
                </pre>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default LayerEditor;