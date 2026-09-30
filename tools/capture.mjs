#!/usr/bin/env node
/**
 * Screenshots of every page, in both themes, at the widths the layout changes
 * shape: 375 (phone, drawer), 820 (the drawer's edge), 1280 (sidebar, inline
 * contents) and 1440 (all three columns). Review them by eye; nothing here
 * compares images.
 *
 * Serve dist/ first with Cloudflare's own emulator, so pretty URLs and
 * redirects behave as they do in production:
 *
 *   npx wrangler pages dev dist --port 8788
 *   node tools/capture.mjs <outdir> [--port 8788] [--full] [--only slug,slug]
 *
 * WHY THE FLAGS: subpixel antialiasing, device scale and font hinting vary with
 * machine state; scrollbars change layout width; a web font arriving late
 * changes metrics mid-capture, so the capture waits on document.fonts.ready.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer';
import { TABS, HIDDEN } from '../site.mjs';

const arg = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined);
const outdir = process.argv[2];
if (!outdir || outdir.startsWith('--')) { console.error('usage: capture.mjs <outdir> [--port N] [--full] [--only a,b]'); process.exit(2); }
const port = arg('--port') ?? '8788';
const full = process.argv.includes('--full');
const only = arg('--only')?.split(',');

const WIDTHS = [375, 820, 1280, 1440];
const THEMES = ['dark', 'light'];
const pathOf = (slug) => (slug === 'index' ? '/' : `/${slug}`);
const DOCS = [...TABS.flatMap((t) => t.pages.map((p) => p.slug)), ...HIDDEN, '404-check-a-missing-page']
  .filter((s) => !only || only.includes(s));

mkdirSync(outdir, { recursive: true });
const browser = await puppeteer.launch({
  headless: 'shell',
  args: ['--force-device-scale-factor=1', '--font-render-hinting=none', '--disable-lcd-text', '--hide-scrollbars', '--force-color-profile=srgb'],
});

let n = 0;
for (const theme of THEMES) {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument((t) => {
    try { localStorage.setItem('lloyal-docs-theme', t); } catch (e) {}
    const s = document.createElement('style');
    s.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';
    document.documentElement.appendChild(s);
  }, theme);
  for (const slug of DOCS) {
    for (const w of WIDTHS) {
      await page.setViewport({ width: w, height: 900, deviceScaleFactor: 1 });
      await page.goto(`http://localhost:${port}${pathOf(slug)}`, { waitUntil: 'networkidle0' });
      await page.evaluate(() => document.fonts.ready);
      const name = `${slug.replace(/\//g, '_')}_${theme}_${w}.png`;
      writeFileSync(join(outdir, name), await page.screenshot({ fullPage: full, type: 'png' }));
      n++;
    }
  }
  await page.close();
}
await browser.close();
console.log(`  captured ${n} renders -> ${outdir}`);
