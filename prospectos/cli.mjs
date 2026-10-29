#!/usr/bin/env node
/**
 * Prospección para DMs en X.
 *
 * No busca gente ni scrapea X: administra la lista que vos armás a mano, personaliza el
 * mensaje y controla el ritmo de envío para no parecer envío masivo.
 *
 *   node cli.mjs add --handle @ana --nombre Ana --empresa ACME --nota "recluta backend"
 *   node cli.mjs next                 # mensaje listo para copiar + pegar
 *   node cli.mjs sent @ana            # marca enviado (con fecha)
 *   node cli.mjs list [--pendientes]  # estado de la lista
 *   node cli.mjs stats                # cuántos hoy, cuánto queda de cupo
 *   node cli.mjs export               # CSV
 */
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const DB = path.join(DIR, 'prospectos.json');
const CUPO_DIARIO = 15;   // más que esto dispara los límites de X

// Las cifras NO van escritas a mano: se leen del último snapshot de XScraper.
// Un número desactualizado en el primer mensaje cuesta la confianza.
function cifras() {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(DIR, '..', 'xscraper', 'data.json'), 'utf8'));
    const jobs = raw.jobs ?? [];
    const empresas = new Set(jobs.map((j) => j.company).filter(Boolean)).size;
    return { total: jobs.length, empresas };
  } catch {
    return null;
  }
}

const MENSAJE = (p, c) => `Hola ${p.nombre}, vi que reclutás${p.empresa ? ` en ${p.empresa}` : ''}. Armé un radar que releva los portales de empleo todos los días y muestra las búsquedas junior abiertas en AMBA: hoy ${c ? c.total : 'medio centenar'}, en ${c ? c.empresas : 'unas cuarenta'} empresas, con modalidad real y cuántos días llevan sin cubrirse. Sin registro: vichea-laburo.vercel.app — ¿te resulta útil?`;

const load = () => {
  try { return JSON.parse(fs.readFileSync(DB, 'utf8')); } catch { return { prospectos: [] }; }
};
const save = (d) => fs.writeFileSync(DB, JSON.stringify(d, null, 2));
const hoy = () => new Date().toISOString().slice(0, 10);
const arg = (name, def = '') => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? (process.argv[i + 1] ?? def) : def;
};
const norm = (h = '') => h.trim().replace(/^@/, '').toLowerCase();

const db = load();
const cmd = process.argv[2];

switch (cmd) {
  case 'add': {
    const handle = norm(arg('handle'));
    if (!handle) { console.error('falta --handle'); process.exit(1); }
    if (db.prospectos.some((p) => p.handle === handle)) { console.log(`@${handle} ya está en la lista`); break; }
    db.prospectos.push({
      handle,
      nombre: arg('nombre') || handle,
      empresa: arg('empresa'),
      nota: arg('nota'),
      estado: 'pendiente',
      variante: arg('variante', 'A'),
      agregado: new Date().toISOString(),
      enviado: null,
    });
    save(db);
    console.log(`agregado @${handle} (${db.prospectos.length} en total)`);
    break;
  }

  case 'next': {
    const p = db.prospectos.find((x) => x.estado === 'pendiente');
    if (!p) { console.log('no quedan pendientes. Agregá más con "add".'); break; }
    const enviadosHoy = db.prospectos.filter((x) => x.enviado?.startsWith(hoy())).length;
    console.log(`── @${p.handle}${p.nota ? ` · ${p.nota}` : ''} ──`);
    const c = cifras();
    console.log(MENSAJE(p, c));
    if (c) console.log(`\n(cifras del snapshot: ${c.total} ofertas, ${c.empresas} empresas)`);
    console.log(`\n(copialo y, cuando lo mandes: node cli.mjs sent @${p.handle})`);
    if (enviadosHoy >= CUPO_DIARIO) {
      console.log(`\n⚠ Ya mandaste ${enviadosHoy} hoy (cupo ${CUPO_DIARIO}). Frená hasta mañana.`);
    } else {
      console.log(`\nenviados hoy: ${enviadosHoy}/${CUPO_DIARIO}`);
    }
    break;
  }

  case 'sent': {
    const handle = norm(process.argv[3] ?? '');
    const p = db.prospectos.find((x) => x.handle === handle);
    if (!p) { console.error(`@${handle} no está en la lista`); process.exit(1); }
    p.estado = 'enviado';
    p.enviado = new Date().toISOString();
    save(db);
    console.log(`@${handle} marcado como enviado`);
    break;
  }

  case 'list': {
    const soloPend = process.argv.includes('--pendientes');
    const items = db.prospectos.filter((p) => !soloPend || p.estado === 'pendiente');
    if (!items.length) { console.log('lista vacía'); break; }
    for (const p of items) {
      const cuando = p.enviado ? p.enviado.slice(0, 10) : '—';
      console.log(`  ${p.estado === 'enviado' ? '✓' : '·'} @${p.handle.padEnd(20)} ${(p.nombre || '').padEnd(14)} ${(p.empresa || '').padEnd(18)} ${cuando}`);
    }
    break;
  }

  case 'stats': {
    const total = db.prospectos.length;
    const enviados = db.prospectos.filter((p) => p.estado === 'enviado');
    const hoyN = enviados.filter((p) => p.enviado.startsWith(hoy())).length;
    console.log(`total: ${total} | enviados: ${enviados.length} | pendientes: ${total - enviados.length}`);
    console.log(`hoy: ${hoyN}/${CUPO_DIARIO}${hoyN >= CUPO_DIARIO ? '  ⚠ cupo alcanzado' : ''}`);
    break;
  }

  case 'export': {
    const rows = [['handle', 'nombre', 'empresa', 'nota', 'estado', 'enviado']];
    for (const p of db.prospectos) rows.push([p.handle, p.nombre, p.empresa, p.nota, p.estado, p.enviado ?? '']);
    console.log(rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n'));
    break;
  }

  default:
    console.log('comandos: add | next | sent | list | stats | export');
}
