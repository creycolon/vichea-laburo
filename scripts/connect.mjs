// Abre Chrome con una COPIA del perfil (work/ud) y pide las cuentas a MetaMask.
// La llave sigue en la extensión: acá solo se aprueba una conexión de dapp.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs';
import path from 'node:path';

const UD = path.resolve('work/ud');
const PROFILE = process.env.CHROME_PROFILE || 'Profile 1';
const PORT = Number(process.env.CDP_PORT || 9333);
const EXT = 'nkbihfbeogaeaoehlefnkodbefgpgknn';
const OUT = path.resolve('work/accounts.json');
const WAIT_MS = Number(process.env.APPROVAL_TIMEOUT_MS || 15 * 60 * 1000);

const t = () => new Date().toTimeString().slice(0, 8);
const log = (...a) => console.log(`[${t()}]`, ...a);

log('lanzando Chrome (perfil aislado, el original no se toca)');
const chrome = spawn('/usr/bin/google-chrome', [
  `--user-data-dir=${UD}`,
  `--profile-directory=${PROFILE}`,
  `--remote-debugging-port=${PORT}`,
  '--no-sandbox',            // chrome-sandbox está owned por `nobody` en este sistema
  '--disable-crash-reporter',
  '--no-first-run',
  '--no-default-browser-check',
  '--no-service-autorun',
  '--password-store=basic',
  'about:blank',
], { stdio: 'ignore' });

chrome.on('exit', (code) => log(`chrome salió con código ${code}`));
process.on('exit', () => { try { chrome.kill('SIGTERM'); } catch {} });

// esperar el endpoint CDP
let version;
for (let i = 0; i < 60; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
    if (r.ok) { version = await r.json(); break; }
  } catch {}
  await sleep(500);
}
if (!version) { console.error('no se pudo conectar al puerto de depuración'); process.exit(1); }
log('CDP listo:', version['Browser']);

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
const ctx = browser.contexts()[0] ?? (await browser.newContext());
const page = await ctx.newPage();

await page.goto('https://example.com', { waitUntil: 'domcontentloaded' });
log('página de prueba abierta en:', await page.url());

// ¿está MetaMask presente?
const state = await page.evaluate(async () => {
  const eth = window.ethereum;
  if (!eth) return { injected: false };
  return {
    injected: true,
    isMetaMask: !!eth.isMetaMask,
    chainId: await eth.request({ method: 'eth_chainId' }),
    already: await eth.request({ method: 'eth_accounts' }),
  };
});
log('proveedor inyectado:', JSON.stringify(state));
if (!state.injected) {
  console.error('MetaMask no inyectó window.ethereum en la copia del perfil.');
  process.exit(2);
}

// vigilar la ventana de la extensión mientras se espera
const watched = new Set();
const watcher = setInterval(async () => {
  for (const p of ctx.pages()) {
    const u = p.url();
    if (u.includes(EXT) && !watched.has(u)) { watched.add(u); log('ventana MetaMask:', u); }
  }
}, 1500);

log(`pidiendo cuentas — tenés ${Math.round(WAIT_MS / 60000)} min para aprobar en la ventana`);
let accounts = state.already;
if (!accounts.length) {
  accounts = await page.evaluate(async (ms) => {
    window.__mmErr = null;
    const p = window.ethereum.request({ method: 'eth_requestAccounts' })
      .then((a) => a).catch((e) => { window.__mmErr = String(e?.message || e); return null; });
    const timeout = new Promise((r) => setTimeout(() => r('__timeout__'), ms));
    const out = await Promise.race([p, timeout]);
    if (out === '__timeout__') return { timeout: true };
    if (out === null) return { error: window.__mmErr };
    return { accounts: out };
  }, WAIT_MS);
  clearInterval(watcher);
  if (accounts?.error) { console.error('MetaMask rechazó o falló:', accounts.error); process.exit(3); }
  if (accounts?.timeout) { console.error('se agotó el tiempo de espera de aprobación'); process.exit(4); }
  accounts = accounts.accounts;
}
clearInterval(watcher);

log('cuentas:', accounts.join(', '));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ profile: PROFILE, accounts, at: new Date().toISOString() }, null, 2));
log('guardado en', OUT);

await browser.close().catch(() => {});
chrome.kill('SIGTERM');
log('listo');
process.exit(0);
