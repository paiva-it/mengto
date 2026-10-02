// Deterministic sample rules: the hero demo, the server-rendered first state and the
// sample tickets all come from this one table. No model, no network.
type Part = { name: string; price: number };
type Line = { id: string; area: string; symptom: string; cause: string; line: string; minutes: number; parts: Part[]; ref: string };
type Rule = Line & { match: RegExp };

const RATE = 48; // € per bench hour, sample shop rate

const RULES: Rule[] = [
  { id: 'esc', area: 'Escapement', match: /skip|jump|spac/i, symptom: 'Carriage skips or doubles a space', cause: 'Escapement dog gummed with old oil', line: 'Clean & regulate escapement', minutes: 45, parts: [], ref: '§4.2' },
  { id: 'ribbon', area: 'Ribbon feed', match: /ribbon|faint|revers/i, symptom: 'Ribbon stops advancing', cause: 'Spool reverse lever not tripping at the eyelet', line: 'Service ribbon reverse, fit new ribbon', minutes: 20, parts: [{ name: 'Nylon ribbon, black', price: 9 }], ref: '§6.1' },
  { id: 'keys', area: 'Type bars', match: /stick|sluggish|slow|jam/i, symptom: 'Type bars slow to return', cause: 'Dried oil in the segment slots', line: 'Clean segment & type-bar slots', minutes: 60, parts: [], ref: '§3.4' },
  { id: 'platen', area: 'Paper feed', match: /platen|smudg|uneven|slip/i, symptom: 'Paper slips or prints unevenly', cause: 'Hardened platen and feed rollers', line: 'Recover platen & feed rollers', minutes: 30, parts: [{ name: 'Platen recovering (sent out)', price: 65 }], ref: '§5.3' },
  { id: 'bell', area: 'Margins', match: /bell|margin/i, symptom: 'Margin bell silent', cause: 'Bell trip bent, clapper spring missing', line: 'Adjust margin bell trip', minutes: 15, parts: [{ name: 'Bell clapper spring', price: 4 }], ref: '§4.7' },
];

const FALLBACK: Line = { id: 'inspect', area: 'Inspection', symptom: 'No sample rule matched the note', cause: 'Technician diagnoses on the bench', line: 'Bench inspection', minutes: 30, parts: [], ref: '—' };

const draftLines = (note: string): Line[] => {
  const hits = RULES.filter((r) => r.match.test(note)).map(({ match: _m, ...line }) => ({ ...line, parts: [...line.parts] }));
  if (hits.length) {
    return hits;
  }
  return [{ ...FALLBACK }];
};

const constraintOf = (note: string): string | null => {
  if (/call|ask|before replac|check with/i.test(note)) {
    return 'Customer asked to be called before any part is replaced';
  }
  return null;
};

const eur = (n: number) => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

const totals = (lines: Line[]) => {
  const minutes = lines.reduce((s, l) => s + l.minutes, 0);
  const parts = lines.reduce((s, l) => s + l.parts.reduce((p, x) => p + x.price, 0), 0);
  return { minutes, parts, labour: Math.round((minutes / 60) * RATE), estimate: Math.round((minutes / 60) * RATE) + parts };
};

const SAMPLE_NOTE =
  'Carriage skips after the letter e and sometimes jumps two spaces. The ribbon stopped moving last week. It was my grandmother’s — please call before replacing anything.';

export type { Line, Part };
export { constraintOf, draftLines, eur, RATE, SAMPLE_NOTE, totals };
