# Avee Web Player

A modern, browser-based implementation inspired by Avee Player. Built with React, Vite, Tailwind, Web Audio API, and optional WebGL. It supports rich visualizers, overlays, presets, and both realtime and offline exports.

Note: This is an original implementation using web standards (Web Audio, Canvas/WebGL, ffmpeg.wasm). It does not copy any proprietary assets, branding, or code from aveeplayer.com/app.

## Quick start

1) Install dependencies
```
npm install
```

2) Run the dev server
```
npm run dev
```

3) Open the app
Visit the URL printed in your terminal (usually http://localhost:5173).

## Features

Audio and playlist
- Local audio playback; multi-file and recursive folder import (File System Access API)
- Streaming URL tracks; M3U playlist import/export
- Playlist management: add, remove, move up/down; shuffle and repeat modes
- Audio metadata parsing and embedded album art extraction (music-metadata-browser)

DSP and controls
- 10‑band EQ (31 Hz → 16 kHz) with peaking filters
- Playback speed (0.5–2.0×), stereo pan, a dynamics compressor toggle
- Reverb (convolution) with wet mix toggle/slider
- Precomputed waveform per track for scrubber UI (cached in IndexedDB)

Visualizers and overlays
- Visualizers: Bars, Circle Spectrum, Waveform
- Renderer selector: Canvas 2D or WebGL
- Glow/bloom effect on GPU path with adjustable intensity
- Overlays: album art, title, and artist text (blend modes: source-over, lighter/add, multiply, screen)
- Advanced template layers: text, image, shape, progress ring, particles
- Per-layer blend modes (source-over, additive/lighter, multiply, screen) and masks (rect/circle/image/polygon) on Canvas/Offline paths; WebGL path supports additive and shader-based multiply/screen for overlays and layers with rect/circle/image masks (polygon masks for text/image via rasterized mask textures)
- WebGL per-layer filters (text, image, shape, progress ring): blur, hue-rotate, saturate, brightness, contrast. Filters are applied as offscreen passes and composited with the chosen blend mode or source-over.
- Mask transforms (WebGL): rect mask translation/scale via scissor; circle mask translation/scale for text/image layers; image/polygon masks support UV-space translation/scale and rotation for text and image layers (parity with Canvas/Offline).
- Keyframe timeline for animatable properties (x, y, opacity, size, rotation) with zoom (mouse wheel), markers, click-to-add, multi-select and group drag, copy/paste (with optional relative offsets), lane-aware snapping, invert selection, duplicate to markers, normalize lane values, and bezier easing per keyframe with both a dedicated editor and inline segment handle overlays (including on-curve handles). Alt+Drag selects by time+value in the current lane; Alt+Shift+Drag selects by time across all lanes.
- Template Gallery with defaults, user presets; template import/export (JSON)
- Editor grid overlay with configurable grid size (for alignment)

Beat detection and info
- Adaptive spectral flux beat detection and reactive visuals
- BPM estimation shown when overlay info is enabled

Background media
- Background image URL
- Background video: realtime rendering in Canvas2D/WebGL; offline export uses worker-side ffmpeg.wasm decode for deterministic compositing

Export
- Realtime export (WebM): CanvasCaptureMediaStream + WebAudio MediaStreamDestination + MediaRecorder
- Offline export (MP4/M4A): ffmpeg.wasm with deterministic frame rendering
- Audio-only export (M4A) via offline engine
- Export controls: resolution modes (Auto/720p/1080p/Custom), FPS (24/30/60), bitrate or CRF, pixel formats (yuv420p/yuv444p), codec selection (H.264/libx264, VP9/libvpx-vp9, HEVC/libx265)
- Expert encoder options: tune, profile, level; parallel workers 1–4
- Encoding presets manager: built-in presets (YouTube/TikTok/Instagram/Twitter + 4K/HDR-like variants), custom presets with notes/categories and JSON import/export
- Platform tips panel for recommended settings

Persistence and PWA
- Zustand persistence in localStorage (playlist index, volume, EQ, template, export settings)
- IndexedDB caching for waveforms and URL-based playlist persistence
- Responsive UI; PWA install prompt; icons/manifests

## Known limitations

- Realtime export is WebM only and best-supported in Chrome/Edge; on Safari/iOS the app automatically falls back to Offline export (MP4/M4A).
- Pixel format yuv444p with profile high444p has limited hardware decoder support on many devices; prefer yuv420p for broad compatibility.
- WebGL blend modes multiply and screen are implemented via shader compositing; most layer types are supported, but a few paths may still render with source-over where masks or effects are complex.
- Streaming URL metadata/art can be blocked by CORS depending on the source.
- Offline export with ffmpeg.wasm is CPU-intensive; using fewer parallel workers improves memory usage on low-end devices.

## Roadmap

The following are planned or partially implemented:

- Visual effects
  - Additional visualizer types and GPU variants (e.g., WebGL waveform/circle glow refinements)
  - More advanced layers (logos, particles with bursts and beat sync, richer masks and mask transforms)
  - SDF font atlas for faster high-quality text and kerning

- Export and performance
  - WebCodecs decoding path for background video in workers (where supported)
  - Configurable bloom radius/iterations; selective bloom masks
  - Segment-based parallel encoding; improved memory via SharedArrayBuffer and OffscreenCanvas throughout
  - Auto profile/level selection based on resolution/FPS and device guidance

- DSP and playback
  - Phase vocoder/WSOLA fidelity improvements; unify realtime/offline pitch/time where feasible
  - Loudness normalization (EBU R128), limiter/compressor presets expansion
  - Waveform caching and lazy-loading improvements for long tracks

- UX and data
  - IndexedDB library/playlist persistence beyond localStorage
  - Enhanced mobile gestures, drag-and-drop improvements
  - PWA offline caching, richer manifests and splash screens

If you’d like any specific feature prioritized, let me know and I’ll implement it.