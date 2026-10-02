"use client";

import { Component, type ErrorInfo, type ReactNode, useEffect } from "react";
import {
  ChromaFlow,
  CursorRipples,
  DotGrid,
  FilmGrain,
  LinearGradient,
  Shader,
} from "shaders/react";

type ShaderBoundaryProps = { children: ReactNode };
type ShaderBoundaryState = { failed: boolean };

class ShaderBoundary extends Component<ShaderBoundaryProps, ShaderBoundaryState> {
  state: ShaderBoundaryState = { failed: false };

  static getDerivedStateFromError(): ShaderBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn("Cursor trail shader could not start.", error, info);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

// Idle "patch demo": until a real (trusted) mousemove arrives, sweep a figure-eight of synthetic
// window mousemove events across the open part of the hero so the trail is visible on arrival.
// The Shaders engine listens for window mousemove, so this drives the exact same graph.
// ponytail: stops for good on the first real pointer movement; runs only while the shader is mounted.
// The first real move also marks the region live, which fades the static halftone poster out.
let userTookOver = false;
const useIdlePatch = () => {
  useEffect(() => {
    const region = document.querySelector<HTMLElement>("[data-trail-region]");
    if (!region || userTookOver) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = (now - start) / 1000;
      const rect = region.getBoundingClientRect();
      const w = 0.6 * t;
      // Wide screens keep the loop right of the headline; narrow ones use the open band above it.
      const wide = rect.width > 760;
      const x = rect.left + rect.width * (wide ? 0.7 + 0.18 * Math.sin(w) : 0.5 + 0.3 * Math.sin(w));
      const y = rect.top + rect.height * (wide ? 0.4 + 0.17 * Math.sin(2 * w + 0.6) : 0.3 + 0.12 * Math.sin(2 * w + 0.6));
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: x, clientY: y }));
      frame = requestAnimationFrame(tick);
    };
    const stop = (event: MouseEvent) => {
      if (!event.isTrusted) return;
      userTookOver = true;
      region.dataset.trailLive = "";
      cancelAnimationFrame(frame);
      window.removeEventListener("mousemove", stop);
    };
    window.addEventListener("mousemove", stop);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("mousemove", stop);
    };
  }, []);
};

export default function CursorTrailShader() {
  useIdlePatch();
  return (
    <ShaderBoundary>
      <Shader className="cursor-trail-shader" disableTelemetry colorSpace="srgb">
        <DotGrid
          id="trailDots"
          density={40}
          dotSize={{
            type: "map",
            source: "trailFlow",
            channel: "alpha",
            inputMax: 1,
            inputMin: 0,
            outputMax: 1,
            outputMin: 0,
          }}
          twinkle={0.9}
          visible={false}
        />
        <ChromaFlow id="trailFlow" intensity={1.4} radius={2.9} visible={false} />
        <LinearGradient
          colorA="#1e1e1f"
          colorB="#070708"
          colorSpace="hsl"
          end={{ x: 1, y: 0 }}
          start={{ x: 0, y: 1 }}
        />
        <LinearGradient
          colorA="#000000"
          colorB="#ffffff"
          colorSpace="hsl"
          end={{ x: 1, y: 0 }}
          maskSource="trailDots"
          start={{ x: 0, y: 1 }}
        />
        <CursorRipples />
        <FilmGrain strength={0.1} />
      </Shader>
    </ShaderBoundary>
  );
}
