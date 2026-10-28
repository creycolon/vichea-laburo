import fs from 'node:fs';
import path from 'node:path';

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

const EMPTY: Stats = {
  total: 0, ar: 0, latam: 0, global: 0,
  modality: { presencial: 0, híbrido: 0, remoto: 0 },
  companies: 0, updatedAt: null, sources: [],
};

/**
 * Lee el snapshot que produce job-radar. Es un puente temporario: cuando el scraper
 * escriba en Postgres, esta función pasa a ser una query y la landing no cambia.
 */
export function getStats(): Stats {
  const candidates = [
    path.resolve(process.cwd(), '../../job-radar/data.json'),
    path.resolve(process.cwd(), 'job-radar/data.json'),
  ];
  for (const file of candidates) {
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      const jobs: any[] = raw.jobs ?? [];
      const modality = { presencial: 0, híbrido: 0, remoto: 0 } as Record<string, number>;
      for (const j of jobs) modality[j.modality] = (modality[j.modality] ?? 0) + 1;
      return {
        total: jobs.length,
        ar: jobs.filter((j) => j.geo === 'Argentina').length,
        latam: jobs.filter((j) => j.geo === 'LATAM').length,
        global: jobs.filter((j) => j.geo === 'Global / remoto').length,
        modality,
        companies: new Set(jobs.map((j) => j.company).filter(Boolean)).size,
        updatedAt: raw.generatedAt ?? null,
        sources: [...new Set(jobs.map((j) => j.source))].sort(),
      };
    } catch {
      // probamos el siguiente path
    }
  }
  return EMPTY;
}
