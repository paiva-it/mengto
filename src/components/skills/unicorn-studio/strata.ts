// Tel Varesh, Area C: the 18 horizons the radar resolves, and the four buried targets it keeps returning.
// Shared by the page markup, the shader uniforms and the live readouts so all three agree.

const LAYERS: [string, string][] = [
  ['Topsoil & plough zone', 'Modern'],
  ['Hill-wash colluvium', 'Ottoman'],
  ['Roof-collapse debris', 'Late Byzantine'],
  ['Lime-plaster floor', 'Byzantine'],
  ['Ash lens', 'Byzantine'],
  ['Sherd-rich fill', 'Roman'],
  ['Cobbled street', 'Roman'],
  ['Destruction burn', 'Hellenistic'],
  ['Mudbrick melt', 'Persian'],
  ['Storage-pit fill', 'Iron II'],
  ['Beaten-earth floor', 'Iron II'],
  ['Wall-footing horizon', 'Iron I'],
  ['Silt wash', 'Late Bronze'],
  ['Kiln waste', 'Late Bronze'],
  ['Courtyard surface', 'Middle Bronze'],
  ['Rampart fill', 'Middle Bronze'],
  ['Hearth sequence', 'Early Bronze'],
  ['Sterile clay', 'Natural'],
];

const LAYER_DEPTH = 0.3; // metres per horizon, 18 × 0.3 = 5.4 m section

// x: 0..1 across the 24 m transect, d: 0..1 depth fraction of the section.
const TARGETS = [
  { id: 'C-03', x: 0.17, d: 0.36, note: 'Continuous flat return — the Roman street runs under the spoil heap.' },
  { id: 'C-07', x: 0.45, d: 0.64, note: 'Two parallel returns 0.6 m apart — a wall footing, both faces.' },
  { id: 'C-11', x: 0.69, d: 0.5, note: 'Weak, rounded return — likely a storage pit cut into the floor.' },
  { id: 'C-14', x: 0.87, d: 0.86, note: 'Strong point reflector — burnt clay, almost certainly a hearth.' },
];

// Mirror of the shader's strata() boundary warp, so the hover readout names the band under the cursor.
const strata = (x: number, d: number, t: number) =>
  d * 18 +
  0.55 * Math.sin(x * 2.3 + d * 3.1 + t * 0.06) +
  0.28 * Math.sin(x * 5.7 - d * 7.0 - t * 0.045) +
  0.12 * Math.sin(x * 13.0 + d * 11.0 + t * 0.03);

const depthLabel = (i: number) =>
  `${(i * LAYER_DEPTH).toFixed(1)}–${((i + 1) * LAYER_DEPTH).toFixed(1)} m`;

export { depthLabel, LAYER_DEPTH, LAYERS, strata, TARGETS };
