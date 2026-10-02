"use client";

import { lazy, Suspense, useEffect, useState } from "react";

const CursorRippleShader = lazy(() => import("./CursorRippleShader"));

type Props = {
  imageUrl: string;
  alt: string;
  width: number;
  height: number;
};

// Until a real hand arrives, a phantom launch crosses the lake: synthetic window mousemoves that
// Shaders' own pointer tracking turns into a wake. No coordinates of ours ever reach the shader.
// ponytail: stops for good on the first trusted mouse/touch input; rAF already pauses in hidden tabs.
let handArrived = false;
const runPhantomWake = (figure: HTMLElement) => {
  if (handArrived) return () => {};
  let frame = 0;
  const start = performance.now();
  const tick = (now: number) => {
    // Ping-pong crossings of 1.8 s: CursorRipples answers pointer speed, so a slow drift would barely
    // mark the water, and a wrap-around jump would tear a straight streak across it.
    const phase = ((now - start) / 1800) % 2;
    const t = phase < 1 ? phase : 2 - phase;
    const r = figure.getBoundingClientRect();
    const x = r.left + r.width * (0.12 + 0.76 * t);
    const y = r.top + r.height * (0.74 + 0.07 * Math.sin(t * Math.PI * 2.4));
    window.dispatchEvent(new MouseEvent("mousemove", { clientX: x, clientY: y }));
    frame = requestAnimationFrame(tick);
  };
  const stop = (e: Event) => {
    if (!e.isTrusted) return;
    handArrived = true;
    cancelAnimationFrame(frame);
    window.removeEventListener("mousemove", stop);
    window.removeEventListener("touchstart", stop);
  };
  window.addEventListener("mousemove", stop);
  window.addEventListener("touchstart", stop, { passive: true });
  frame = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener("mousemove", stop);
    window.removeEventListener("touchstart", stop);
  };
};

export default function RippleMedia({ imageUrl, alt, width, height }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const [figure, setFigure] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      const on = "gpu" in navigator && !reduceMotion.matches;
      setEnabled(on);
      if (!on) setReady(false);
    };
    sync();
    reduceMotion.addEventListener("change", sync);
    return () => reduceMotion.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!ready || !figure) return;
    figure.closest("[data-ripple-region]")?.setAttribute("data-ripple-live", "");
    return runPhantomWake(figure);
  }, [ready, figure]);

  return (
    <figure ref={setFigure} className="cursor-ripple-media">
      <img
        className="cursor-ripple-media__fallback"
        src={imageUrl}
        alt={alt}
        width={width}
        height={height}
        fetchPriority="high"
      />
      {enabled ? (
        <Suspense fallback={null}>
          <CursorRippleShader imageUrl={imageUrl} ready={ready} onReady={() => setReady(true)} />
        </Suspense>
      ) : null}
    </figure>
  );
}
