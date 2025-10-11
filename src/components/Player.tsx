import React, { useEffect, useRef, useState } from "react";
import { audioEngine } from "../lib/audio";
import { usePlayerStore } from "../state/store";

const Player: React.FC = () => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playlist = usePlayerStore((s) => s.playlist);
  const currentIndex = usePlayerStore((s) => s.currentIndex);
  const setAnalyzer = usePlayerStore((s) => s.setAnalyzer);
  const playing = usePlayerStore((s) => s.playing);
  const setPlaying = usePlayerStore((s) => s.setPlaying);
  const volume = usePlayerStore((s) => s.volume);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const eqGains = usePlayerStore((s) => s.eqGains);
  const next = usePlayerStore((s) => s.next);
  const prev = usePlayerStore((s) => s.prev);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const repeat = usePlayerStore((s) => s.repeat);
  const setRepeat = usePlayerStore((s) => s.setRepeat);

  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  // Initialize audio engine
  useEffect(() => {
    const el = audioRef.current!;
    audioEngine.attachAudioElement(el);
    setAnalyzer(audioEngine.getAnalyzer());
    audioEngine.setVolume(volume);
  }, []);

  // Track change with simple crossfade
  useEffect(() => {
    const el = audioRef.current!;
    const track = playlist[currentIndex];
    if (!el || !track) return;

    // MediaSession metadata
    if ("mediaSession" in navigator) {
      try {
        (navigator as any).mediaSession.metadata = new (window as any).MediaMetadata({
          title: track.name,
          artist: track.artist || "",
          album: track.album || "",
          artwork: track.artUrl ? [{ src: track.artUrl, sizes: "512x512", type: "image/png" }] : undefined
        });
        (navigator as any).mediaSession.setActionHandler("play", () => setPlaying(true));
        (navigator as any).mediaSession.setActionHandler("pause", () => setPlaying(false));
        (navigator as any).mediaSession.setActionHandler("nexttrack", () => next());
        (navigator as any).mediaSession.setActionHandler("previoustrack", () => prev());
      } catch {}
    }

    // fade out current audio quickly
    audioEngine.fadeTo(0.25, 0);

    const switchTrack = async () => {
      el.src = track.url;
      el.currentTime = 0;
      try {
        await el.play();
        setPlaying(true);
        audioEngine.resume();
        // fade in to target volume
        audioEngine.fadeTo(0.35, volume);
      } catch {
        setPlaying(false);
      }
    };

    // allow fade-out before switching
    const id = setTimeout(() => switchTrack(), 240);
    return () => clearTimeout(id);
  }, [playlist, currentIndex]);

  // Playback state
  useEffect(() => {
    const el = audioRef.current!;
    if (!el) return;
    if (playing) el.play().catch(() => {});
    else el.pause();
  }, [playing]);

  // Volume
  useEffect(() => {
    audioEngine.setVolume(volume);
  }, [volume]);

  // Equalizer
  useEffect(() => {
    eqGains.forEach((db, i) => audioEngine.setEqGain(i, db));
  }, [eqGains]);

  // Progress tracking
  useEffect(() => {
    const el = audioRef.current!;
    if (!el) return;
    const onTime = () => setProgress(el.currentTime);
    const onLoaded = () => setDuration(el.duration || 0);
    const onEnded = () => next();

    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onLoaded);
    el.addEventListener("ended", onEnded);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onLoaded);
      el.removeEventListener("ended", onEnded);
    };
  }, [next]);

  const fmt = (s: number) => {
    if (!s || !isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const onSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = audioRef.current!;
    if (!el || !duration) return;
    const v = Number(e.target.value);
    el.currentTime = v;
    setProgress(v);
  };

  return (
    <div className="border-t border-gray-800 bg-gray-900/60 px-3 py-2">
      <audio ref={audioRef} crossOrigin="anonymous" />
      <div className="flex items-center gap-3">
        <button
          className="px-3 py-1 rounded bg-brand-600 hover:bg-brand-500 active:scale-[0.98]"
          onClick={() => {
            audioEngine.resume();
            setPlaying(!playing);
          }}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <button className="px-3 py-1 rounded bg-gray-800 hover:bg-gray-700" onClick={prev}>
          Prev
        </button>
        <button className="px-3 py-1 rounded bg-gray-800 hover:bg-gray-700" onClick={next}>
          Next
        </button>

        <div className="flex items-center gap-2">
          <button
            className={`px-2 py-1 rounded text-xs ${shuffle ? "bg-brand-700" : "bg-gray-800 hover:bg-gray-700"}`}
            onClick={() => toggleShuffle()}
            title="Shuffle"
          >
            Shuffle
          </button>
          <select
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value as any)}
            title="Repeat mode"
          >
            <option value="off">Repeat Off</option>
            <option value="one">Repeat One</option>
            <option value="all">Repeat All</option>
          </select>
        </div>

        <div className="flex items-center gap-2 flex-1">
          <span className="text-xs text-gray-300">{fmt(progress)}</span>
          <input
            type="range"
            min={0}
            max={duration || 0}
            value={progress}
            onChange={onSeek}
            className="flex-1 accent-brand-500"
          />
          <span className="text-xs text-gray-300">{fmt(duration)}</span>
        </div>

        <div className="flex items-center gap-2 w-48">
          <span className="text-xs text-gray-300">Vol</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="flex-1 accent-brand-500"
          />
        </div>
      </div>
    </div>
  );
};

export default Player;