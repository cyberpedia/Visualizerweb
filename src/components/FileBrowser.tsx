import React, { useRef } from "react";
import { usePlayerStore, Track } from "../state/store";
import { readTrackMeta } from "../utils/id3";

const audioExt = new Set(["mp3", "m4a", "aac", "wav", "ogg", "flac", "webm"]);

const FileBrowser: React.FC = () => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const addTracks = usePlayerStore((s) => s.addTracks);

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list: Track[] = [];
    for (const f of Array.from(files)) {
      const ext = f.name.split(".").pop()?.toLowerCase() || "";
      if (!audioExt.has(ext)) continue;
      const url = URL.createObjectURL(f);
      const meta = await readTrackMeta(f);
      list.push({
        id: crypto.randomUUID(),
        name: meta.title || f.name,
        url,
        artist: meta.artist,
        album: meta.album,
        duration: meta.duration,
        artUrl: meta.artUrl || null
      });
    }
    if (list.length) addTracks(list);
  };

  const pickDirectory = async () => {
    if (!("showDirectoryPicker" in window)) {
      alert("Directory picker not supported in this browser.");
      return;
    }
    // @ts-ignore
    const dirHandle: FileSystemDirectoryHandle = await window.showDirectoryPicker();
    const tracks: Track[] = [];
    for await (const [name, handle] of dirHandle.entries()) {
      if (handle.kind !== "file") continue;
      const ext = name.split(".").pop()?.toLowerCase() || "";
      if (!audioExt.has(ext)) continue;
      const file = await (handle as FileSystemFileHandle).getFile();
      const url = URL.createObjectURL(file);
      const meta = await readTrackMeta(file);
      tracks.push({
        id: crypto.randomUUID(),
        name: meta.title || file.name,
        url,
        artist: meta.artist,
        album: meta.album,
        duration: meta.duration,
        artUrl;
    }
    if (tracks.length) addTracks(tracks);
  };

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="audio/*"
        className="hidden"
        onChange={(e) => onFiles(e.target.files)}
      />
      <button
        className="px-3 py-1 rounded bg-brand-600 hover:bg-brand-500"
        onClick={() => inputRef.current?.click()}
      >
        Add Audio Files
      </button>
      <button
        className="px-3 py-1 rounded bg-gray-800 hover:bg-gray-700"
        onClick={pickDirectory}
      >
        Add from Folder
      </button>
    </div>
  );
};

export default FileBrowser;