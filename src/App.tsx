import React from "react";
import Playlist from "./components/Playlist";
import Player from "./components/Player";
import VisualizerCanvas from "./components/VisualizerCanvas";
import Equalizer from "./components/Equalizer";
import TemplateEditor from "./components/TemplateEditor";
import TemplateGallery from "./components/TemplateGallery";
import LayerEditor from "./components/LayerEditor";
import Exporter from "./components/Exporter";
import FileBrowser from "./components/FileBrowser";
import PWAInstallPrompt from "./components/PWAInstallPrompt";

export default function App() {
  return (
    <div className="h-full w-full flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800">
        <h1 className="text-lg font-semibold">Avee Web Player</h1>
        <div className="flex items-center gap-3">
         <<Exporter />
         <<PWAInstallPrompt />
         <sa
            href="https://cosine.sh"
            target="_blank"
            rel="noreferrer"
            className="text-sm text-gray-300 hover:text-white"
          >
            Built with Genie by Cosine
        </  a>
      </  div>
      </header>

      <main className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-0">
        <aside className="md:col-span-3 border-r md:border-gray-800 bg-gray-900/40">
          <div className="p-3">
            <FileBrowser />
          </div>
          <Playlist />
        </aside>

        <section className="md:col-span-6 bg-gradient-to-br from-gray-900 via-gray-950 to-black">
          <VisualizerCanvas />
          <Player />
        </section>

        <aside className="md:col-span-3 border-l md:border-gray-800 bg-gray-900/40">
          <div className="p-3 border-b border-gray-800">
            <Equalizer />
          </div>
          <TemplateEditor />
          <TemplateGallery />
          <LayerEditor />
        </aside>
      </main>
    </div>
  );
}