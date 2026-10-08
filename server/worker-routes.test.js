import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../cloudflare/worker.ts', import.meta.url), 'utf8');

test('the Worker registers every API route only once', () => {
  const seen = new Map();
  for (const m of source.matchAll(/^app\.(get|post|patch|put|delete)\('([^']+)'/gm)) {
    const key = `${m[1].toUpperCase()} ${m[2]}`;
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  const twice = [...seen].filter(([, n]) => n > 1).map(([key]) => key);
  assert.deepEqual(twice, [], `duplicated routes (the second copy would never run): ${twice.join(', ')}`);
});

test('shop-side handlers never read the buyer id, which only exists on customer routes', () => {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex(l => l.startsWith("app.get('/api/merchant/:shopId/orders'"));
  assert.ok(start >= 0, 'merchant order list route exists');
  const end = lines.findIndex((l, i) => i > start && l === '});');
  const body = lines.slice(start, end + 1).join('\n');
  assert.ok(!body.includes("get('customerId')"), "merchant order list must not call c.get('customerId') (D1 rejects undefined binds, giving a 500)");
});
