// Self-check for one skill page: desktop (1440x900) + mobile (390x844) screenshots in .shots/,
// plus any console/page errors. Usage: node scripts/shot.mjs <skill-name> [--scroll]
import { mkdirSync } from 'node:fs';
import { launch, open } from './browser.mjs';

const [name, ...flags] = process.argv.slice(2);
if (!name) {
  console.error('usage: node scripts/shot.mjs <skill-name> [--scroll]');
  process.exit(1);
}
mkdirSync('.shots', { recursive: true });

const browser = await launch();
const outputs = [];
for (const [label, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
  const { page, errors } = await open(browser, name, { width, height });
  const file = `.shots/${name}-${label}.jpg`;
  await page.screenshot({ path: file, type: 'jpeg', quality: 80 });
  outputs.push(file);
  if (flags.includes('--scroll')) {
    // Mid-page and further down, to check scroll-driven states.
    for (const frac of [0.33, 0.66]) {
      await page.evaluate((f) => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * f), frac);
      await page.waitForTimeout(1500);
      const scrolled = `.shots/${name}-${label}-${Math.round(frac * 100)}.jpg`;
      await page.screenshot({ path: scrolled, type: 'jpeg', quality: 80 });
      outputs.push(scrolled);
    }
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (overflow > 1) errors.push(`horizontal overflow ${overflow}px at ${width}px`);
  console.info(`[${label}] errors: ${errors.length ? '\n  ' + errors.join('\n  ') : 'none'}`);
  await page.close();
}
await browser.close();
console.info(`screenshots:\n  ${outputs.join('\n  ')}`);
