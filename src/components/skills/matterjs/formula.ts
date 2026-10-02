// Sorrel No. 3 — the fourteen ingredients, by weight. Shared by the tray and the ledger.
type Shape = 'circle' | 'block' | 'hex' | 'capsule';
type Ingredient = { name: string; short: string; pct: number; shape: Shape; color: string; ink: string; role: string };

const DARK = '#22241e';
const LIGHT = '#f8f3e8';

const formula: Ingredient[] = [
  { name: 'Sunflower seed oil', short: 'Sunflower', pct: 31, shape: 'circle', color: '#e2c062', ink: DARK, role: 'Lifts make-up and sunscreen' },
  { name: 'Shea butter', short: 'Shea', pct: 18, shape: 'block', color: '#efe2c4', ink: DARK, role: 'Body and slip; melts at skin temperature' },
  { name: 'Oat kernel oil', short: 'Oat', pct: 12, shape: 'circle', color: '#d5c3a0', ink: DARK, role: 'Calms tight, post-wash skin' },
  { name: 'White kaolin clay', short: 'Kaolin', pct: 9, shape: 'block', color: '#dca898', ink: DARK, role: 'Takes oil off with the cloth' },
  { name: 'Beeswax', short: 'Beeswax', pct: 8, shape: 'hex', color: '#d4973a', ink: DARK, role: 'Holds the balm solid in the jar' },
  { name: 'Rosehip oil', short: 'Rosehip', pct: 6, shape: 'circle', color: '#c4513a', ink: LIGHT, role: 'Cold-pressed, for dry patches' },
  { name: 'Sea buckthorn oil', short: 'Buckthorn', pct: 4, shape: 'circle', color: '#e2772b', ink: DARK, role: 'Gives the balm its apricot colour' },
  { name: 'Calendula extract', short: 'Calendula', pct: 3, shape: 'capsule', color: '#eba53a', ink: DARK, role: 'Infused in oil for six weeks' },
  { name: 'Chamomile extract', short: 'Chamomile', pct: 2.5, shape: 'circle', color: '#efd68a', ink: DARK, role: 'Soothes redness after rinsing' },
  { name: 'Sorrel leaf extract', short: 'Sorrel', pct: 2, shape: 'capsule', color: '#7e9a62', ink: LIGHT, role: 'Our namesake; mild, green, tart' },
  { name: 'Vitamin E', short: 'Vit. E', pct: 1.5, shape: 'circle', color: '#a67c45', ink: LIGHT, role: 'Keeps the oils from turning' },
  { name: 'Bisabolol', short: 'Bisabolol', pct: 1.2, shape: 'circle', color: '#a99dc6', ink: DARK, role: 'From candeia wood; anti-redness' },
  { name: 'Lavender oil', short: 'Lavender', pct: 1, shape: 'circle', color: '#7d74ab', ink: LIGHT, role: 'The only scent, and a quiet one' },
  { name: 'Green tea extract', short: 'Green tea', pct: 0.8, shape: 'capsule', color: '#566f45', ink: LIGHT, role: 'Antioxidant; a pinch per batch' },
];

export type { Ingredient, Shape };
export { formula };
