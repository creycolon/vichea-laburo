// Compara los dos últimos snapshots y resume qué cambió.
import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(path.dirname(new URL(import.meta.url).pathname), 'history');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
if (files.length < 2) {
  console.log(`todavía hay un solo snapshot (${files[0] ?? 'ninguno'}). Hace falta otro día para comparar.`);
  process.exit(0);
}

const [prevFile, curFile] = files.slice(-2);
const prev = JSON.parse(fs.readFileSync(path.join(dir, prevFile), 'utf8'));
const cur = JSON.parse(fs.readFileSync(path.join(dir, curFile), 'utf8'));

const key = (j) => j.url.replace(/[?#].*$/, '');
const prevKeys = new Map(prev.jobs.map(j => [key(j), j]));
const curKeys = new Map(cur.jobs.map(j => [key(j), j]));

const nuevas = cur.jobs.filter(j => !prevKeys.has(key(j)));
const cerradas = prev.jobs.filter(j => !curKeys.has(key(j)));
const siguen = cur.jobs.filter(j => prevKeys.has(key(j)));

console.log(`${prevFile.slice(0, 10)} → ${curFile.slice(0, 10)}`);
console.log(`  total: ${prev.kept} → ${cur.kept}   (${cur.kept - prev.kept >= 0 ? '+' : ''}${cur.kept - prev.kept})`);
console.log(`  nuevas: ${nuevas.length} | desaparecidas: ${cerradas.length} | siguen abiertas: ${siguen.length}`);

const tally = (arr) => arr.reduce((a, j) => { a[j.modality] = (a[j.modality] || 0) + 1; return a; }, {});
if (nuevas.length) {
  console.log(`\n  nuevas por modalidad: ${JSON.stringify(tally(nuevas))}`);
  for (const j of nuevas.slice(0, 12)) {
    console.log(`   + ${j.modality.padEnd(10)} ${j.geo.padEnd(16)} ${j.title.slice(0, 58)} | ${(j.company || '—').slice(0, 22)}`);
  }
  if (nuevas.length > 12) console.log(`   … y ${nuevas.length - 12} más`);
}

// empresas que repiten búsquedas abiertas
const porEmpresa = cur.jobs.filter(j => j.company).reduce((a, j) => {
  const k = j.company.trim(); a[k] = a[k] || []; a[k].push(j); return a;
}, {});
const top = Object.entries(porEmpresa).filter(([, v]) => v.length > 1).sort((a, b) => b[1].length - a[1].length).slice(0, 5);
if (top.length) {
  console.log('\n  empresas con más búsquedas junior abiertas:');
  for (const [emp, list] of top) console.log(`   ${list.length}× ${emp.slice(0, 42)}`);
}
