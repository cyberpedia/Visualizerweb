import React, { useEffect, useRef } from "react";
import { usePlayerStore } from "../state/store";
import BarSpectrum from "../lib/visualizers/BarSpectrum";
import CircleSpectrum from "../lib/visualizers/CircleSpectrum";
import Waveform from "../lib/visualizers/Waveform";
import { drawOverlays } from "../lib/overlay";

const VisualizerCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const analyzer = usePlayerStore((s) => s.analyzer);
  const template = usePlayerStore((s) => s.visualizerTemplate);
  const currentTrack = usePlayerStore((s) => s.playlist[s.currentIndex] ?? null);
  const setCanvasEl = usePlayerStore((s) => s.setCanvasEl);
  const exportActive = usePlayerStore((s) => s.exportActive);
  const exportSettings = usePlayerStore((s) => s.exportSettings);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyzer) {
      // register canvas element for exporter anyway
      setCanvasEl(canvas || null);
      return;
    }

    setCanvasEl(canvas);

    const ctx = canvas.getContext("2d")!;
    let raf = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      let dpr = Math.max(1, window.devicePixelRatio || 1);
      let width = rect.width;
      let height = rect.height;

      if (exportActive) {
        dpr = 1; // export uses exact pixel size
        if (exportSettings.mode === "1080p") {
          width = 1920;
          height = 1080;
        } else if (exportSettings.mode === "720p") {
          width = 1280;
          height = 720;
        } else if (exportSettings.mode === "custom" && exportSettings.width && exportSettings.height) {
          width = exportSettings.width;
          height = exportSettings.height;
        }
      }

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const onResize = () => resize();
    window.addEventListener("resize", onResize);

    const freqArr = new Uint8Array(analyzer.frequencyBinCount);
    const timeArr = new Uint8Array(analyzer.fftSize);
    const prevArr = new Uint8Array(analyzer.frequencyBinCount);
    let pulse = 0;

    // cache background media for this effect lifecycle
    const bgImg = template.backgroundImageUrl ? new Image() : null;
    if (bgImg) {
      bgImg.src = template.backgroundImageUrl!;
    }
    const bgVideo = template.backgroundVideoUrl ? document.createElement("video") : null;
    if (bgVideo) {
      bgVideo.src = template.backgroundVideoUrl!;
      bgVideo.muted = true;
      // @ts-ignore - playsInline exists on HTMLVideoElement
      bgVideo.playsInline = true;
      bgVideo.loop = true;
      bgVideo.crossOrigin = "anonymous";
      bgVideo.autoplay = true;
      bgVideo.addEventListener("error", () => {
        // ignore errors
      });
      bgVideo.play().catch(() => {});
    }

    const draw = (t: number) => {
      analyzer.getByteFrequencyData(freqArr);
      analyzer.getByteTimeDomainData(timeArr);

      // simple spectral flux-based beat pulse
      let flux = 0;
      for (let i = 0; i < freqArr.length; i++) {
        const diff = freqArr[i] - prevArr[i];
        if (diff > 0) flux += diff;
        prevArr[i] = freqArr[i];
      }
      const threshold = 1500; // heuristic; can be made adaptive
      if (flux > threshold) {
        pulse = 1;
      } else {
        pulse *= 0.92;
      }

      // background media support
      const w = exportActive ? canvas.width : canvas.clientWidth;
      const h = exportActive ? canvas.height : canvas.clientHeight;
      if (bgVideo && bgVideolientHeight;
        ctx.drawImage(bgImg, 0, 0, w, h);
      }

      const vis =
        template.type === "bars"
          ? BarSpectrum
          : template.type === "circle"
          ? CircleSpectrum
          : Waveform;

      const drawW = exportActive ? canvas.width : canvas.clientWidth;
      const drawH = exportActive ? canvas.height : canvas.clientHeight;

      vis.draw({
        ctx,
        width: drawW,
        height: drawH,
        time: t,
        freq: freqArr,
        timeDomain: timeArr,
        template,
        beatPulse: pulse,
        trackInfo: {
          title: currentTrack?.name ?? "",
          artist: currentTrack?.artist ?? ""
        }
      });

      // overlays: album art and text
      drawOverlays(
        ctx,
        drawW,
        drawH,
        template,
        {
          title: currentTrack?.name ?? "",
          artist: currentTrack?.artist ?? "",
          artUrl: currentTrack?.artUrl || null
        }
      );

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [
    analyzer,
    template,
    currentTrack?.name,
    currentTrack?.artist,
    exportActive,
    exportSettings.mode,
    exportSettings.width,
    exportSettings.height
  ]);

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