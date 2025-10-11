import React from "react";
import { usePlayerStore } from "../state/store";

const freqs = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

const Equalizer: React.FC = () => {
  const eqGains = usePlayerStore((s) => s.eqGains);
  const setEqGain = usePlayerStore((s) => s.setEqGain);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold">Equalizer</h2>
        <button
          className="text-xs text-gray-300 hover:text-white"
          onClick={() => freqs.forEach((_, i) => setEqGain(i, 0))}
        >
          Reset
        </button>
      </div>
      <div className="grid grid-cols-10 gap-2">
        {freqs.map((f, i) => (
          <div key={f} className="flex flex-col items-center">
            <input
              type="range"
              min={-12}
              max={12}
              step={0.5}
              value={eqGains[i]}
              onChange={(e) => setEqGain(i, Number(e.target.value))}
              className="h-28 w-6 rotate-[-90deg] origin-center accent-brand-500"
            />
            <div className="text-[11px] text-gray-300 mt-2">
              {f >= 1000 ? `${f / 1000}k` : f}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Equalizer;