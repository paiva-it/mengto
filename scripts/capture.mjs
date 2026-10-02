// Captures the home-page preview for every skill page (or the names given) into public/previews/<name>.jpg.
import skills from '../src/data/skills.json' with { type: 'json' };
import { launch, open } from './browser.mjs';

const only = process.argv.slice(2);
const names = skills.map((s) => s.name).filter((n) => !only.length || only.includes(n));

const browser = await launch();
const failed = [];
for (const name of names) {
  try {
    const { page, errors } = await open(browser, name, { wait: 3500 });
    await page.screenshot({ path: `public/previews/${name}.jpg`, type: 'jpeg', quality: 78 });
    await page.close();
    console.info(`${name}${errors.length ? `  (${errors.length} errors)` : ''}`);
  } catch (e) {
    failed.push(name);
    console.error(`${name}  FAILED: ${e.message}`);
  }
}
await browser.close();
if (failed.length) {
  console.error(`failed: ${failed.join(' ')}`);
  process.exit(1);
}
