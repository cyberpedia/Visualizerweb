# Avee Web Player

A modern, browser-based implementation inspired by Avee Player. It lets you:
- Play local audio files and build playlists
- See real-time visualizers (bars, circle spectrum, waveform)
- Customize visualizer templates (colors, bar count, circle radius/thickness, waveform thickness, overlay info)
- Adjust a 10‑band equalizer
- Export the visualizer + audio to a WebM video (Chromium-based browsers)

Note: This is an original implementation using the Web Audio API and Canvas. It does not copy any proprietary assets, branding, or code from aveeplayer.com/app.

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

## Features and notes

- Audio formats supported depend on the browser (mp3, m4a/aac, ogg, wav, etc.).
- The equalizer uses peaking BiquadFilter nodes at: 31, 62, 125, 250, 500, 1k, 2k, 4k, 8k, 16k Hz.
- Visualizers:
  - Bars: configurable bar count and colors
  - Circle spectrum: radial bars around a configurable radius
  - Waveform: line plot of the time-domain signal
- Export:
  - Uses CanvasCaptureMediaStream + WebAudio MediaStreamDestination + MediaRecorder
  - Produces a .webm file with VP9/Opus by default (best in Chrome/Edge)
  - Start playback before exporting

## Roadmap

To reach full feature parity with Avee Player, we can iterate to add:
- More visualizer templates and elements (images, text overlays, masks, particles)
- Template import/export (JSON), sharing, and a template gallery
- Beat detection and reactive effects
- Advanced video export controls (resolution, fps, bitrate), background images/video
- Playlist persistence (IndexedDB), folder scanning with the File System Access API
- Mobile-friendly controls and PWA install prompt
- Streaming sources (URLs) and crossfade
- DSP effects: reverb, compressor, stereo enhancements

If you'd like any specific feature prioritized, let me know and I’ll implement it.