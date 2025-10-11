import React from "react";
import { usePlayerStore } from "../state/store";

const Playlist: React.FC = () => {
  const playlist = usePlayerStore((s) => s.playlist);
  const currentIndex = usePlayerStore((s) => s.currentIndex);
  const setCurrentIndex = usePlayerStore((s) => s.setCurrentIndex);
  const removeTrack = usePlayerStore((s) => s.removeTrack);
  const clearPlaylist = usePlayerStore((s) => s.clearPlaylist);
  const moveUp = usePlayerStore((s) => s.moveTrackUp);
  const moveDown = usePlayerStore((s) => s.moveTrackDown);

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold">Playlist</h2>
        <button
          className="text-xs text-gray-300 hover:text-white"
          onClick={() => clearPlaylist()}
        >
          Clear
        </button>
      </div>

      <div className="max-h-[60vh] overflow-y-auto scrollbar">
        {playlist.length === 0 && (
          <div className="text-sm text-gray-400">No tracks added.</div>
        )}
        <ul>
          {playlist.map((t, i) => (
            <li
              key={t.id}
              className={`px-2 py-2 rounded mb-1 flex items-center justify-between cursor-pointer ${
                i === currentIndex ? "bg-brand-700/40" : "hover:bg-gray-800/60"
              }`}
              onClick={() => setCurrentIndex(i)}
            >
              <div className="truncate">
                <div className="text-sm truncate">{t.name}</div>
                {t.artist && (
                  <div className="text-xs text-gray-400 truncate">{t.artist}</div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700"
                  onClick={(e) => {
                    e.stopPropagation();
                    moveUp(t.id);
                  }}
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700"
                  onClick={(e) => {
                    e.stopPropagation();
                    moveDown(t.id);
                  }}
                  title="Move down"
                >
                  ↓
                </button>
                <button
                  className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeTrack(t.id);
                  }}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default Playlist;