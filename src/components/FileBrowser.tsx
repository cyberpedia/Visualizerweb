import React, { useRef, useState } from "react";
import { usePlayerStore, Track } from "../state/store";
import { readTrackMeta } from "../utils/id3";
import { computeWaveform } from "../utils/waveform";
import { setAsset } from "../utils/db";

const audioExt = new Set(["mp3", "m4a", "aac", "wav", "ogg", "flac", "webm"]);

const FileBrowser: React.FC = () => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const addTracks = usePlayerStore((s) => s.addTracks);
  const addUrlTrack = usePlayerStore((s) => s.addUrlTrack);
  const [url, setUrl] = useState("");

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list: Track[] = [];
    for (const f of Array.from(files)) {
      const ext = f.name.split(".").pop()?.toLowerCase() || "";
      if (!audioExt.has(ext)) continue;
      const url = URL.createObjectURL(f);
      const meta = await readTrackMeta(f);
      const id = crypto.randomUUID();
      let waveform: Uint8Array | undefined = undefined;
      try {
        const wf = await computeWaveform(f, 1024);
        if (wf) {
          waveform = wf;
          // store in IndexedDB
          await setAsset(`waveform:${id}`, wf.buffer);
        }
      } catch {}
      list.push({
        id,
        name: meta.title || f.name,
        url,
        artist: meta.artist,
        album: meta.album,
        duration: meta.duration,
        artUrl: meta.artUrl || null,
        waveform,
        file: f
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

    const collectFromDir = async (dh: any) => {
      // recursively traverse directory entries
      for await (const [name, handle] of dh.entries()) {
        if (handle.kind === "file") {
          const ext = name.split(".").pop()?.toLowerCase() || "";
          if (!audioExt.has(ext)) continue;
          const file = await (handle as FileSystemFileHandle).getFile();
          const url = URL.createObjectURL(file);
          const meta = await readTrackMeta(file);
          const id = crypto.randomUUID();
          let waveform: Uint8Array | undefined = undefined;
          try {
            const wf = await computeWaveform(file, 1024);
            if (wf) {
              waveform = wf;
              await setAsset(`waveform:${id}`, wf.buffer);
            }
          } catch {}
          tracks.push({
            id,
            name: meta.title || file.name,
            url,
            artist: meta.artist,
            album: meta.album,
            duration: meta.duration,
            artUrl: meta.artUrl || null,
            waveform,
            file
          });
        } else if (handle.kind === "directory") {
          await collectFromDir(handle);
        }
      }
    };

    await collectFromDir(dirHandle);

    if (tracks.length) addTracks(tracks);
  };

  const addStreamUrl = () => {
    const u = url.trim();
    if (!u) return;
    try {
      new URL(u);
    } catch {
      alert("Invalid URL");
      return;
    }
    addUrlTrack(u);
    setUrl("");
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
      <input
        type="url"
        placeholder="https://example.com/stream.mp3"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs w-64"
        title="Add streaming audio URL"
      />
      <button
        className="px-3 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs"
        onClick={addStreamUrl}
        title="Add streaming URL"
      >
        Add URL
      </button>
    </div>
  );
};

export default FileBrowser;