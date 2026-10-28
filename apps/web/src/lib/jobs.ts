import fs from 'node:fs';
import path from 'node:path';

export type JobRow = {
  title: string;
  company: string;
  geo: string;
  modality: string;
  area: string;
  source: string;
  url: string;
  days: number | null;
};

/**
 * Lee las ofertas del snapshot del scraper. Cuando la ingesta escriba en Postgres,
 * esta función se reemplaza por una query a `jobs` y el resto de la app no cambia.
 */
export function getJobs(): JobRow[] {
  const candidates = [
    path.resolve(process.cwd(), '../../job-radar/data.json'),
    path.resolve(process.cwd(), 'job-radar/data.json'),
  ];
  for (const file of candidates) {
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      return (raw.jobs ?? []).map((j: any) => ({
        title: j.title ?? '',
        company: j.company ?? '',
        geo: j.geo ?? '',
        modality: j.modality ?? '',
        area: j.area ?? '',
        source: j.source ?? '',
        url: j.url ?? '#',
        days: typeof j.days === 'number' ? j.days : null,
      }));
    } catch {
      // siguiente candidato
    }
  }
  return [];
}

/** Organización del usuario logueado (la primera membership). Null si no hay. */
export async function currentOrgId(supabase: any): Promise<string | null> {
  const { data } = await supabase.from('memberships').select('org_id').limit(1).maybeSingle();
  return data?.org_id ?? null;
}
