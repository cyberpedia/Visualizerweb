import { create } from "zustand";

export type Track = {
  id: string;
  name: string;
  url: string;
  artist?: string;
  album?: string;
  duration?: number;
};

export type VisualizerType = "bars" | "circle" | "waveform";

export type TemplateConfig = {
  type: VisualizerType;
  color1: string;
  color2: string;
  background?: string | null;
  showInfo?: boolean;
  barCount?: number;
  circle?: {
    radius: number;
    thickness: number;
    gap: number;
  };
  waveform?: {
    thickness: number;
  };
};

type PlayerState = {
  playlist: Track[];
  currentIndex: number;
  playing: boolean;
  volume: number; // 0..1
  eqGains: number[]; // length 10
  visualizerTemplate: TemplateConfig;
  analyzer: AnalyserNode | null;

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
  next: () => void;
  prev: () => void;
};

const DEFAULT_TEMPLATE: TemplateConfig = {
  type: "bars",
  color1: "#6366f1",
  color2: "#22d3ee",
  background: null,
  showInfo: true,
  barCount: 64,
  circle: { radius: 160, thickness: 8, gap: 2 },
  waveform: { thickness: 2 }
};

export const usePlayerStore = create<PlayerState>((set, get) => ({
  playlist: [],
  currentIndex: -1,
  playing: false,
  volume: 1,
  eqGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  visualizerTemplate: DEFAULT_TEMPLATE,
  analyzer: null,

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
}));