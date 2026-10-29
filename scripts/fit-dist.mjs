const list = await (await fetch('http://127.0.0.1:9380/json/list')).json();
const t = list.find(x => x.type === 'page');
const ws = new WebSocket(t.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
const call = (m, p = {}, ms = 12000) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); setTimeout(()=>{if(pend.has(i)){pend.delete(i);res(null);}}, ms); });
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result ?? m.error); pend.delete(m.id); } };
await new Promise(r => ws.onopen = r);
const v = async (e) => (await call('Runtime.evaluate', { expression: e, returnByValue: true }))?.result?.value;
console.log(await v(`(() => {
  const fits = [...document.querySelectorAll('.fit')].map(e => parseInt(e.textContent));
  const dist = {};
  for (const f of fits) { const b = Math.floor(f/10)*10; dist[b] = (dist[b]||0)+1; }
  return JSON.stringify(dist) + ' | min ' + Math.min(...fits) + ' max ' + Math.max(...fits);
})()`));
ws.close(); process.exit(0);
