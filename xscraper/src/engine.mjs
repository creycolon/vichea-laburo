// XScraper — releva fuentes públicas de empleo junior/trainee, filtra y genera una página.
import fs from 'node:fs';
import path from 'node:path';
import { JUNIOR, SENIOR, FORMACION, classify, geo, clean, seniorityOf, dedupeKey } from './normalize.mjs';

// Out dir: la raíz de xscraper (este archivo vive en src/)
const OUT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36';
const TIMEOUT = 25_000;

async function grab(url, kind = 'json') {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'user-agent': UA, accept: '*/*' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return kind === 'json' ? await r.json() : await r.text();
  } finally { clearTimeout(t); }
}

const jobs = [];
const errors = [];

// ---------- Remotive ----------
try {
  const d = await grab('https://remotive.com/api/remote-jobs?limit=300');
  for (const j of d.jobs ?? []) jobs.push({
    source: 'Remotive', title: j.title, company: j.company_name, url: j.url, modality: 'remoto',
    location: j.candidate_required_location || 'Worldwide', date: j.publication_date,
    tags: j.tags ?? [], text: clean(j.description).slice(0, 900), salary: j.salary || '',
  });
} catch (e) { errors.push(`Remotive: ${e.message}`); }

// ---------- RemoteOK ----------
try {
  const d = await grab('https://remoteok.com/api');
  for (const j of Array.isArray(d) ? d.slice(1) : []) jobs.push({
    source: 'RemoteOK', title: j.position, company: j.company, url: j.url || `https://remoteok.com/remote-jobs/${j.slug}`, modality: 'remoto',
    location: j.location || 'Worldwide', date: j.date, tags: j.tags ?? [],
    text: clean(j.description).slice(0, 900), salary: j.salary_min ? `$${j.salary_min}–${j.salary_max}` : '',
  });
} catch (e) { errors.push(`RemoteOK: ${e.message}`); }

// ---------- Arbeitnow ----------
try {
  const d = await grab('https://www.arbeitnow.com/api/job-board-api');
  for (const j of d.data ?? []) jobs.push({
    source: 'Arbeitnow', title: j.title, company: j.company_name, url: j.url, modality: j.remote ? 'remoto' : 'presencial',
    location: j.location || '', date: j.created_at ? new Date(j.created_at * 1000).toISOString() : '',
    tags: j.tags ?? [], text: clean(j.description).slice(0, 900), remote: !!j.remote,
  });
} catch (e) { errors.push(`Arbeitnow: ${e.message}`); }

// ---------- Himalayas ----------
try {
  const d = await grab('https://himalayas.app/jobs/api?limit=200');
  for (const j of d.jobs ?? []) jobs.push({
    source: 'Himalayas', title: j.title, company: j.companyName, modality: 'remoto',
    url: j.applicationLink || `https://himalayas.app/companies/${j.companySlug}/jobs/${j.slug ?? ''}`,
    location: (j.locationRestrictions ?? []).join(', ') || 'Worldwide',
    date: j.pubDate ? new Date(j.pubDate * 1000).toISOString() : '',
    tags: j.categories ?? [], text: clean(j.excerpt || j.description || '').slice(0, 900), remote: true,
  });
} catch (e) { errors.push(`Himalayas: ${e.message}`); }

// ---------- We Work Remotely (RSS) ----------
const WWR = ['remote-programming-jobs', 'remote-design-jobs', 'remote-devops-sysadmin-jobs', 'remote-product-jobs', 'remote-customer-support-jobs'];
for (const cat of WWR) {
  try {
    const xml = await grab(`https://weworkremotely.com/categories/${cat}.rss`, 'text');
    for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
      const it = m[1];
      const pick = (tag) => (it.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1] ?? '').replace(/<!\[CDATA\[|\]\]>/g, '').trim();
      const [company, ...rest] = pick('title').split(':');
      jobs.push({
        source: 'WWR', title: rest.join(':').trim() || pick('title'), company: company.trim(), modality: 'remoto',
        url: pick('link'), location: pick('region') || 'Anywhere', date: pick('pubDate'),
        tags: [pick('category')], text: clean(pick('description')).slice(0, 900),
      });
    }
  } catch (e) { errors.push(`WWR ${cat}: ${e.message}`); }
}

