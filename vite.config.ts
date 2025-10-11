import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

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
        icons: []
      }
    })
  ],
  server: {
    port: 5173
  }
});