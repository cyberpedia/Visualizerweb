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

export type TemplateConfig = {
  type: VisualizerType;
  color1: string;
  color2: string;
  background?: string | null;
  backgroundImageUrl?: string | null;
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
};

export type ExportSettings = {
  mode: "auto" | "1080p" | "720p" | "custom";
  width?: number;
  height?: number;
  fps: number;
  bitrate: number; // bits per second
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
  setCanvasEl: (el: HTMLCanvasElement | null) => void;
  setExportActive: (v: boolean) => void;
  setExportSettings: (s: Partial<ExportSettings>) => void;
  next: () => void;
  prev: () => void;
};

const DEFAULT_TEMPLATE: TemplateConfig = {
  type: "bars",
  color1: "#6366f1",
  color2: "#22d3ee",
  background: "#0b1020",
  backgroundImageUrl: null,
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
  }
};

const DEFAULT_EXPORT: ExportSettings = {
  mode: "auto",
  fps: 30,
  bitrate: 4_000_000
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
      setCanvasEl: (el) => set(() => ({ canvasEl: el })),
      setExportActive: (v) => set(() => ({ exportActive: v })),
      setExportSettings: (patch) =>
        set((s) => ({ exportSettings: { ...s.exportSettings, ...patch } })),
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
        exportSettings: s.exportSettings
      })
    }
  )
);