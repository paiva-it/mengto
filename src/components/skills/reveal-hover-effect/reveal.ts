// Cursor-following spotlight reveal (reveal-hover-effect skill): one rAF loop per component,
// CSS custom properties only, stops when settled, collapses on exit/cancel/blur.

type Options = {
  /** Element whose CSS vars drive the mask (the figure). Defaults to root. */
  target?: HTMLElement;
  /** Optional grid layer that drifts ±16px with the eased pointer. */
  grid?: HTMLElement | null;
};

type RevealHandle = { cleanup: () => void; park: (x: number, y: number, radius?: number) => void };

const initRevealHover = (root: HTMLElement, { target = root, grid = null }: Options = {}): RevealHandle => {
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const noop: RevealHandle = { cleanup: () => {}, park: () => {} };
  if (!target.querySelector('.reveal-hover__image--overlay') || !finePointer.matches) return noop;

  const s = {
    x: 0, y: 0, targetX: 0, targetY: 0,
    radius: 0, targetRadius: 0,
    gx: 0, gy: 0,
    clientX: 0, clientY: 0,
    inside: false, frame: 0,
  };

  const getRadius = () => {
    const requested = Number.parseFloat(target.dataset.revealRadius ?? '');
    if (Number.isFinite(requested)) return requested;
    return Math.min(260, Math.max(140, target.clientWidth * 0.22));
  };

  const updateTarget = (clientX: number, clientY: number) => {
    const rect = target.getBoundingClientRect();
    s.clientX = clientX;
    s.clientY = clientY;
    s.targetX = clientX - rect.left;
    s.targetY = clientY - rect.top;
  };

  const schedule = () => {
    if (!s.frame) s.frame = requestAnimationFrame(tick);
  };

  const tick = () => {
    s.frame = 0;
    const reduced = reduceMotion.matches;
    const positionEase = reduced ? 1 : 0.1;
    const radiusEase = reduced ? 1 : 0.14;

    s.x += (s.targetX - s.x) * positionEase;
    s.y += (s.targetY - s.y) * positionEase;
    s.radius += (s.targetRadius - s.radius) * radiusEase;

    target.style.setProperty('--reveal-x', `${s.x.toFixed(2)}px`);
    target.style.setProperty('--reveal-y', `${s.y.toFixed(2)}px`);
    target.style.setProperty('--reveal-radius', `${s.radius.toFixed(2)}px`);

    let gridUnsettled = false;
    if (grid) {
      // Normalised around the component centre, limited to ±16px, slower than the reveal.
      const w = target.clientWidth || 1;
      const h = target.clientHeight || 1;
      const nx = s.inside && !reduced ? (s.x / w - 0.5) * 2 : 0;
      const ny = s.inside && !reduced ? (s.y / h - 0.5) * 2 : 0;
      const tx = Math.max(-1, Math.min(1, nx)) * -16;
      const ty = Math.max(-1, Math.min(1, ny)) * -16;
      const ge = reduced ? 1 : 0.06;
      s.gx += (tx - s.gx) * ge;
      s.gy += (ty - s.gy) * ge;
      grid.style.transform = `translate3d(${s.gx.toFixed(2)}px, ${s.gy.toFixed(2)}px, 0)`;
      gridUnsettled = Math.abs(tx - s.gx) > 0.05 || Math.abs(ty - s.gy) > 0.05;
    }

    const unsettled =
      Math.abs(s.targetX - s.x) > 0.1 ||
      Math.abs(s.targetY - s.y) > 0.1 ||
      Math.abs(s.targetRadius - s.radius) > 0.1 ||
      gridUnsettled;
    if (unsettled) schedule();
  };

  const enterAt = (clientX: number, clientY: number) => {
    s.inside = true;
    updateTarget(clientX, clientY);
    // Begin under the pointer, never sweep in from the previous spot.
    if (s.radius < 0.5) {
      s.x = s.targetX;
      s.y = s.targetY;
    }
    s.targetRadius = getRadius();
    schedule();
  };

  const onPointerEnter = (e: PointerEvent) => enterAt(e.clientX, e.clientY);
  const onPointerMove = (e: PointerEvent) => {
    // The page may load under a stationary cursor: first move can arrive without an enter.
    if (!s.inside) return enterAt(e.clientX, e.clientY);
    updateTarget(e.clientX, e.clientY);
    schedule();
  };
  const hideReveal = () => {
    s.inside = false;
    s.targetRadius = 0;
    schedule();
  };
  const onViewportChange = () => {
    if (!s.inside) return;
    updateTarget(s.clientX, s.clientY);
    s.targetRadius = getRadius();
    schedule();
  };

  root.addEventListener('pointerenter', onPointerEnter);
  root.addEventListener('pointermove', onPointerMove);
  root.addEventListener('pointerleave', hideReveal);
  root.addEventListener('pointercancel', hideReveal);
  window.addEventListener('blur', hideReveal);
  window.addEventListener('scroll', onViewportChange, { passive: true });
  const ro = new ResizeObserver(onViewportChange);
  ro.observe(target);

  return {
    // Capture mode only: hold the spotlight at a local point as if a cursor rested there.
    park: (x, y, radius = getRadius()) => {
      const rect = target.getBoundingClientRect();
      enterAt(rect.left + x, rect.top + y);
      s.targetRadius = radius;
    },
    cleanup: () => {
      if (s.frame) cancelAnimationFrame(s.frame);
      ro.disconnect();
      root.removeEventListener('pointerenter', onPointerEnter);
      root.removeEventListener('pointermove', onPointerMove);
      root.removeEventListener('pointerleave', hideReveal);
      root.removeEventListener('pointercancel', hideReveal);
      window.removeEventListener('blur', hideReveal);
      window.removeEventListener('scroll', onViewportChange);
    },
  };
};

export { initRevealHover };
export type { RevealHandle };
