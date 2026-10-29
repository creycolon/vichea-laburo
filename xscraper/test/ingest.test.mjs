import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, locationOf, dedupeHash, slugify, canonicalUrl } from '../src/ingest.mjs';

const job = (over = {}) => ({
  title: 'Desarrollador Junior', company: 'ADN - Recursos Humanos',
  geo: 'Argentina', modality: 'presencial', area: 'Desarrollo',
  source: 'Computrabajo', url: 'https://ar.computrabajo.com/oferta/1',
  days: 0, location: 'Recoleta, Capital Federal', seniority: 'junior', ...over,
});

test('slugify normaliza acentos, mayúsculas y símbolos', () => {
  assert.equal(slugify('ADN - Recursos Humanos'), 'adn-recursos-humanos');
  assert.equal(slugify('Programación  C++'), 'programacion-c');
  assert.equal(slugify(''), 'sin-nombre');
});

test('locationOf distingue CABA, GBA, interior y remoto', () => {
  assert.equal(locationOf(job({ location: 'Palermo, Capital Federal' })).geo_bucket, 'AR-CABA');
  assert.equal(locationOf(job({ location: 'Martínez, Buenos Aires-GBA' })).geo_bucket, 'AR-GBA');
  assert.equal(locationOf(job({ location: 'Córdoba, Córdoba' })).geo_bucket, 'AR');
  assert.equal(locationOf(job({ geo: 'LATAM', location: 'Chile' })).geo_bucket, 'LATAM');
  assert.equal(locationOf(job({ geo: 'Global / remoto', location: 'Worldwide' })).geo_bucket, 'GLOBAL');
});

test('locationOf no devuelve null: el UNIQUE de Postgres no colisiona con NULL', () => {
  const loc = locationOf(job({ location: 'Córdoba' }));
  assert.equal(loc.region, '');
  assert.equal(loc.city, '');
});

test('la misma búsqueda en dos fuentes produce una oferta y dos avistamientos', () => {
  const a = job({ source: 'Computrabajo', url: 'https://a/1' });
  const b = job({ source: 'GetOnBoard', url: 'https://b/2' });
  const plan = buildPlan([a, b]);
  assert.equal(plan.jobs.length, 1, 'una sola oferta canónica');
  assert.equal(plan.records.length, 2, 'dos avistamientos');
  assert.equal(new Set(plan.records.map((r) => r.dedupe_hash)).size, 1);
});

test('empresas parecidas con el mismo slug se unifican', () => {
  const plan = buildPlan([
    job({ company: 'ADN - Recursos Humanos', url: 'https://a/1' }),
    job({ company: 'adn recursos humanos', url: 'https://a/2', title: 'Analista Junior' }),
  ]);
  assert.equal(plan.companies.length, 1);
  assert.equal(plan.companies[0].aliases.length, 2);
  assert.equal(plan.jobs.length, 2, 'son dos búsquedas distintas de la misma empresa');
});

test('el plan es determinístico entre corridas (idempotencia del upsert)', () => {
  const input = [job(), job({ url: 'https://a/2', title: 'Analista Junior' })];
  const one = buildPlan(input);
  const two = buildPlan(input);
  assert.deepEqual(one.jobs.map((j) => j.dedupe_hash), two.jobs.map((j) => j.dedupe_hash));
  assert.deepEqual(one.companies, two.companies);
});

test('la modalidad se mapea al enum de Postgres', () => {
  const plan = buildPlan([
    job({ modality: 'híbrido', title: 'Dev Junior A', url: 'https://a/1' }),
    job({ modality: 'presencial', title: 'Dev Junior B', url: 'https://a/2' }),
    job({ modality: 'remoto', title: 'Dev Junior C', url: 'https://a/3' }),
  ]);
  assert.deepEqual(plan.jobs.map((j) => j.modality).sort(), ['hibrido', 'presencial', 'remoto']);
});

test('la modalidad NO entra en el hash: dos portales que la etiquetan distinto son la misma oferta', () => {
  const plan = buildPlan([
    job({ modality: 'presencial', source: 'Computrabajo', url: 'https://a/1' }),
    job({ modality: 'remoto', source: 'GetOnBoard', url: 'https://b/2' }),
  ]);
  assert.equal(plan.jobs.length, 1);
  assert.equal(plan.records.length, 2);
  assert.equal(plan.jobs[0].modality, 'presencial', 'gana la primera fuente que la vio');
});

test('una modalidad desconocida no rompe el enum', () => {
  const plan = buildPlan([job({ modality: 'teletrabajo' })]);
  assert.equal(plan.jobs[0].modality, 'desconocida');
});

test('dedupeHash cambia si cambia la geografía', () => {
  const a = dedupeHash('adn', 'Desarrollador Junior', 'AR-CABA');
  const b = dedupeHash('adn', 'Desarrollador Junior', 'LATAM');
  assert.notEqual(a, b);
  assert.equal(a.length, 40);
});

test('canonicalUrl descarta el fragmento que cambia por posición en el listado', () => {
  const a = canonicalUrl('https://ar.computrabajo.com/x/oferta-ABC#lc=ListOffers-Score4-1');
  const b = canonicalUrl('https://ar.computrabajo.com/x/oferta-ABC#lc=ListOffers-Score4-9');
  assert.equal(a, b);
  assert.ok(!a.includes('#'));
});

test('canonicalUrl normaliza el host a minúsculas (RemoteOK)', () => {
  const a = canonicalUrl('https://remoteOK.com/remote-jobs/x-1');
  const b = canonicalUrl('https://remoteok.com/remote-jobs/x-1');
  assert.equal(a, b);
});

test('canonicalUrl quita parámetros de tracking y es idempotente', () => {
  const u = canonicalUrl('https://x.com/a?utm_source=news&id=7&lc=3');
  assert.ok(!u.includes('utm_source'));
  assert.ok(!u.includes('lc='));
  assert.ok(u.includes('id=7'));
  assert.equal(canonicalUrl(u), u);
});
