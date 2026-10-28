import latest from '../data/latest.json';

export type JobRow = {
  title: string;
  company: string;
  geo: string;
  modality: string;
  area: string;
  source: string;
  url: string;
  days: number | null;
  seniority?: string;
};

/**
 * Ofertas para la tabla del panel. Mismo origen que las métricas (`src/data/latest.json`,
 * copiado por el prebuild desde XScraper). Cuando la ingesta escriba en Postgres, esta
 * función pasa a ser una query a `jobs` y las páginas no cambian.
 */
export function getJobs(): JobRow[] {
  return (latest.jobs ?? []) as JobRow[];
}

/** Organización del usuario logueado (la primera membership). Null si no hay. */
export async function currentOrgId(supabase: any): Promise<string | null> {
  const { data } = await supabase.from('memberships').select('org_id').limit(1).maybeSingle();
  return data?.org_id ?? null;
}
