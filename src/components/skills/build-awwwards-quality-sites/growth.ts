// Illustrative confluence curves for the fictional Vell Halo benchmark (percent of well area).
// Shared by the build-time SVG path and the scrubbed readout, so both always agree.
const halo = (d: number) => 5 + 89 / (1 + Math.exp(-(d - 6.4) / 1.55));
const control = (d: number) => (d <= 4 ? halo(d) : 4 + (halo(4) - 4) * Math.exp(-(d - 4) * 0.45));

// Chart geometry (viewBox 0 0 640 360).
const X0 = 44;
const X1 = 628;
const Y0 = 326;
const Y1 = 14;
const x = (d: number) => X0 + (d / 14) * (X1 - X0);
const y = (c: number) => Y0 - (c / 100) * (Y0 - Y1);

const path = (f: (d: number) => number) => {
  const pts: string[] = [];
  for (let d = 0; d <= 14.001; d += 0.25) pts.push(`${x(d).toFixed(1)},${y(f(d)).toFixed(1)}`);
  return `M${pts.join('L')}`;
};

export { control, halo, path, x, X0, X1, y, Y0, Y1 };
