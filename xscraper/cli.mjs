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
  node cli.mjs --help      esto

Salida: data.json (estado actual), history/<YYYY-MM-DD>.json (serie), index.html (vista).`);
  process.exit(0);
}

if (arg === '--diff') {
  await import('./src/diff.mjs');
} else {
  await import('./src/engine.mjs');
}
