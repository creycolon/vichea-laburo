// Copia el último snapshot de XScraper dentro de la app para que viaje en el build.
// Sin esto, el bundle no lleva datos y la landing muestra ceros en el hosting.
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const src = path.resolve(here, '../../../xscraper/data.json');
const dst = path.resolve(here, '../src/data/latest.json');

try {
  const raw = JSON.parse(fs.readFileSync(src, 'utf8'));
  const slim = {
    generatedAt: raw.generatedAt ?? null,
    total: raw.jobs?.length ?? 0,
    jobs: (raw.jobs ?? []).map((j) => ({
      title: j.title, company: j.company, geo: j.geo, modality: j.modality,
      area: j.area, source: j.source, url: j.url, days: j.days, seniority: j.seniority,
    })),
  };
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, JSON.stringify(slim));
  console.log(`datos sincronizados: ${slim.total} ofertas (${raw.generatedAt})`);
} catch (e) {
  console.warn(`no se pudo leer ${src}: ${e.message}. Se usa el último latest.json conocido.`);
  if (!fs.existsSync(dst)) fs.writeFileSync(dst, JSON.stringify({ generatedAt: null, total: 0, jobs: [] }));
}
