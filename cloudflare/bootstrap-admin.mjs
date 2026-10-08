import { readFileSync } from 'node:fs';
const url = process.argv[2] || 'https://gulbar.bella-rose.workers.dev';
const secrets = JSON.parse(readFileSync(new URL('../.cloudflare-secrets.json', import.meta.url), 'utf8'));
const credentials = JSON.parse(readFileSync(new URL('../.gulbar-admin-login.json', import.meta.url), 'utf8'));
try {
  const response = await fetch(`${url}/api/admin/bootstrap`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secrets.ADMIN_TOKEN}` }, body: JSON.stringify(credentials) });
  if (![201, 409].includes(response.status)) throw new Error(`Admin setup failed: ${response.status}`);
  console.log(response.status === 201 ? 'Owner admin created; first-login password change required.' : 'Existing owner admin was preserved.');
} catch (e) { console.error(e.message); process.exitCode = 1; }
