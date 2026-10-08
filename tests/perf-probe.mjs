// Not part of the test suite. Measures how the home page behaves on a slow phone CPU:
//   node tests/serve.js &   then   node tests/perf-probe.mjs [url] [cpu-slowdown]
import { chromium } from '@playwright/test';

const url = process.argv[2] || 'http://127.0.0.1:3107/';
const rate = Number(process.argv[3] || 6);
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate });

await page.addInitScript(() => {
  window.__long = [];
  new PerformanceObserver(l => l.getEntries().forEach(e => window.__long.push(Math.round(e.duration)))).observe({ type: 'longtask', buffered: true });
  window.__frames = (ms) => new Promise(resolve => {
    const gaps = []; let last = performance.now(); const end = last + ms;
    (function tick(now) { gaps.push(now - last); last = now; if (now < end) requestAnimationFrame(tick); else resolve(gaps); })(last);
  });
});
const summary = (name, gaps) => {
  const slow = gaps.filter(g => g > 50).length;
  console.log(`${name.padEnd(28)} frames ${String(gaps.length).padStart(3)}  slowest ${String(Math.round(Math.max(...gaps))).padStart(4)} ms  frames >50ms: ${slow}`);
};

const t0 = Date.now();
await page.goto(url, { waitUntil: 'load' });
await page.waitForSelector('.gm-item');
console.log(`cpu x${rate}: first bouquet visible after ${Date.now() - t0} ms`);
await page.waitForTimeout(2500);
const load = await page.evaluate(() => window.__long);
console.log(`long tasks while loading: ${load.length}  total blocked beyond 50ms: ${load.reduce((a, d) => a + Math.max(0, d - 50), 0)} ms  longest ${Math.max(0, ...load)} ms`);

await page.evaluate(() => { window.__long.length = 0; });
let gaps = await page.evaluate(() => { const p = window.__frames(1500); window.scrollTo({ top: 1800, behavior: 'smooth' }); return p; });
summary('smooth scroll 1.5 s', gaps);

await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(600);
await page.evaluate(() => { window.__long.length = 0; });
const click = async (name, label) => {
  const started = Date.now();
  const frames = page.evaluate(() => window.__frames(1200));
  await page.getByRole('button', { name: label, exact: true }).first().click();
  summary(name, await frames);
  const long = await page.evaluate(() => window.__long.splice(0));
  console.log(`   long tasks: ${long.length} ${long.length ? '(' + long.join(', ') + ' ms)' : ''}  click took ${Date.now() - started} ms`);
};
await click('filter "Onamga"', 'Onamga');
await click('filter "Hammasi"', 'Hammasi');
await browser.close();
