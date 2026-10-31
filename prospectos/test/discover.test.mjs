import test from 'node:test';
import assert from 'node:assert/strict';
import { clasificar, esBuscador, normalizar, fusionar, estimar } from '../discover.mjs';

test('clasifica una persona por su rol en la bio', () => {
  assert.equal(clasificar({ name: 'Ana', description: 'Recruiter IT | Talent Acquisition' }), 'persona');
});

test('clasifica una consultora como empresa', () => {
  assert.equal(
    clasificar({ name: 'ACME', description: 'Consultora de RRHH especializada en selección de personal' }),
    'empresa',
  );
});

test('clasifica una comunidad como grupo', () => {
  assert.equal(
    clasificar({ name: 'Empleos IT', description: 'Comunidad de empleos IT. Bolsa de trabajo y vacantes' }),
    'grupo',
  );
});

test('usa el tipo de cuenta de X como señal de empresa', () => {
  assert.equal(clasificar({ name: 'Acme', description: '', professional: { professional_type: 'Business' } }), 'empresa');
});

test('sin señales queda desconocido', () => {
  assert.equal(clasificar({ name: 'xyz', description: 'hola' }), 'desconocido');
});

test('no confunde "hr" dentro de otras palabras con RRHH', () => {
  assert.equal(clasificar({ name: 'xyz', description: 'through three thrilling things' }), 'desconocido');
  assert.equal(clasificar({ name: 'Ana', description: 'HR Business Partner' }), 'persona');
});

test('detecta cuentas que buscan trabajo', () => {
  assert.equal(esBuscador('Open to work · Frontend dev', []), true);
  assert.equal(esBuscador('Reclutadora IT', []), false);
  assert.equal(esBuscador('Buscando empleo', ['buscando empleo']), true);
});

test('normaliza un usuario de twitter-user-scraper', () => {
  const c = normalizar(
    {
      userName: '@AnaRRHH',
      name: 'Ana RRHH',
      description: 'Reclutadora IT',
      location: 'CABA',
      followers: 1200,
      canDm: true,
      entities: { url: { urls: [{ expanded_url: 'https://ana.dev' }] } },
    },
    { rubro: 'rrhh', excluir: [], fuente: 'perfil' },
  );
  assert.equal(c.handle, 'anarrhh');
  assert.equal(c.tipo, 'persona');
  assert.equal(c.web, 'https://ana.dev');
  assert.equal(c.seguidores, 1200);
  assert.deepEqual(c.rubros, ['rrhh']);
  assert.deepEqual(c.fuentes, ['perfil']);
});

test('fusiona sin pisar datos buenos y acumula rubros', () => {
  const a = normalizar({ userName: 'ana', description: 'Recruiter' }, { rubro: 'rrhh', fuente: 'tuit' });
  const b = normalizar({ userName: 'ana', description: 'Recruiter IT', followers: 99 }, { rubro: 'rrhh-tech', fuente: 'perfil' });
  const c = fusionar(a, b);
  assert.equal(c.seguidores, 99);
  assert.equal(c.bio, 'Recruiter IT');
  assert.deepEqual(c.rubros, ['rrhh', 'rrhh-tech']);
  assert.deepEqual(c.fuentes, ['tuit', 'perfil']);
});

test('estima el costo de una búsqueda de perfiles', () => {
  assert.equal(estimar(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], [], 100, 'perfiles'), 0.064);
});
