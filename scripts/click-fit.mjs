const list = await (await fetch('http://127.0.0.1:9380/json/list')).json();
const t = list.find(x => x.type === 'page');
const ws = new WebSocket(t.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
const call = (m, p = {}, ms = 10000) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); setTimeout(()=>{if(pend.has(i)){pend.delete(i);res(null);}}, ms); });
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result ?? m.error); pend.delete(m.id); } };
await new Promise(r => ws.onopen = r);
const v = async (e) => (await call('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }))?.result?.value;
console.log('chips:', await v("document.querySelectorAll('#skills .chip').length"));
console.log('click 1:', await v(`(() => { const el=document.querySelector('[data-skill="programacion"]'); if(!el) return 'no encontrado'; el.dispatchEvent(new MouseEvent('click',{bubbles:true})); return 'ok'; })()`));
await new Promise(r => setTimeout(r, 500));
console.log('perfil:', await v("document.getElementById('profileState').textContent"));
console.log('click 2:', await v(`(() => { const el=document.querySelector('[data-skill="datos"]'); if(!el) return 'no encontrado'; el.dispatchEvent(new MouseEvent('click',{bubbles:true})); return 'ok'; })()`));
await new Promise(r => setTimeout(r, 700));
console.log('perfil:', await v("document.getElementById('profileState').textContent"));
console.log(await v(`(() => {
  const fits=[...document.querySelectorAll('.fit')].map(e=>parseInt(e.textContent));
  if(!fits.length) return 'sin badges';
  const d={}; for(const f of fits){const b=Math.floor(f/10)*10; d[b]=(d[b]||0)+1;}
  return 'dist '+JSON.stringify(d)+' | max '+Math.max(...fits)+' | ≥60: '+fits.filter(f=>f>=60).length;
})()`));
console.log('top3:', await v(`[...document.querySelectorAll('#rows tr')].slice(0,3).map(r=>r.querySelector('.fit')?.textContent+' — '+r.querySelector('.why')?.textContent).join('  //  ')`));
ws.close(); process.exit(0);
