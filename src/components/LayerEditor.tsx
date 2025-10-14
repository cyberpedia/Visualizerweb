import React from "react";
import { usePlayerStore, Layer } from "../state/store";

const LayerEditor: React.FC = () => {
  const template = usePlayerStore((s) => s.visualizerTemplate);
  const updateLayer = usePlayerStore((s) => s.updateLayer);
  const removeLayer = usePlayerStore((s) => s.removeLayer);
  const setLayerLocked = usePlayerStore((s) => s.setLayerLocked);

  const layers = (template.layers ?? []).slice().sort((a, b) => a.zIndex - b.zIndex);

  const onChange = (id: string, patch: Partial<Layer>) => updateLayer(id, patch);

  return (
    <div className="p-3 border-t border-gray-800">
      <h3 className="text-sm font-semibold mb-2">Layers</h3>
      <ul className="space-y-3">
        {layers.map((l: any) => (
          <li key={l.id} className="p-2 rounded bg-gray-900 border border-gray-800">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-gray-300">
                {l.type} ({l.id.slice(0, 6)})
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={!!l.visible}
                    onChange={(e) => onChange(l.id, { visible: e.target.checked })}
                  />
                  Visible
                </label>
                <label className="text-xs flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={!!l.locked}
                    onChange={(e) => setLayerLocked(l.id, e.target.checked)}
                  />
                  Locked
                </label>
                <button
                  className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs"
                  onClick={() => removeLayer(l.id)}
                >
                  Remove
                </button>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 mb-2">
              <label className="text-xs">
                X
                <input
                  type="number"
                  value={l.x}
                  onChange={(e) => onChange(l.id, { x: Number(e.target.value) })}
                  className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                />
              </label>
              <label className="text-xs">
                Y
                <input
                  type="number"
                  value={l.y}
                  onChange={(e) => onChange(l.id, { y: Number(e.target.value) })}
                  className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                />
              </label>
              <label className="text-xs">
                Opacity
                <input
                  type="number"
                  step={0.05}
                  min={0}
                  max={1}
                  value={l.opacity}
                  onChange={(e) => onChange(l.id, { opacity: Math.max(0, Math.min(1, Number(e.target.value))) })}
                  className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                />
              </label>
              <label className="text-xs">
                Blend
                <select
                  value={l.blendMode || "source-over"}
                  onChange={(e) => onChange(l.id, { blendMode: e.target.value as any })}
                  className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                >
                  <option value="source-over">source-over</option>
                  <option value="lighter">lighter (add)</option>
                  <option value="multiply">multiply</option>
                  <option value="screen">screen</option>
                </select>
              </label>
            </div>

            {l.type === "text" && (
              <div className="grid grid-cols-4 gap-2 mb-2">
                <label className="text-xs">
                  Text
                  <input
                    type="text"
                    value={l.text}
                    onChange={(e) => onChange(l.id, { text: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                  />
                </label>
                <label className="text-xs">
                  Size
                  <input
                    type="number"
                    value={l.size}
                    onChange={(e) => onChange(l.id, { size: Number(e.target.value) })}
                    className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                  />
                </label>
                <label className="text-xs">
                  Color
                  <input
                    type="color"
                    value={l.color}
                    onChange={(e) => onChange(l.id, { color: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                  />
                </label>
                <label className="text-xs">
                  Align
                  <select
                    value={l.align}
                    onChange={(e) => onChange(l.id, { align: e.target.value as any })}
                    className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                  >
                    <option value="left">left</option>
                    <option value="center">center</option>
                    <option value="right">right</option>
                  </select>
                </label>
              </div>
            )}

            {l.type === "image" && (
              <div className="grid grid-cols-4 gap-2 mb-2">
                <label className="text-xs col-span-2">
                  Image URL
                  <input
                    type="text"
                    value={l.src}
                    onChange={(e) => onChange(l.id, { src: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                    placeholder="https://..."
                  />
                </label>
                <label className="text-xs">
                  Width
                  <input
                    type="number"
                    value={l.width}
                    onChange={(e) => onChange(l.id, { width: Number(e.target.value) })}
                    className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                  />
                </label>
                <label className="text-xs">
                  Height
                  <input
                    type="number"
                    value={l.height}
                    onChange={(e) => onChange(l.id, { height: Number(e.target.value) })}
                    className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                  />
                </label>
              </div>
            )}

            {l.type === "shape" && (
              <div className="grid grid-cols-4 gap-2 mb-2">
                <label className="text-xs">
                  Type
                  <select
                    value={l.shape}
                    onChange={(e) => onChange(l.id, { shape: e.target.value as any })}
                    className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                  >
                    <option value="rect">rect</option>
                    <option value="circle">circle</option>
                  </select>
                </label>
                {l.shape === "rect" && (
                  <>
                    <label className="text-xs">
                      Width
                      <input
                        type="number"
                        value={l.width ?? 100}
                        onChange={(e) => onChange(l.id, { width: Number(e.target.value) })}
                        className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                      />
                    </label>
                    <label className="text-xs">
                      Height
                      <input
                        type="number"
                        value={l.height ?? 50}
                        onChange={(e) => onChange(l.id, { height: Number(e.target.value) })}
                        className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                      />
                    </label>
                  </>
                )}
                {l.shape === "circle" && (
                  <label className="text-xs">
                    Radius
                    <input
                      type="number"
                      value={l.radius ?? 40}
                      onChange={(e) => onChange(l.id, { radius: Number(e.target.value) })}
                      className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                    />
                  </label>
                )}
                <label className="text-xs col-span-2">
                  Fill
                  <input
                    type="color"
                    value={l.fillColor}
                    onChange={(e) => onChange(l.id, { fillColor: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                  />
                </label>
              </div>
            )}

            {/* Mask */}
            <div className="grid grid-cols-4 gap-2 mb-2">
              <label className="text-xs">
                Mask
                <select
                  value={l.mask?.type || ""}
                  onChange={(e) => {
                    const t = e.target.value;
                    if (t === "") onChange(l.id, { mask: undefined });
                    else if (t === "rect") onChange(l.id, { mask: { type: "rect", x: 0, y: 0, width: 100, height: 100 } as any });
                    else if (t === "circle") onChange(l.id, { mask: { type: "circle", x: 0, y: 0, radius: 50 } as any });
                    else if (t === "image") onChange(l.id, { mask: { type: "image", src: "" } as any });
                    else if (t === "polygon") onChange(l.id, { mask: { type: "polygon", points: [] } as any });
                  }}
                  className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                >
                  <option value="">(none)</option>
                  <option value="rect">rect</option>
                  <option value="circle">circle</option>
                  <option value="image">image</option>
                  <option value="polygon">polygon</option>
                </select>
              </label>
              {l.mask?.type === "rect" && (
                <>
                  <label className="text-xs">
                    X
                    <input
                      type="number"
                      value={(l.mask as any).x}
                      onChange={(e) => onChange(l.id, { mask: { ...(l.mask as any), x: Number(e.target.value) } as any })}
                      className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                    />
                  </label>
                  <label className="text-xs">
                    Y
                    <input
                      type="number"
                      value={(l.mask as any).y}
                      onChange={(e) => onChange(l.id, { mask: { ...(l.mask as any), y: Number(e.target.value) } as any })}
                      className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                    />
                  </label>
                  <label className="text-xs">
                    W
                    <input
                      type="number"
                      value={(l.mask as any).width}
                      onChange={(e) => onChange(l.id, { mask: { ...(l.mask as any), width: Number(e.target.value) } as any })}
                      className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                    />
                  </label>
                  <label className="text-xs">
                    H
                    <input
                      type="number"
                      value={(l.mask as any).height}
                      onChange={(e) => onChange(l.id, { mask: { ...(l.mask as any), height: Number(e.target.value) } as any })}
                      className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                    />
                  </label>
                </>
              )}
              {l.mask?.type === "circle" && (
                <>
                  <label className="text-xs">
                    X
                    <input
                      type="number"
                      value={(l.mask as any).x}
                      onChange={(e) => onChange(l.id, { mask: { ...(l.mask as any), x: Number(e.target.value) } as any })}
                      className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                    />
                  </label>
                  <label className="text-xs">
                    Y
                    <input
                      type="number"
                      value={(l.mask as any).y}
                      onChange={(e) => onChange(l.id, { mask: { ...(l.mask as any), y: Number(e.target.value) } as any })}
                      className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                    />
                  </label>
                  <label className="text-xs">
                    Radius
                    <input
                      type="number"
                      value={(l.mask as any).radius}
                      onChange={(e) => onChange(l.id, { mask: { ...(l.mask as any), radius: Number(e.target.value) } as any })}
                      className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                    />
                  </label>
                </>
              )}
              {l.mask?.type === "image" && (
                <label className="text-xs col-span-3">
                  URL
                  <input
                    type="text"
                    value={(l.mask as any).src}
                    onChange={(e) => onChange(l.id, { mask: { ...(l.mask as any), src: e.target.value } as any })}
                    className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                    placeholder="https://..."
                  />
                </label>
              )}
              {l.mask?.type === "polygon" && (
                <div className="text-[11px] text-gray-400 col-span-3">
                  Polygon masks are editable via the canvas soon.
                </div>
              )}
            </div>

            {/* Mask Transform */}
            <div className="grid grid-cols-4 gap-2 mb-2">
              <label className="text-xs">
                Mask offset X
                <input
                  type="number"
                  value={l.maskTransform?.x ?? 0}
                  onChange={(e) => onChange(l.id, { maskTransform: { ...(l.maskTransform || {}), x: Number(e.target.value) } as any })}
                  className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                />
              </label>
              <label className="text-xs">
                Mask offset Y
                <input
                  type="number"
                  value={l.maskTransform?.y ?? 0}
                  onChange={(e) => onChange(l.id, { maskTransform: { ...(l.maskTransform || {}), y: Number(e.target.value) } as any })}
                  className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                />
              </label>
              <label className="text-xs">
                Mask scale X
                <input
                  type="number"
                  step={0.01}
                  value={l.maskTransform?.scaleX ?? 1}
                  onChange={(e) => onChange(l.id, { maskTransform: { ...(l.maskTransform || {}), scaleX: Number(e.target.value) } as any })}
                  className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                />
              </label>
              <label className="text-xs">
                Mask scale Y
                <input
                  type="number"
                  step={0.01}
                  value={l.maskTransform?.scaleY ?? 1}
                  onChange={(e) => onChange(l.id, { maskTransform: { ...(l.maskTransform || {}), scaleY: Number(e.target.value) } as any })}
                  className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                />
              </label>
            </div>

            {/* Filters */}
            <div className="grid grid-cols-5 gap-2 mb-2">
              <label className="text-xs">
                Blur (px)
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={l.filters?.blur ?? 0}
                  onChange={(e) => onChange(l.id, { filters: { ...(l.filters || {}), blur: Number(e.target.value) } as any })}
                  className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                />
              </label>
              <label className="text-xs">
                Hue (deg)
                <input
                  type="number"
                  step={1}
                  value={l.filters?.hue ?? 0}
                  onChange={(e) => onChange(l.id, { filters: { ...(l.filters || {}), hue: Number(e.target.value) } as any })}
                  className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                />
              </label>
              <label className="text-xs">
                Saturate
                <input
                  type="number"
                  step={0.05}
                  value={l.filters?.saturate ?? 1}
                  onChange={(e) => onChange(l.id, { filters: { ...(l.filters || {}), saturate: Number(e.target.value) } as any })}
                  className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                />
              </label>
              <label className="text-xs">
                Brightness
                <input
                  type="number"
                  step={0.05}
                  value={l.filters?.brightness ?? 1}
                  onChange={(e) => onChange(l.id, { filters: { ...(l.filters || {}), brightness: Number(e.target.value) } as any })}
                  className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                />
              </label>
              <label className="text-xs">
                Contrast
                <input
                  type="number"
                  step={0.05}
                  value={l.filters?.contrast ?? 1}
                  onChange={(e) => onChange(l.id, { filters: { ...(l.filters || {}), contrast: Number(e.target.value) } as any })}
                  className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs"
                />
              </label>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default LayerEditor;