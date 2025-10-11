import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Track = {
  id: string;
  name: string;
  url: string;
  artist?: string;
  album?: string;
  duration?: number;
  artUrl?: string | null;
  file?: File; // original file reference for offline export
};

export type VisualizerType = "bars" | "circle" | "waveform";

export type TitleOverlay = {
  show: boolean;
  color: string;
  size: number; // px
  x: number; // px
  y: number; // px from top
  align: "left" | "center" | "right";
};

export type ArtistOverlay = {
  show: boolean;
  color: string;
  size: number; // px
  x: number;
  y: number;
  align: "left" | "center" | "right";
};

export type Easing = "linear" | "easeIn" | "easeOut" | "easeInOut";
export type KeyframeNumber = { time: number; value: number; easing?: Easing };

export type BaseLayer = {
  id: string;
  type: "text" | "image" | "shape" | "progressRing" | "particles";
  visible: boolean;
  zIndex: number;
  x: number;
  y: number;
  opacity: number;
  kf?: {
    x?: KeyframeNumber[];
    y?: KeyframeNumber[];
    opacity?: KeyframeNumber[];
    size?: KeyframeNumber[];
    rotation?: KeyframeNumber[];
  };
};

export type TextLayer = BaseLayer & {
  type: "text";
  text: string;
  color: string;
  size: number;
  align: "left" | "center" | "right";
};

export type ImageLayer = BaseLayer & {
  type: "image";
  src: string;
  width: number;
  height: number;
  clipCircle?: boolean;
};

export type ShapeLayer = BaseLayer & {
  type: "shape";
  shape: "rect" | "circle";
  width?: number;
  height?: number;
  radius?: number;
  fillColor: string;
  strokeColor?: string;
  strokeWidth?: number;
};

export type ProgressRingLayer = BaseLayer & {
  type: "progressRing";
  radius: number;
  thickness: number;
  color1: string;
  color2: string;
};

export type ParticlesLayer = BaseLayer & {
  type: "particles";
  count: number;
  size: number;
  speed: number;
  color: string;
};

export type Layer = TextLayer | ImageLayer | ShapeLayer | ProgressRingLayer | ParticlesLayer;

export type TemplateConfig = {
  type: VisualizerType;
  color1: string;
  color2: string;
  background?: string | null;
  backgroundImageUrl?: string | null;
  backgroundVideoUrl?: string | null;
  glowStrength?: number; // shadow blur intensity
  showInfo?: boolean;
  showAlbumArt?: boolean;
  albumArtSize?: number; // px
  barCount?: number;
  circle?: {
    radius: number;
    thickness: number;
    gap: number;
  };
  waveform?: {
    thickness: number;
  };
  titleOverlay?: TitleOverlay;
  artistOverlay?: ArtistOverlay;
  layers?: Layer[];
};

export type ExportSettings = {
  mode: "auto" | "1080p" | "720p" | "custom";
  width?: number;
  height?: number;
  fps: number;
  bitrate: number; // bits per second (used when CRF unset)
  engine?: "realtime" | "offline"; // realtime MediaRecorder(WebM) or offline ffmpeg.wasm(MP4)
  // Encoding options (offline engine)
  forceCrf?: boolean;
  crf?: number; // 0..51, lower = higher quality
  preset?: "ultrafast" | "superfast" | "veryfast" | "faster" | "fast" | "medium" | "slow";
  audioBitrateKbps?: number; // e.g., 192
  pixelFormat?: "yuv420p" | "yuv444p";
  parallelWorkers?: number; // number of workers for offline render (1..4)
  encodeProfile?: "fast" | "balanced" | "high";
  // Expert options
  tune?: "film" | "animation" | "grain" | "stillimage" | "psnr" | "ssim" | "fastdecode" | "zerolatency";
  profile?: "baseline" | "main" | "high" | "high444p";
  level?: "3.0" | "3.1" | "4.0" | "4.1" | "5.0" | "5.1" | "5.2";
};

export type ExportPreset = {
  id: string;
  name: string;
  settings: Partial<ExportSettings>;
};

type PlayerState = {
  playlist: Track[];
  currentIndex: number;
  playing: boolean;
  volume: number; // 0..1
  eqGains: number[]; // length 10
  visualizerTemplate: TemplateConfig;
  analyzer: AnalyserNode | null;

  // canvas + export
  canvasEl: HTMLCanvasElement | null;
  exportActive: boolean;
  exportSettings: ExportSettings;
  exportPresets: ExportPreset[];

  // actions
  addTracks: (tracks: Track[]) => void;
  removeTrack: (id: string) => void;
  clearPlaylist: () => void;
  setCurrentIndex: (idx: number) => void;
  setPlaying: (p: boolean) => void;
  setVolume: (v: number) => void;
  setEqGain: (band: number, db: number) => void;
  setAnalyzer: (an: AnalyserNode | null) => void;
  setTemplate: (t: Partial<TemplateConfig>) => void;
  addLayer: (layer: Layer) => void;
  updateLayer: (id: string, patch: Partial<Layer>) => void;
  removeLayer: (id: string) => void;
  setCanvasEl: (el: HTMLCanvasElement | null) => void;
  setExportActive: (v: boolean) => void;
  setExportSettings: (s: Partial<ExportSettings>) => void;
  addExportPreset: (name: string, settings: Partial<ExportSettings>) => void;
  removeExportPreset: (id: string) => void;
  renameExportPreset: (id: string, name: string) => void;
  applyExportPreset: (id: string) => void;
  next: () => void;
  prev: () => void;
};

