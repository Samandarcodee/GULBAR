import express from 'express';
import { resolve } from 'node:path';
import { createApp } from '../server/app.js';
import { hashPassword } from '../server/accounts.js';
const { app, db } = createApp({ demo: true });
db.prepare('INSERT INTO accounts VALUES (?,?,?,?,?,1,1,?)').run('test-admin', 'e2e-admin', 'admin', null, await hashPassword('Temporary-Test-Password'), new Date().toISOString());
app.use(express.static(resolve('dist')));
app.get('/{*path}', (req, res) => res.sendFile(resolve('dist/index.html')));
app.listen(3107, '127.0.0.1');
