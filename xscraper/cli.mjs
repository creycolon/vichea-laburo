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
  node cli.mjs --help      esto

Salida: data.json (estado actual), history/<YYYY-MM-DD>.json (serie), index.html (vista).`);
  process.exit(0);
}

if (arg === '--diff') {
  await import('./src/diff.mjs');
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
