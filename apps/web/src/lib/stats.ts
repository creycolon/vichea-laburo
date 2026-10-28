import latest from '../data/latest.json';

export type Stats = {
  total: number;
  ar: number;
  latam: number;
  global: number;
  modality: Record<string, number>;
  companies: number;
  updatedAt: string | null;
  sources: string[];
};

type RawJob = {
  title: string; company: string; geo: string; modality: string;
  area: string; source: string; url: string; days: number | null; seniority?: string;
};

const jobs = (latest.jobs ?? []) as RawJob[];

const modality: Record<string, number> = {};
for (const j of jobs) modality[j.modality] = (modality[j.modality] ?? 0) + 1;

/**
 * Métricas de la landing. Los datos llegan por `src/data/latest.json`, que un paso de
 * prebuild copia desde XScraper: así el bundle es autocontenido y funciona igual en
 * local que en cualquier hosting.
 */
export function getStats(): Stats {
  return {
    total: jobs.length,
    ar: jobs.filter((j) => j.geo === 'Argentina').length,
    latam: jobs.filter((j) => j.geo === 'LATAM').length,
    global: jobs.filter((j) => j.geo === 'Global / remoto').length,
    modality,
    companies: new Set(jobs.map((j) => j.company).filter(Boolean)).size,
    updatedAt: latest.generatedAt,
    sources: [...new Set(jobs.map((j) => j.source))].sort(),
  };
}