const DEFAULT_TEMPLATE: TemplateConfig = {
  type: "bars",
  color1: "#6366f1",
  color2: "#22d3ee",
  background: "#0b1020",
  backgroundImageUrl: null,
  backgroundVideoUrl: null,
  glowStrength: 0,
  showInfo: true,
  showAlbumArt: true,
  albumArtSize: 96,
  barCount: 64,
  circle: { radius: 160, thickness: 8, gap: 2 },
  waveform: { thickness: 2 },
  titleOverlay: {
    show: true,
    color: "#ffffff",
    size: 16,
    x: 20,
    y: 30,
    align: "left"
  },
  artistOverlay: {
    show: true,
    color: "#cbd5e1",
    size: 13,
    x: 20,
    y: 50,
    align: "left"
  },
  layers: []
};

const DEFAULT_EXPORT: ExportSettings = {
  mode: "auto",
  fps: 30,
  bitrate: 4_000_000,
  engine: "realtime",
  forceCrf: false,
  crf: 23,
  preset: "veryfast",
  audioBitrateKbps: 192,
  pixelFormat: "yuv420p",
  parallelWorkers: 2,
  encodeProfile: "balanced",
  tune: undefined,
  profile: undefined,
  level: undefined
};

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      playlist: [],
      currentIndex: -1,
      playing: false,
      volume: 1,
      eqGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      visualizerTemplate: DEFAULT_TEMPLATE,
      analyzer: null,

      canvasEl: null,
      exportActive: false,
      exportSettings: DEFAULT_EXPORT,
      exportPresets: [],

      addTracks: (tracks) =>
        set((s) => ({
          playlist: [...s.playlist, ...tracks],
          currentIndex: s.currentIndex === -1 ? 0 : s.currentIndex
        })),
      removeTrack: (id) =>
        set((s) => ({
          playlist: s.playlist.filter((t) => t.id !== id)
        })),
      clearPlaylist: () =>
        set(() => ({
          playlist: [],
          currentIndex: -1,
          playing: false
        })),
      setCurrentIndex: (idx) => set(() => ({ currentIndex: idx })),
      setPlaying: (p) => set(() => ({ playing: p })),
      setVolume: (v) => set(() => ({ volume: Math.min(1, Math.max(0, v)) })),
      setEqGain: (band, db) =>
        set((s) => {
          const next = s.eqGains.slice();
          if (band >= 0 && band < next.length) next[band] = db;
          return { eqGains: next };
        }),
      setAnalyzer: (an) => set(() => ({ analyzer: an })),
      setTemplate: (t) =>
        set((s) => ({ visualizerTemplate: { ...s.visualizerTemplate, ...t } })),
      addLayer: (layer) =>
        set((s) => ({
          visualizerTemplate: {
            ...s.visualizerTemplate,
            layers: [...(s.visualizerTemplate.layers ?? []), layer]
          }
        })),
      updateLayer: (id, patch) =>
        set((s) => ({
          visualizerTemplate: {
            ...s.visualizerTemplate,
            layers: (s.visualizerTemplate.layers ?? []).map((l) =>
              l.id === id ? { ...l, ...patch } : l
            )
          }
        })),
      removeLayer: (id) =>
        set((s) => ({
          visualizerTemplate: {
            ...s.visualizerTemplate,
            layers: (s.visualizerTemplate.layers ?? []).filter((l) => l.id !== id)
          }
        })),
      setCanvasEl: (el) => set(() => ({ canvasEl: el })),
      setExportActive: (v) => set(() => ({ exportActive: v })),
      setExportSettings: (patch) =>
        set((s) => ({ exportSettings: { ...s.exportSettings, ...patch } })),
      addExportPreset: (name, settings) =>
        set((s) => ({
          exportPresets: [
            ...s.exportPresets,
            { id: crypto.randomUUID(), name, settings }
          ]
        })),
      removeExportPreset: (id) =>
        set((s) => ({
          exportPresets: s.exportPresets.filter((p) => p.id !== id)
        })),
      renameExportPreset: (id, name) =>
        set((s) => ({
          exportPresets: s.exportPresets.map((p) =>
            p.id === id ? { ...p, name } : p
          )
        })),
      applyExportPreset: (id) =>
        set((s) => {
          const p = s.exportPresets.find((pp) => pp.id === id);
          return p ? { exportSettings: { ...s.exportSettings, ...p.settings } } : {};
        }),
      next: () => {
        const { playlist, currentIndex } = get();
        if (playlist.length === 0) return;
        const nextIdx = (currentIndex + 1) % playlist.length;
        set(() => ({ currentIndex: nextIdx }));
      },
      prev: () => {
        const { playlist, currentIndex } = get();
        if (playlist.length === 0) return;
        const prevIdx = (currentIndex - 1 + playlist.length) % playlist.length;
        set(() => ({ currentIndex: prevIdx }));
      }
    }),
    {
      name: "avee-web",
      partialize: (s) => ({
        playlist: s.playlist,
        currentIndex: s.currentIndex,
        volume: s.volume,
        eqGains: s.eqGains,
        visualizerTemplate: s.visualizerTemplate,
        exportSettings: s.exportSettings,
        exportPresets: s.exportPresets
      })
    }
  )
);