// ---------- GetOnBoard (LATAM: AR/CL/CO/MX/PE) ----------
// Dos vías: listados por categoría (volumen, incluye híbrido y presencial) y búsquedas
// por país (Argentina, que casi no aparece en las categorías globales).
const MODALITY = { fully_remote: 'remoto', remote_local: 'remoto', hybrid: 'híbrido', no_remote: 'presencial', on_site: 'presencial' };
const gobById = new Map();

function addGob(it) {
  if (gobById.has(it.id)) return;
  const a = it.attributes;
  gobById.set(it.id, {
    source: 'GetOnBoard', title: a.title, company: '', companyId: a.company?.data?.id,
    url: it.links?.public_url,
    location: (a.countries ?? []).join(', ') || '',
    modality: MODALITY[a.remote_modality] ?? 'remoto',
    date: a.published_at ? new Date(a.published_at * 1000).toISOString() : '',
    tags: [], text: '', remote: a.remote_modality === 'fully_remote',
  });
}

const GOB_CATEGORIES = ['programming', 'machine-learning-ai', 'data-science-analytics', 'design-ux',
  'sysadmin-devops-qa', 'mobile-developer', 'customer-support', 'technical-support', 'sales',
  'digital-marketing', 'operations-management'];
for (const cat of GOB_CATEGORIES) {
  try {
    const d = await grab(`https://www.getonbrd.com/api/v0/categories/${cat}/jobs?per_page=100`);
    for (const it of d.data ?? []) addGob(it);
  } catch (e) { errors.push(`GetOnBoard ${cat}: ${e.message}`); }
}

const GOB_AR = ['junior', 'trainee', 'pasantia', 'sin experiencia', 'becario', 'primer empleo'];
for (const q of GOB_AR) {
  try {
    const d = await grab(`https://www.getonbrd.com/api/v0/search/jobs?query=${encodeURIComponent(q)}&countries=Argentina&per_page=60`);
    for (const it of d.data ?? []) addGob(it);
  } catch (e) { errors.push(`GetOnBoard AR ${q}: ${e.message}`); }
}
jobs.push(...gobById.values());

// ---------- Computrabajo Argentina (HTML) ----------
// No hay API, pero el listado es HTML del servidor y la modalidad viene en la ruta:
//   /trabajo-de-<query>-presencial | -hibrido | -en-remoto
const CT_VARIANTS = [['-presencial', 'presencial'], ['-hibrido', 'híbrido'], ['-en-remoto', 'remoto']];
const CT_QUERIES = ['junior', 'trainee', 'pasantia', 'pasante'];
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const dec = (s = '') => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

const ageDays = (txt) => {
  const t = dec(txt).toLowerCase();
  const n = Number(t.match(/(\d+)/)?.[1] ?? 0);
  if (/hora|minuto|reci[eé]n|hoy/.test(t)) return 0;
  if (/ayer/.test(t)) return 1;
  if (/d[ií]a/.test(t)) return n;
  if (/semana/.test(t)) return n * 7;
  if (/mes/.test(t)) return n * 30;
  return null;
};

