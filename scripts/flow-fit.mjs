import fs from 'node:fs';
const PORT = 9380;
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const t = list.find(x => x.type === 'page');
const ws = new WebSocket(t.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
const call = (m, p = {}, ms = 15000) => new Promise(res => {
  const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p }));
  setTimeout(() => { if (pend.has(i)) { pend.delete(i); res(null); } }, ms);
});
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result ?? m.error); pend.delete(m.id); } };
await new Promise(r => ws.onopen = r);
const evalJs = async (expr) => (await call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }))?.result?.value;

await call('Page.enable');
await new Promise(r => setTimeout(r, 1500));

// login
await evalJs(`document.getElementById('email').value='prueba.afinidad@vichea-laburo.app';
  document.getElementById('password').value='PruebaSegura123!';
  document.querySelector('form').submit(); true`);
await new Promise(r => setTimeout(r, 3500));
console.log('url tras login:', await evalJs('location.pathname'));

// ir a ofertas
await call('Page.navigate', { url: 'http://127.0.0.1:4321/busquedas' });
await new Promise(r => setTimeout(r, 2500));
console.log('url ofertas:', await evalJs('location.pathname'));
console.log('filas:', await evalJs("document.querySelectorAll('#rows tr').length"));

// elegir dos habilidades
await evalJs(`document.querySelector('[data-skill="programacion"]').click(); true`);
await new Promise(r => setTimeout(r, 300));
await evalJs(`document.querySelector('[data-skill="datos"]').click(); true`);
await new Promise(r => setTimeout(r, 600));
console.log('perfil:', await evalJs("document.getElementById('profileState').textContent"));
console.log('badges de afinidad:', await evalJs("document.querySelectorAll('.fit').length"));
console.log('top 3:', await evalJs(`[...document.querySelectorAll('#rows tr')].slice(0,3).map(r=>r.querySelector('.fit')?.textContent+' | '+r.querySelector('.why')?.textContent).join(' // ')`));

const s = await call('Page.captureScreenshot', { format: 'png' });
if (s?.data) { fs.writeFileSync('work/fit-ui.png', Buffer.from(s.data, 'base64')); console.log('screenshot ok'); }
ws.close(); process.exit(0);
