const list = await (await fetch('http://127.0.0.1:9380/json/list')).json();
const t = list.find(x => x.type === 'page');
const ws = new WebSocket(t.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
const call = (m, p = {}, ms = 12000) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); setTimeout(()=>{if(pend.has(i)){pend.delete(i);res(null);}}, ms); });
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result ?? m.error); pend.delete(m.id); } };
await new Promise(r => ws.onopen = r);
const v = async (e) => (await call('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }))?.result?.value;
const click = (sel) => v(`(() => { const el=document.querySelector('${sel}'); if(!el) return 'no'; el.dispatchEvent(new MouseEvent('click',{bubbles:true})); return 'ok'; })()`);

await v("localStorage.removeItem('vichea.profile.v1')");
await call('Page.navigate', { url: 'http://127.0.0.1:4321/busquedas' });
await new Promise(r => setTimeout(r, 2600));
await click('[data-skill="programacion"]'); await new Promise(r => setTimeout(r, 300));
await click('[data-skill="datos"]'); await new Promise(r => setTimeout(r, 400));
await click('[id="pmod"] option[value="remoto"]'); // no-op si es select
await v(`(() => { const s=document.getElementById('pmod'); s.value='remoto'; s.dispatchEvent(new Event('change',{bubbles:true})); })()`);
await new Promise(r => setTimeout(r, 600));
console.log('perfil:', await v("document.getElementById('profileState').textContent"));
console.log(await v(`(() => {
  const fits=[...document.querySelectorAll('.fit')].map(e=>parseInt(e.textContent));
  if(!fits.length) return 'sin badges';
  const d={}; for(const f of fits){const b=Math.floor(f/10)*10; d[b]=(d[b]||0)+1;}
  return 'dist '+JSON.stringify(d)+' | min '+Math.min(...fits)+' max '+Math.max(...fits)+' | ≥60: '+fits.filter(f=>f>=60).length;
})()`));
console.log('top3:', await v(`[...document.querySelectorAll('#rows tr')].slice(0,3).map(r=>r.querySelector('.fit')?.textContent+' — '+r.querySelector('.why')?.textContent).join('  //  ')`));
ws.close(); process.exit(0);
