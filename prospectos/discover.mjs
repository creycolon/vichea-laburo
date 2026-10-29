#!/usr/bin/env node
/**
 * Descubrimiento de prospectos en X vía Apify (no scrapea X directamente).
 *
 *   APIFY_TOKEN=... node discover.mjs "recruiter CABA"
 *   node discover.mjs "recruiter CABA" --save     # los agrega a prospectos.json
 *   node discover.mjs --help
 *
 * Corre el actor apidojo/tweet-scraper con la query y toma los autores únicos.
 * Costo: US$0,0001 por tweet; 100 tweets ≈ US$0,01.
 */
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const DB = path.join(DIR, 'prospectos.json');
const ACTOR = 'apidojo~tweet-scraper';

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) {
  console.log(`Uso: APIFY_TOKEN=... node discover.mjs "<query de X>" [--max N] [--save]

  "<query>"   cualquier búsqueda de X (admite operadores: lang:, since:, min_faves:…)
  --max N     cuántos tweets traer (default 100 ≈ US$0,01)
  --save      agrega los encontrados a prospectos.json como pendientes

Sin --save solo muestra los candidatos.`);
  process.exit(0);
}

// token: variable de entorno o archivo .env local
const envFile = path.join(DIR, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
const TOKEN = process.env.APIFY_TOKEN;
if (!TOKEN) {
  console.error('Falta APIFY_TOKEN. Creá tu token en https://console.apify.com/account/integrations y guardalo en prospectos/.env:');
  console.error('  APIFY_TOKEN=apify_api_...');
  process.exit(1);
}

const query = args.find((a) => !a.startsWith('--') && !/^\d+$/.test(a));
const maxIdx = args.indexOf('--max');
const max = maxIdx > -1 ? Number(args[maxIdx + 1]) : 100;
const save = args.includes('--save');

console.log(`buscando "${query}" (hasta ${max} tweets ≈ US$${(max * 0.0001).toFixed(2)})…`);
const url = `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${TOKEN}`;
const res = await fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ searchTerms: [query], maxItems: max, sort: 'Top' }),
});

if (!res.ok) {
  console.error(`Apify respondió ${res.status}: ${(await res.text()).slice(0, 300)}`);
  process.exit(1);
}

const items = await res.json();
console.log(`tweets recibidos: ${items.length}`);

const porHandle = new Map();
for (const t of items) {
  const u = t.author ?? t.user ?? {};
  const handle = (u.userName ?? u.username ?? '').toLowerCase();
  if (!handle) continue;
  if (!porHandle.has(handle)) {
    porHandle.set(handle, {
      handle,
      nombre: u.name ?? u.displayName ?? handle,
      bio: (u.description ?? '').slice(0, 120),
      seguidores: u.followers ?? u.followersCount ?? null,
    });
  }
}

const db = fs.existsSync(DB) ? JSON.parse(fs.readFileSync(DB, 'utf8')) : { prospectos: [] };
const yaEstan = new Set(db.prospectos.map((p) => p.handle));
const nuevos = [...porHandle.values()].filter((p) => !yaEstan.has(p.handle));

console.log(`autores únicos: ${porHandle.size} · nuevos: ${nuevos.length}\n`);
for (const p of nuevos.slice(0, 20)) {
  console.log(`  @${p.handle.padEnd(20)} ${(p.nombre || '').slice(0, 24).padEnd(24)} ${p.seguidores ?? '—'} seg.`);
}
if (nuevos.length > 20) console.log(`  … y ${nuevos.length - 20} más`);

if (save && nuevos.length) {
  const hoy = new Date().toISOString();
  for (const p of nuevos) {
    db.prospectos.push({
      handle: p.handle, nombre: p.nombre, empresa: '', nota: p.bio || query,
      estado: 'pendiente', variante: 'A', agregado: hoy, enviado: null,
    });
  }
  fs.writeFileSync(DB, JSON.stringify(db, null, 2));
  console.log(`\n${nuevos.length} agregados a prospectos.json (total ${db.prospectos.length})`);
} else if (nuevos.length) {
  console.log('\n(no se guardó nada; usá --save para agregarlos)');
}
