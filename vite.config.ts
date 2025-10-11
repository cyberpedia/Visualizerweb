import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import coi from "vite-plugin-coi";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico"],
      manifest: {
        name: "Avee Web Player",
        short_name: "Avee Web",
        description: "A modern web version of Avee Player with visualizers and export.",
        theme_color: "#111827",
        background_color: "#0b1020",
        display: "standalone",
        icons: [
          {
            src: "https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/spotify.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any"
          },
          {
            src: "https://raw.githubusercontent.com/primer/octicons/main/icons/play-24.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "maskable"
          }
        ]
      }
    }),
    coi()
  ],
  server: {
    port: 5173
  }
});