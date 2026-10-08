// Demo API for local UI work: in-memory database, fictional shops, no Telegram, never touches data/*.sqlite.
// Seeds the same throw-away admin account the e2e tests use (local only).
import { createApp } from '../server/app.js';
import { hashPassword } from '../server/accounts.js';
const { app, db } = createApp({ demo: true });
db.prepare('INSERT INTO accounts VALUES (?,?,?,?,?,1,0,?)').run('dev-admin', 'e2e-admin', 'admin', null, await hashPassword('Temporary-Test-Password'), new Date().toISOString());
app.listen(3001, '127.0.0.1', () => console.log('GulBar demo API: http://127.0.0.1:3001'));
