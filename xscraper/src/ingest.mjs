// Ingesta: convierte las ofertas normalizadas de XScraper en un plan de escritura
// para Postgres, y lo aplica contra Supabase cuando hay credenciales.
//
// El plan es puro (sin I/O) para poder testearlo y para `--dry-run`: muestra exactamente
// qué se insertaría, sin tocar la base.

import { createHash } from 'node:crypto';

/** Nombre de fuente del scraper -> slug que ya existe en la tabla `sources`. */
export const SOURCE_SLUGS = {
  Computrabajo: 'computrabajo-ar',
  GetOnBoard: 'getonboard',
  VacantesDigitales: 'vacantesdigitales',
  Remotive: 'remotive',
  RemoteOK: 'remoteok',
  WWR: 'wwr',
  Himalayas: 'himalayas',
  Arbeitnow: 'arbeitnow',
};

/** Slug estable para empresas, ubicaciones y fuentes. */
export const slugify = (s = '') =>
  String(s)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'sin-nombre';

/** Bucket geográfico -> (country, region, city, geo_bucket). */
export function locationOf(job) {
  const geo = job.geo ?? 'Global / remoto';
  if (geo === 'Argentina') {
    const loc = (job.location ?? '').toLowerCase();
    const city = /caba|capital federal/.test(loc) ? 'CABA'
      : /gba|buenos aires-gba/.test(loc) ? 'GBA'
      : '';
    return { country: 'AR', region: '', city, geo_bucket: city ? `AR-${city}` : 'AR' };
  }
  if (geo === 'LATAM') return { country: 'XX', region: 'LATAM', city: '', geo_bucket: 'LATAM' };
  return { country: 'XX', region: '', city: '', geo_bucket: 'GLOBAL' };
}

/** Hash canónico de la oferta: lo que decide si dos avisos son la misma búsqueda. */
export const dedupeHash = (companySlug, title, geoBucket) =>
  createHash('sha1')
    .update(`${companySlug}|${slugify(title)}|${geoBucket}`)
    .digest('hex');

const MODALITY = { remoto: 'remoto', 'híbrido': 'hibrido', presencial: 'presencial' };
const SENIORITY = ['trainee', 'junior', 'mid', 'senior', 'lead', 'director'];

/**
 * Construye el plan de escritura a partir de las ofertas ya filtradas.
 * Devuelve entidades únicas y filas listas para upsert, sin ids de base.
 */
export function buildPlan(jobs, { sourceSlug = 'xscraper' } = {}) {
  const companies = new Map();   // slug -> { slug, name, aliases:Set }
  const locations = new Map();   // geo_bucket|city -> row
  const rows = [];               // ofertas canónicas
  const records = [];            // avistamientos por fuente
  const seenHash = new Map();    // dedupe_hash -> row

  for (const j of jobs) {
    const companyName = (j.company ?? '').trim();
    const companySlug = slugify(companyName || 'sin-empresa');
    if (companyName) {
      if (!companies.has(companySlug)) companies.set(companySlug, { slug: companySlug, name: companyName, aliases: new Set() });
      companies.get(companySlug).aliases.add(companyName);
    }

    const loc = locationOf(j);
    const locKey = `${loc.country}|${loc.region}|${loc.city}`;
    if (!locations.has(locKey)) locations.set(locKey, loc);

    const hash = dedupeHash(companySlug, j.title, loc.geo_bucket);
    const modality = MODALITY[j.modality] ?? 'desconocida';
    const seniority = SENIORITY.includes(j.seniority) ? j.seniority : 'desconocida';

    if (!seenHash.has(hash)) {
      const row = {
        dedupe_hash: hash,
        title: j.title,
        company_slug: companySlug,
        location_key: locKey,
        modality,
        seniority,
        area: j.area ?? null,
        status: 'open',
        source_slug: SOURCE_SLUGS[j.source] ?? slugify(j.source ?? sourceSlug),
        source_url: j.url,
        posted_days_ago: j.days ?? null,
      };
      seenHash.set(hash, row);
      rows.push(row);
    }
    // Cada avistamiento, aunque la oferta canónica ya exista (otra fuente).
    records.push({
      dedupe_hash: hash,
      source_slug: SOURCE_SLUGS[j.source] ?? slugify(j.source ?? sourceSlug),
      url: j.url,
      external_id: null,
    });
  }

  return {
    companies: [...companies.values()].map((c) => ({ ...c, aliases: [...c.aliases] })),
    locations: [...locations.values()],
    jobs: rows,
    records,
    // Las fuentes salen del catálogo que ya siembra db/supabase.sql
    sourceSlugs: [...new Set(records.map((r) => r.source_slug))],
  };
}

/** Resumen legible del plan (para --dry-run y para los logs de la corrida). */
export function summarize(plan) {
  const byModality = plan.jobs.reduce((a, j) => { a[j.modality] = (a[j.modality] ?? 0) + 1; return a; }, {});
  const byGeo = plan.locations.reduce((a, l) => { a[l.geo_bucket] = (a[l.geo_bucket] ?? 0) + 1; return a; }, {});
  return [
    `empresas:   ${plan.companies.length}`,
    `ubicaciones:${plan.locations.length} (${Object.keys(byGeo).join(', ')})`,
    `ofertas:    ${plan.jobs.length} ${JSON.stringify(byModality)}`,
    `avistamientos: ${plan.records.length}`,
    `fuentes:    ${plan.sourceSlugs.join(', ')}`,
  ].join('\n  ');
}

// ---------------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------------

