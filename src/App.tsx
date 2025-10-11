import React, { useEffect } from "react";
import { usePlayerStore } from "./state/store";
import Playlist from "./components/Playlist";
import Player from "./components/Player";
import VisualizerCanvas from "./components/VisualizerCanvas";
import VisualizerGLCanvas from "./components/VisualizerGLCanvas";
import Equalizer from "./components/Equalizer";
import TemplateEditor from "./components/TemplateEditor";
import TemplateGallery from "./components/TemplateGallery";
import LayerEditor from "./components/LayerEditor";
import TimelineEditor from "./components/TimelineEditor";
import Exporter from "./components/Exporter";
import FileBrowser from "./components/FileBrowser";
import PWAInstallPrompt from "./components/PWAInstallPrompt";
import { loadPlaylist, savePlaylist } from "./utils/playlist";

export default function App() {
  const renderer = usePlayerStore((s) => s.visualizerTemplate.renderer ?? "canvas2d");
  const playlist = usePlayerStore((s) => s.playlist);
  const addUrlTrack = usePlayerStore((s) => s.addUrlTrack);

  // Load persisted playlist (http/https URLs only) on startup
  useEffect(() => {
    (async () => {
      const saved = await loadPlaylist();
      if (saved && saved.length) {
        for (const t of saved) {
          addUrlTrack(t.url);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist playlist (URLs only) when it changes
  useEffect(() => {
    const toSave = playlist
      .filter((t) => {
        try {
          const u = new URL(t.url);
          return u.protocol === "http:" || u.protocol === "https:";
        } catch {
          return false;
        }
      })
      .map((t) => ({
        name: t.name,
        url: t.url,
        artist: t.artist,
        album: t.album,
        duration: t.duration,
        artUrl: t.artUrl || null
      }));
    savePlaylist(toSave).catch(() => {});
  }, [playlist]);

  return (
    <div className="h-full w-full flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800">
        <h1 className="text-lg font-semibold">Avee Web Player</h1>
        <div className="flex items-center gap-3">
          <Exporter />
          <PWAInstallPrompt />
          <a
            href="https://cosine.sh"
            target="_blank"
            rel="noreferrer"
            className="text-sm text-gray-300 hover:text-white"
          >
            Built with Genie by Cosine
          </a>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-0">
        <aside className="md:col-span-3 border-r md:border-gray-800 bg-gray-900/40">
          <div className="p-3">
            <FileBrowser />
          </div>
          <Playlist />
        </aside>

        <section className="md:col-span-6 bg-gradient-to-br from-gray-900 via-gray-950 to-black">
          {renderer === "webgl" ? <VisualizerGLCanvas /> : <VisualizerCanvas />}
          <Player />
        </section>

        <aside className="md:col-span-3 border-l md:border-gray-800 bg-gray-900/40">
          <div className="p-3 border-b border-gray-800">
            <Equalizer />
          </div>
          <TemplateEditor />
          <TemplateGallery />
          <LayerEditor />
          <TimelineEditor />
        </aside>
      </main>
    </div>
  );
}