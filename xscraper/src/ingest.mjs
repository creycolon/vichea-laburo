// Ingesta: convierte las ofertas normalizadas de XScraper en un plan de escritura
// para Postgres, y lo aplica contra Supabase cuando hay credenciales.
//
// El plan es puro (sin I/O) para poder testearlo y para `--dry-run`: muestra exactamente
// qué se insertaría, sin tocar la base.

import { createHash } from 'node:crypto';

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
        source_slug: j.source ? slugify(j.source) : sourceSlug,
        source_url: j.url,
        posted_days_ago: j.days ?? null,
      };
      seenHash.set(hash, row);
      rows.push(row);
    }
    // Cada avistamiento, aunque la oferta canónica ya exista (otra fuente).
    records.push({
      dedupe_hash: hash,
      source_slug: j.source ? slugify(j.source) : sourceSlug,
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
