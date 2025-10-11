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
- Playback speed (0.5–2.0×), stereo pan, and a dynamics compressor toggle
- Precomputed waveform per track for scrubber UI (cached in IndexedDB)

Visualizers and overlays
- Visualizers: Bars, Circle Spectrum, Waveform
- Renderer selector: Canvas 2D or WebGL
- Glow/bloom effect on GPU path with adjustable intensity
- Overlays: album art, title, and artist text
- Advanced template layers: text, image, shape, progress ring, particles
- Keyframe timeline for animatable properties (x, y, opacity, size, rotation)
- Template Gallery with defaults, user presets; template import/export (JSON)

Beat detection and info
- Adaptive spectral flux beat detection and reactive visuals
- BPM estimation shown when overlay info is enabled

Background media
- Background image URL
- Background video (offline export): worker-side ffmpeg.wasm decode to frames for deterministic compositing

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
- IndexedDB caching for waveforms
- Responsive UI; PWA install prompt; icons/manifests

## Known limitations

- Realtime export is WebM only and best-supported in Chrome/Edge; Safari/iOS should use Offline export (MP4/M4A).
- yuv444p and high444p profile have limited hardware decoder support on many devices.
- Background video in realtime renderer is not composited; offline export path handles background video deterministically.
- Reverb and advanced DSP (BPM stabilization, phase-vocoder quality) are not yet implemented.

## Roadmap

The following are planned or partially implemented:

- Visual effects
  - Additional visualizer types and GPU variants (e.g., WebGL waveform/circle glow refinements)
  - More advanced layers (masks, logos, particles with bursts and beat sync)
  - SDF font atlas for faster high-quality text and kerning

- Export and performance
  - WebCodecs decoding path for background video in workers (where supported)
  - Configurable bloom radius/iterations; selective bloom masks
  - Segment-based parallel encoding; improved memory via SharedArrayBuffer and OffscreenCanvas throughout
  - Codec presets for streaming platforms, CRF/bitrate guidance, and auto profile/level selection

- DSP and playback
  - High-quality pitch/time processing (phase vocoder/WSOLA improvements), BPM stabilization
  - Reverb and additional effects
  - Precomputed waveforms for long tracks with efficient IndexedDB lazy-loading

- UX and data
  - IndexedDB library/playlist persistence beyond localStorage
  - Enhanced mobile gestures, drag-and-drop improvements
  - PWA offline caching, richer manifests and splash screens

If you’d like any specific feature prioritized, let me know and I’ll implement it.