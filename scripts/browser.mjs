// Shared headless Chromium setup: WebGL via SwiftShader, WebGPU enabled where the platform allows.
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:4321';

const launch = () =>
  chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist'],
  });

// Loads /skills/<name>/?shot, lets motion settle, returns console/page errors.
const open = async (browser, name, { width = 1440, height = 900, wait = 3000 } = {}) => {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  const res = await page.goto(`${BASE}/skills/${name}/?shot`, { waitUntil: 'load', timeout: 60000 });
  if (!res || res.status() >= 400) errors.push(`http ${res?.status()}`);
  await page.waitForTimeout(wait);
  return { page, errors };
};

export { BASE, launch, open };
