// Not part of the test suite: where does the main thread spend the page load on a slow phone CPU?
//   node tests/perf-profile.mjs [url] [cpu-slowdown]
import { chromium } from '@playwright/test';

const url = process.argv[2] || 'http://127.0.0.1:3107/';
const rate = Number(process.argv[3] || 6);
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate });
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
await cdp.send('Profiler.start');
await page.goto(url, { waitUntil: 'load' });
await page.waitForSelector('.gm-item');
await page.waitForTimeout(3000);
const { profile } = await cdp.send('Profiler.stop');

const byId = new Map(profile.nodes.map(n => [n.id, n]));
const self = new Map();
profile.samples.forEach((id, i) => { self.set(id, (self.get(id) || 0) + (profile.timeDeltas[i] || 0)); });
const rows = new Map();
for (const [id, us] of self) {
  const n = byId.get(id), f = n.callFrame;
  const where = f.url ? f.url.split('/').slice(-1)[0].slice(0, 28) : '(native)';
  const key = `${f.functionName || '(anonymous)'}  ${where}:${f.lineNumber}`;
  rows.set(key, (rows.get(key) || 0) + us);
}
const total = [...rows.values()].reduce((a, b) => a + b, 0);
console.log(`profiled main-thread time: ${Math.round(total / 1000)} ms at cpu x${rate}`);
[...rows].sort((a, b) => b[1] - a[1]).slice(0, 16).forEach(([k, us]) => console.log(`${String(Math.round(us / 1000)).padStart(6)} ms  ${k}`));
await browser.close();