const chunk = (arr, n) => arr.reduce((a, _, i) => (i % n ? a : [...a, arr.slice(i, i + n)]), []);

/**
 * Aplica el plan contra Supabase con la service_role (bypassa RLS).
 * Idempotente: todas las escrituras son upsert por clave natural, así que correrla
 * dos veces seguidas no duplica nada.
 */
export async function applyPlan(supabase, plan, { log = () => {} } = {}) {
  const stats = { companies: 0, locations: 0, jobs: 0, newJobs: 0, records: 0, runs: 0 };

  // 1. fuentes ya sembradas
  const { data: srcRows, error: srcErr } = await supabase.from('sources').select('id,slug');
  if (srcErr) throw new Error(`sources: ${srcErr.message}`);
  const srcId = new Map((srcRows ?? []).map((r) => [r.slug, r.id]));
  const missing = plan.sourceSlugs.filter((s) => !srcId.has(s));
  if (missing.length) throw new Error(`fuentes no sembradas en la base: ${missing.join(', ')}`);

  // 2. empresas
  if (plan.companies.length) {
    const rows = plan.companies.map((c) => ({ slug: c.slug, name: c.name }));
    const { error } = await supabase.from('companies').upsert(rows, { onConflict: 'slug' });
    if (error) throw new Error(`companies: ${error.message}`);
    const { data } = await supabase.from('companies').select('id,slug').in('slug', rows.map((r) => r.slug));
    stats.companies = (data ?? []).length;
    for (const r of data ?? []) srcId.set(`company:${r.slug}`, r.id);
  }

  // 3. ubicaciones (region y city NOT NULL: el upsert colisiona bien)
  if (plan.locations.length) {
    const { error } = await supabase.from('locations').upsert(plan.locations, { onConflict: 'country,region,city' });
    if (error) throw new Error(`locations: ${error.message}`);
    const { data } = await supabase
      .from('locations').select('id,country,region,city')
      .in('country', [...new Set(plan.locations.map((l) => l.country))]);
    stats.locations = (data ?? []).length;
    for (const r of data ?? []) srcId.set(`loc:${r.country}|${r.region}|${r.city}`, r.id);
  }

  // 4. qué ofertas ya existían (para emitir el evento 'opened' sólo una vez)
  const hashes = plan.jobs.map((j) => j.dedupe_hash);
  const existing = new Set();
  for (const part of chunk(hashes, 100)) {
    const { data, error } = await supabase.from('jobs').select('dedupe_hash').in('dedupe_hash', part);
    if (error) throw new Error(`jobs(pre): ${error.message}`);
    for (const r of data ?? []) existing.add(r.dedupe_hash);
  }

  // 5. ofertas canónicas
  if (plan.jobs.length) {
    const rows = plan.jobs.map((j) => ({
      dedupe_hash: j.dedupe_hash,
      title: j.title,
      company_id: srcId.get(`company:${j.company_slug}`) ?? null,
      location_id: srcId.get(`loc:${j.location_key}`) ?? null,
      modality: j.modality,
      seniority: j.seniority,
      area: j.area,
      status: 'open',
      last_seen_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from('jobs').upsert(rows, { onConflict: 'dedupe_hash' });
    if (error) throw new Error(`jobs: ${error.message}`);
    stats.jobs = rows.length;
  }

  // 6. avistamientos (una fila por URL; el unique(url) hace el trabajo)
  if (plan.records.length) {
    const rows = [...new Map(plan.records.map((r) => [r.url, r])).values()]
      .filter((r) => srcId.has(r.source_slug))
      .map((r) => ({
        job_id: null, // se resuelve abajo
        source_id: srcId.get(r.source_slug),
        url: r.url,
        dedupe_hash: r.dedupe_hash,
      }));
    const { data: jobRows, error: jobErr } = await supabase
      .from('jobs').select('id,dedupe_hash').in('dedupe_hash', [...new Set(rows.map((r) => r.dedupe_hash))]);
    if (jobErr) throw new Error(`jobs(map): ${jobErr.message}`);
    const jobId = new Map((jobRows ?? []).map((r) => [r.dedupe_hash, r.id]));
    const payload = rows.map(({ dedupe_hash, ...r }) => ({ ...r, job_id: jobId.get(dedupe_hash) })).filter((r) => r.job_id);
    if (payload.length) {
      const { error } = await supabase.from('job_source_records').upsert(payload, { onConflict: 'url' });
      if (error) throw new Error(`job_source_records: ${error.message}`);
      stats.records = payload.length;
    }
  }

  // 7. eventos: sólo para las que aparecen por primera vez
  const nuevas = plan.jobs.filter((j) => !existing.has(j.dedupe_hash));
  stats.newJobs = nuevas.length;
  if (nuevas.length) {
    const { data: jobRows } = await supabase.from('jobs').select('id,dedupe_hash')
      .in('dedupe_hash', nuevas.map((j) => j.dedupe_hash));
    const events = (jobRows ?? []).map((r) => ({ job_id: r.id, kind: 'opened' }));
    if (events.length) {
      const { error } = await supabase.from('job_events').insert(events);
      if (error) throw new Error(`job_events: ${error.message}`);
    }
  }

  // 8. corridas por fuente
  for (const slug of plan.sourceSlugs) {
    const fetched = plan.records.filter((r) => r.source_slug === slug).length;
    const { error } = await supabase.from('crawl_runs').insert({
      source_id: srcId.get(slug), status: 'ok', fetched, kept: fetched,
      finished_at: new Date().toISOString(),
    });
    if (!error) stats.runs++;
  }

  log(JSON.stringify(stats));
  return stats;
}
