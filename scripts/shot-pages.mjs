import fs from 'node:fs';
const PORT = process.argv[2] ?? '9350';
const pages = [['/', 'web-landing'], ['/login', 'web-login'], ['/panel', 'web-panel']];
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const t = list.find(x => x.type === 'page');
const ws = new WebSocket(t.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
const call = (m, p = {}, ms = 12000) => new Promise(res => {
  const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p }));
  setTimeout(() => { if (pend.has(i)) { pend.delete(i); res(null); } }, ms);
});
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result ?? m.error); pend.delete(m.id); } };
await new Promise(r => ws.onopen = r);
await call('Page.enable');
await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
for (const [path, name] of pages) {
  await call('Page.navigate', { url: 'http://127.0.0.1:4321' + path });
  await new Promise(r => setTimeout(r, 1800));
  const s = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  if (s?.data) { fs.writeFileSync(`work/${name}.png`, Buffer.from(s.data, 'base64')); console.log('ok', path); }
  else console.log('falló', path);
}
ws.close(); process.exit(0);
