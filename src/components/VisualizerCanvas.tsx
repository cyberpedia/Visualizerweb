import React, { useEffect, useRef } from "react";
import { usePlayerStore } from "../state/store";
import BarSpectrum from "../lib/visualizers/BarSpectrum";
import CircleSpectrum from "../lib/visualizers/CircleSpectrum";
import Waveform from "../lib/visualizers/Waveform";
import { audioEngine } from "../lib/audio";

const VisualizerCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const analyzer = usePlayerStore((s) => s.analyzer);
  const template = usePlayerStore((s) => s.visualizerTemplate);
  const currentTrack = usePlayerStore((s) => s.playlist[s.currentIndex] ?? null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyzer) return;

    const ctx = canvas.getContext("2d")!;
    let raf = 0;

    const resize = () => {
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const onResize = () => resize();
    window.addEventListener("resize", onResize);

    const freqArr = new Uint8Array(analyzer.frequencyBinCount);
    const timeArr = new Uint8Array(analyzer.fftSize);

    const draw = (t: number) => {
      analyzer.getByteFrequencyData(freqArr);
      analyzer.getByteTimeDomainData(timeArr);

      const vis =
        template.type === "bars"
          ? BarSpectrum
          : template.type === "circle"
          ? CircleSpectrum
          : Waveform;

      vis.draw({
        ctx,
        width: canvas.clientWidth,
        height: canvas.clientHeight,
        time: t,
        freq: freqArr,
        timeDomain: timeArr,
        template,
        trackInfo: {
          title: currentTrack?.name ?? "",
          artist: currentTrack?.artist ?? ""
        }
      });

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [analyzer, template, currentTrack?.name, currentTrack?.artist]);

  return (
    <div className="canvas-container h-[55vh] md:h-[60vh] lg:h-[65vh] xl:h-[70vh]">
      <canvas ref={canvasRef} className="w-full h-full block" />
      <div className="canvas-overlay"></div>
      <div className="absolute bottom-3 left-3 text-sm text-gray-300/80">
        {currentTrack ? currentTrack.name : "No track selected"}
      </div>
    </div>
  );
};

export default VisualizerCanvas;