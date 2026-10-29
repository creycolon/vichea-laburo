// Copia el último estado y el snapshot anterior de XScraper dentro de la app.
// Sin esto el build no lleva datos y el útil muestra ceros.
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const src = path.resolve(here, '../../../xscraper');
const out = path.resolve(here, '../src/data');
fs.mkdirSync(out, { recursive: true });

const slim = (j) => ({
  title: j.title, company: j.company, geo: j.geo, modality: j.modality,
  area: j.area, seniority: j.seniority, source: j.source, url: j.url, days: j.days,
});

try {
  const cur = JSON.parse(fs.readFileSync(path.join(src, 'data.json'), 'utf8'));
  fs.writeFileSync(path.join(out, 'current.json'), JSON.stringify({
    generatedAt: cur.generatedAt, total: cur.jobs?.length ?? 0,
    errors: cur.errors ?? [], jobs: (cur.jobs ?? []).map(slim),
  }));

  const hist = fs.readdirSync(path.join(src, 'history')).filter((f) => f.endsWith('.json')).sort();
  const prevFile = hist[hist.length - 2];
  if (prevFile) {
    const prev = JSON.parse(fs.readFileSync(path.join(src, 'history', prevFile), 'utf8'));
    fs.writeFileSync(path.join(out, 'previous.json'), JSON.stringify({
      date: prevFile.replace('.json', ''), generatedAt: prev.generatedAt,
      total: prev.kept ?? 0, jobs: (prev.jobs ?? []).map(slim),
    }));
  } else {
    fs.unlinkSync(path.join(out, 'previous.json'));
  }
  console.log(`radar: ${cur.jobs?.length ?? 0} ofertas · comparación con ${prevFile ?? '—'}`);
} catch (e) {
  console.warn(`no se pudo leer ${src}: ${e.message}`);
  fs.writeFileSync(path.join(out, 'current.json'), JSON.stringify({ generatedAt: null, total: 0, errors: [], jobs: [] }));
}