const ctSeen = new Map();
for (const [suffix, modality] of CT_VARIANTS) {
  for (const q of CT_QUERIES) {
    const url = `https://ar.computrabajo.com/trabajo-de-${q}${suffix}`;
    try {
      const html = await grab(url, 'text');
      for (const m of html.matchAll(/<article class="box_offer[\s\S]*?<\/article>/g)) {
        const card = m[0];
        const id = card.match(/data-id='([0-9A-F]+)'/)?.[1];
        const link = card.match(/<a class="js-o-link[^"]*" href="([^"]+)"[\s\S]*?>([\s\S]*?)<\/a>/);
        if (!id || !link || ctSeen.has(id)) continue;
        const company = card.match(/offer-grid-article-company-url[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? '';
        const loc = card.match(/<span class="mr10">\s*([\s\S]*?)\s*<\/span>/)?.[1] ?? '';
        const when = card.match(/<p class="fs13 fc_aux mt15">\s*([\s\S]*?)\s*<\/p>/)?.[1] ?? '';
        const d = ageDays(when);
        ctSeen.set(id, {
          source: 'Computrabajo', title: dec(link[2]), company: dec(company),
          url: link[1].startsWith('http') ? link[1] : `https://ar.computrabajo.com${link[1]}`,
          location: dec(loc), modality,
          date: d === null ? '' : new Date(Date.now() - d * 864e5).toISOString(),
          tags: [], text: '', remote: modality === 'remoto',
        });
      }
    } catch (e) { errors.push(`Computrabajo ${q}${suffix}: ${e.message}`); }
    await wait(400);
  }
}
jobs.push(...ctSeen.values());

// ---------- Vacantes Digitales (API pública LATAM, sin auth) ----------
// /api/vacancies trae campos estructurados: job_location_type (TELECOMMUTE/ONSITE/HYBRID),
// address_country (AR/CL/MX/...), experience y date_posted_iso. El filtro ?experience sí
// funciona (8.615 total → 863 junior); ?location_type en cambio se ignora.
const VD_MOD = { TELECOMMUTE: 'remoto', ONSITE: 'presencial', HYBRID: 'híbrido' };
const VD_LATAM = new Set(['MX', 'CL', 'CO', 'PE', 'EC', 'UY', 'PY', 'BO', 'VE', 'GT', 'CR', 'PA', 'DO', 'BR', 'AR']);
const vdGeo = (v, t) => {
  const c = v.address_country;
  const s = t.toLowerCase();
  if (c === 'AR') return 'Argentina';
  if (c && VD_LATAM.has(c)) return 'LATAM';
  if (/argentin|caba|buenos aires|mendoza|c[oó]rdoba|rosario/.test(s)) return 'Argentina';
  if (/latam|latinoam|latin america/.test(s)) return 'LATAM';
  if (/per[uú]|chile|santiago|colombia|bogot|m[eé]xico|cdmx|guadalajara|monterrey|ecuador|guatemala|costa rica|panam[aá]|uruguay|paraguay|bolivia|venezuela/.test(s)) return 'LATAM';
  return 'Global / remoto';
};
const vdMod = (v, t) => VD_MOD[v.job_location_type] ?? (/h[ií]brido|hybrid/.test(t.toLowerCase()) ? 'híbrido'
  : /presencial|onsite/.test(t.toLowerCase()) ? 'presencial' : 'remoto');

for (let page = 1; page <= 20; page++) {
  try {
    const d = await grab(`https://vacantesdigitales.com/api/vacancies?experience=junior&limit=100&page=${page}`);
    const items = d.data ?? [];
    if (!items.length) break;
    for (const v of items) {
      const t = v.title ?? '';
      jobs.push({
        source: 'VacantesDigitales', title: t, company: v.company?.name ?? '',
        url: v.post_url || `https://vacantesdigitales.com/empleo-digital/${v.slug ?? ''}`,
        location: v.address_locality || v.address_country || 'LATAM',
        modality: vdMod(v, t), date: v.date_posted_iso || v.post_date || '',
        tags: v.keywords ?? [], text: '', remote: vdMod(v, t) === 'remoto',
        geoFixed: vdGeo(v, t), juniorOk: v.experience === 'junior',
      });
    }
    if ((d.pagination?.page ?? 1) >= (d.pagination?.pages ?? 1)) break;
  } catch (e) { errors.push(`VacantesDigitales p${page}: ${e.message}`); break; }
}

// ---------- filtrar ----------
const seen = new Set();
const picked = [];
for (const j of jobs) {
  if (!j.title || !j.url) continue;
  const hay = `${j.title} ${j.tags.join(' ')} ${j.text}`;
  const titleHit = JUNIOR.test(j.title) || JUNIOR.test(j.tags.join(' '));
  const form = FORMACION.test(j.title) || FORMACION.test(j.tags.join(' '));
  if (SENIOR.test(j.title)) continue;                 // un "Junior" no dice Director ni Manager
  if (!titleHit && !form && !j.juniorOk) continue;      // juniorOk: la fuente ya lo clasificó como junior

  const key = dedupeKey(j.company, j.title, geo(j.location, j.remote));
  if (seen.has(key)) continue;
  seen.add(key);

  const g = j.geoFixed ?? geo(j.location, j.remote);
  if (g === 'Otra') continue;                          // fuera de los 3 alcances pedidos
  const ageDays = j.date ? Math.round((Date.now() - Date.parse(j.date)) / 864e5) : null;
  if (ageDays !== null && ageDays > 90) continue;      // avisos viejos: ya no sirven
  picked.push({
    ...j,
    text: undefined,
    area: classify(`${j.title} ${j.tags.join(' ')}`),
    seniority: seniorityOf(`${j.title} ${j.tags.join(' ')}`),
    geo: g,
    modality: j.modality ?? 'remoto',
    kind: form ? 'formacion' : 'oferta',
    confidence: titleHit || form || j.juniorOk ? 'alta' : 'media',
    days: j.date ? Math.max(0, Math.round((Date.now() - Date.parse(j.date)) / 864e5)) : null,
  });
}

const rank = { Argentina: 0, LATAM: 1, 'Global / remoto': 2, Otra: 3 };
picked.sort((a, b) => (rank[a.geo] - rank[b.geo]) || ((a.days ?? 99) - (b.days ?? 99)));

// GetOnBoard no trae el nombre de la empresa en el listado: se resuelve solo para las que quedaron
for (const j of picked.filter(p => p.companyId && !p.company)) {
  try {
    const c = await grab(`https://www.getonbrd.com/api/v0/companies/${j.companyId}`);
    j.company = c?.data?.attributes?.name ?? '';
  } catch { /* se muestra sin empresa */ }
}

const data = {
  generatedAt: new Date().toISOString(),
  total: jobs.length,
  kept: picked.length,
  errors,
  counts: {
    oferta: picked.filter(p => p.kind === 'oferta').length,
    formacion: picked.filter(p => p.kind === 'formacion').length,
    alta: picked.filter(p => p.confidence === 'alta').length,
  },
  jobs: picked,
};

fs.writeFileSync(path.join(OUT_DIR, 'data.json'), JSON.stringify(data, null, 2));

// snapshot diario: un archivo por día, para poder comparar y construir serie temporal
const histDir = path.join(OUT_DIR, 'history');
fs.mkdirSync(histDir, { recursive: true });
const day = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path.join(histDir, `${day}.json`), JSON.stringify({
  date: day,
  generatedAt: data.generatedAt,
  total: data.total,
  kept: data.kept,
  counts: data.counts,
  bySource: Object.fromEntries([...new Set(picked.map(p => p.source))].map(s => [s, picked.filter(p => p.source === s).length])),
  byGeo: Object.fromEntries([...new Set(picked.map(p => p.geo))].map(g => [g, picked.filter(p => p.geo === g).length])),
  byModality: Object.fromEntries([...new Set(picked.map(p => p.modality))].map(m => [m, picked.filter(p => p.modality === m).length])),
  jobs: picked.map(({ title, company, url, geo, modality, area, source, days }) => ({ title, company, url, geo, modality, area, source, days })),
}, null, 2));
const tpl = fs.readFileSync(path.join(OUT_DIR, 'template.html'), 'utf8');
fs.writeFileSync(path.join(OUT_DIR, 'index.html'), tpl.replace('/*__DATA__*/', JSON.stringify(data)));
console.log(`fuentes: ${jobs.length} crudas → ${picked.length} tras filtro (${data.counts.alta} de alta confianza)`);
if (errors.length) console.log('avisos:', errors.join(' | '));
