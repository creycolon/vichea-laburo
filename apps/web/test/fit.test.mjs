import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreJob, transparency, EMPTY_PROFILE } from '../src/lib/fit.ts';
import { extractSkills } from '../src/lib/skills.ts';

const job = (over = {}) => ({
  title: 'Desarrollador Junior', company: 'ACME', geo: 'Argentina', modality: 'remoto',
  area: 'Desarrollo', source: 'Computrabajo', days: 2, seniority: 'junior', ...over,
});

test('sin perfil no inventa afinidad', () => {
  const r = scoreJob(job(), EMPTY_PROFILE);
  assert.equal(r.fit, 0);
  assert.equal(r.reasons.length, 0);
});

test('detecta habilidades por palabra completa, sin falsos positivos', () => {
  assert.deepEqual(extractSkills('Buscamos desarrollador React con SQL').sort(), ['datos', 'programacion']);
  assert.deepEqual(extractSkills('Atención al público en gobierno'), []);
  assert.deepEqual(extractSkills('Analista de Power BI y Excel avanzado'), ['datos']);
});

test('con perfil devuelve razones legibles', () => {
  const profile = { ...EMPTY_PROFILE, skills: ['programacion'], modality: 'remoto', geo: 'Argentina' };
  const r = scoreJob(job(), profile);
  assert.ok(r.fit > 60, `esperaba >60, vino ${r.fit}`);
  assert.ok(r.reasons.some((x) => x.includes('programación')));
  assert.ok(r.reasons.some((x) => x.includes('remoto')));
  assert.ok(r.reasons.length <= 4);
});

test('un puesto senior resta y lo dice', () => {
  const profile = { ...EMPTY_PROFILE, skills: ['programacion'] };
  const r = scoreJob(job({ title: 'Tech Lead', seniority: 'lead' }), profile);
  assert.ok(r.reasons.some((x) => x.includes('senior')));
  assert.ok(r.fit < 60);
});

test('modalidad distinta penaliza', () => {
  const profile = { ...EMPTY_PROFILE, skills: ['programacion'], modality: 'presencial' };
  const r = scoreJob(job({ modality: 'remoto' }), profile);
  assert.ok(r.reasons.some((x) => x.includes('remoto, no presencial')));
});

test('el fit siempre queda entre 0 y 100', () => {
  const profile = { ...EMPTY_PROFILE, skills: ['programacion', 'datos'], modality: 'remoto', geo: 'Argentina' };
  for (const j of [job(), job({ days: 300, company: '', seniority: 'desconocida', modality: 'presencial' })]) {
    const { fit } = scoreJob(j, profile);
    assert.ok(fit >= 0 && fit <= 100);
  }
});

test('transparencia marca el aviso fantasma', () => {
  const t = transparency(job({ days: 90 }));
  assert.ok(t.score < 50);
  assert.ok(t.flags.some((f) => f.code === 'fantasma'));
});

test('transparencia premia lo reciente y con empresa identificada', () => {
  const t = transparency(job({ days: 1 }));
  assert.ok(t.score > 70);
  assert.equal(t.flags.filter((f) => f.code === 'anonima').length, 0);
});
