#!/usr/bin/env node
/**
 * XScraper — motor de relevamiento.
 *
 * Uso:
 *   node cli.mjs            # corre el pipeline completo y escribe data.json + history/
 *   node cli.mjs --diff     # compara los dos últimos snapshots
 *   node cli.mjs --help
 */
const arg = process.argv[2];

if (arg === '--help' || arg === '-h') {
  console.log(`XScraper — releva, normaliza y deduplica ofertas junior/trainee.

  node cli.mjs             corrida completa (fuentes → filtro → data.json + history/)
  node cli.mjs --diff      compara los dos últimos snapshots
  node cli.mjs --plan      simula la ingesta a Postgres y muestra qué se escribiría
  node cli.mjs --ingest    escribe el snapshot actual en Supabase (necesita xscraper/.env)
  node cli.mjs --help      esto

Salida: data.json (estado actual), history/<YYYY-MM-DD>.json (serie), index.html (vista).`);
  process.exit(0);
}

if (arg === '--diff') {
  await import('./src/diff.mjs');
} else if (arg === '--ingest') {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { buildPlan, summarize, applyPlan } = await import('./src/ingest.mjs');
  const { createClient } = await import('@supabase/supabase-js');

  const here = path.resolve(path.dirname(new URL(import.meta.url).pathname));
  // .env propio de xscraper (la service_role no vive en la app)
  const envFile = path.join(here, '.env');
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en xscraper/.env');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(path.join(here, 'data.json'), 'utf8'));
  const plan = buildPlan(data.jobs ?? []);
  console.log(`Plan para ${data.generatedAt}:\n  ${summarize(plan)}`);

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const stats = await applyPlan(supabase, plan, { log: (l) => console.log('  aplicado:', l) });
  console.log(`\nListo. ${stats.jobs} ofertas, ${stats.newJobs} nuevas, ${stats.records} avistamientos, ${stats.runs} corridas.`);
} else if (arg === '--plan') {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { buildPlan, summarize } = await import('./src/ingest.mjs');
  const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname));
  const data = JSON.parse(fs.readFileSync(path.join(dir, 'data.json'), 'utf8'));
  const plan = buildPlan(data.jobs ?? []);
  console.log(`Plan de ingesta para ${data.generatedAt}:\n  ${summarize(plan)}`);
  console.log('\n  (dry-run: no se escribió nada en la base)');
} else {
  await import('./src/engine.mjs');
}
