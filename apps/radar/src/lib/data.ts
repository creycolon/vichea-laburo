import current from '../data/current.json';
import previous from '../data/previous.json';

export type Job = {
  title: string; company: string; geo: string; modality: string;
  area: string; seniority?: string; source: string; url: string; days: number | null;
};

const cur = current as { generatedAt: string | null; total: number; errors: string[]; jobs: Job[] };
const prev = (previous as unknown as { date?: string; jobs?: Job[] }) ?? {};

const key = (j: Job) => j.url.replace(/[?#].*$/, '').replace(/^https?:\/\/([^/]+)/i, (m) => m.toLowerCase());

const count = (arr: Job[], f: (j: Job) => string) =>
  arr.reduce((a, j) => { const k = f(j) || '—'; a[k] = (a[k] ?? 0) + 1; return a; }, {} as Record<string, number>);

export const radar = {
  generatedAt: cur.generatedAt,
  total: cur.jobs.length,
  errors: cur.errors,
  jobs: cur.jobs,
  byModality: count(cur.jobs, (j) => j.modality),
  byArea: count(cur.jobs, (j) => j.area),
  byGeo: count(cur.jobs, (j) => j.geo),
  bySource: count(cur.jobs, (j) => j.source),
  companiesTotal: new Set(cur.jobs.map((j) => j.company).filter(Boolean)).size,
  companies: Object.entries(count(cur.jobs.filter((j) => j.company), (j) => j.company))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12),
  diff: (() => {
    const before = new Set((prev.jobs ?? []).map(key));
    const now = new Set(cur.jobs.map(key));
    return {
      date: prev.date ?? null,
      nuevas: cur.jobs.filter((j) => !before.has(key(j))).length,
      cerradas: (prev.jobs ?? []).filter((j) => !now.has(key(j))).length,
      totalAnterior: prev.jobs?.length ?? 0,
    };
  })(),
};
