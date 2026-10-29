const list = await (await fetch('http://127.0.0.1:9380/json/list')).json();
const t = list.find(x => x.type === 'page');
const ws = new WebSocket(t.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
const call = (m, p = {}, ms = 15000) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); setTimeout(()=>{if(pend.has(i)){pend.delete(i);res(null);}}, ms); });
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result ?? m.error); pend.delete(m.id); } };
await new Promise(r => ws.onopen = r);
const v = async (e) => (await call('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }))?.result?.value;
await call('Page.navigate', { url: 'http://127.0.0.1:4321/busquedas' });
await new Promise(r => setTimeout(r, 2800));
await v(`document.querySelector('[data-skill="programacion"]').click(); true`);
await new Promise(r => setTimeout(r, 400));
await v(`document.querySelector('[data-skill="datos"]').click(); true`);
await new Promise(r => setTimeout(r, 700));
console.log(await v(`(() => {
  const fits=[...document.querySelectorAll('.fit')].map(e=>parseInt(e.textContent));
  const d={}; for(const f of fits){const b=Math.floor(f/10)*10; d[b]=(d[b]||0)+1;}
  return 'distribución '+JSON.stringify(d)+' | min '+Math.min(...fits)+' max '+Math.max(...fits)+' | ≥60: '+fits.filter(f=>f>=60).length;
})()`));
console.log('top:', await v(`[...document.querySelectorAll('#rows tr')].slice(0,3).map(r=>r.querySelector('.fit')?.textContent+' — '+r.querySelector('.why')?.textContent).join(' // ')`));
ws.close(); process.exit(0);
