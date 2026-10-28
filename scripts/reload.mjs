import fs from 'node:fs';
const list = await (await fetch('http://127.0.0.1:9340/json/list')).json();
const t = list.find(x => x.type === 'page' && x.url.includes('xscraper/index.html'));
if (!t) { console.log('la pestaña del radar ya no está abierta'); process.exit(1); }
const ws = new WebSocket(t.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
const call = (m, p = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result ?? m.error); pend.delete(m.id); } };
await new Promise(r => ws.onopen = r);
await call('Page.enable');
await call('Runtime.evaluate', { expression: 'window.scrollTo(0,0)' });
await call('Page.reload', { ignoreCache: true });
await new Promise(r => setTimeout(r, 2500));
await call('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
await new Promise(r => setTimeout(r, 800));
const s = await call('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('work/radar3.png', Buffer.from(s.data, 'base64'));
console.log('ok'); process.exit(0);
