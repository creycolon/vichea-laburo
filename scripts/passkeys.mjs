import { spawn } from 'node:child_process';
import fs from 'node:fs';
const PORT = 9335;
const chrome = spawn('/usr/bin/google-chrome', [
  `--user-data-dir=${process.cwd()}/work/ud`, '--profile-directory=Profile 1',
  '--no-sandbox', '--disable-crash-reporter', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, 'chrome://password-manager/passkeys',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let list = [];
for (let i = 0; i < 40; i++) {
  try { list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (list.length) break; } catch {}
  await sleep(500);
}
const pages = list.filter(t => t.type === 'page');
console.log('targets:', pages.map(p => p.url).join(' , '));
const t = pages.find(p => p.url.includes('passkeys')) ?? pages[0];
if (!t) { console.log('sin targets'); chrome.kill(); process.exit(1); }
const ws = new WebSocket(t.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
const call = (m, p = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result ?? m.error); pend.delete(m.id); } };
await new Promise(r => ws.onopen = r);
await call('Page.enable');
await call('Page.navigate', { url: 'chrome://password-manager/passkeys' });
await call('Runtime.enable');
await sleep(4000);
const txt = await call('Runtime.evaluate', { expression: 'document.body.innerText', returnByValue: true });
console.log('--- texto de la pagina ---');
console.log(String(txt?.result?.value ?? '').slice(0, 1200));
const shot = await call('Page.captureScreenshot', { format: 'png' });
if (shot?.data) { fs.writeFileSync('work/passkeys.png', Buffer.from(shot.data, 'base64')); console.log('screenshot ok'); }
chrome.kill('SIGTERM');
process.exit(0);
