#!/usr/bin/env node
/**
 * Descubrimiento de cuentas y prospectos en X por rubro, vía Apify.
 * No scrapea X directamente: corre actors de Apify con un token propio.
 *
 *   node discover.mjs rubros                      # lista los rubros definidos
 *   node discover.mjs --rubro rrhh --dry-run      # muestra las búsquedas y el costo
 *   node discover.mjs --rubro rrhh                # busca cuentas (no guarda)
 *   node discover.mjs --rubro rrhh --save         # guarda en cuentas-por-rubro.json
 *   node discover.mjs --rubro rrhh --tipo persona --prospectos
 *   node discover.mjs "recruiter CABA" --save     # modo viejo: busca tuits y toma autores
 *
 * Dos vías, porque encuentran cosas distintas:
 *   - perfil (twitter-user-scraper): cuentas que se definen como RRHH/reclutamiento.
 *     Trae bio, ubicación, web, si acepta DM y el tipo de cuenta. Es la vía principal.
 *   - tuits (tweet-scraper): cuentas que están publicando búsquedas ahora.
 *     No trae bio; sirve como señal de actividad.
 *
 * Costo (Apify, 2026): US$0,008 por búsqueda de usuarios + US$0,0004 por usuario
 * extra (los primeros ~20 de cada búsqueda son gratis); US$0,0004 por tuit.
 * El plan free de Apify no permite correr actors por API: hace falta plan pago.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const PROSPECTOS = path.join(DIR, 'prospectos.json');
const CUENTAS = path.join(DIR, 'cuentas-por-rubro.json');
const RUBROS_FILE = path.join(DIR, 'rubros.json');

const ACTOR_TUITS = 'apidojo~tweet-scraper';
const ACTOR_USUARIOS = 'apidojo~twitter-user-scraper';

const PRECIO = {
  busquedaUsuarios: 0.008,
  usuarioExtra: 0.0004,
  tuit: 0.0004,
  gratisPorBusqueda: 20,
};

const TIPOS = ['persona', 'empresa', 'grupo', 'desconocido'];
const ETIQUETA_TIPO = {
  persona: 'Personas / reclutadores',
  empresa: 'Empresas / consultoras',
  grupo: 'Grupos / comunidades',
  desconocido: 'Sin clasificar',
};

// Heurística de clasificación. No es magia: se apoya en la bio y en los metadatos
// de la cuenta. Si el rubro necesita otra cosa, se ajusta acá.
const PISTAS = {
  grupo: {
    fuertes: ['comunidad', 'community', 'bolsa de trabajo', 'bolsa de empleo', 'portal de empleo', 'job board', 'newsletter', 'colectivo', 'asociacion'],
    debiles: ['empleos', 'trabajos', 'vacantes', 'ofertas laborales', 'ofertas de empleo', 'grupo de'],
  },
  empresa: {
    fuertes: ['consultora', 'consultancy', 'consulting', 'agencia', 'agency', 'staffing', 'recruitment agency', 's.a.', 'srl', 'llc', 'ltd', 'gmbh', 'corporation', 'somos una empresa'],
    debiles: ['empresa', 'somos', 'equipo', 'soluciones', 'servicios', 'corp', 'startup', 'firma', 'recursos humanos', 'talento humano'],
  },
  persona: {
    fuertes: ['reclutador', 'reclutadora', 'recruiter', 'talent acquisition', 'headhunter', 'head hunter', 'sourcer', 'talent partner'],
    debiles: ['rrhh', 'recursos humanos', 'seleccion', 'reclutamiento', 'people', 'hrbp', 'hr manager', 'hr business'],
  },
};

const BUSCA_TRABAJO = [
  'busco trabajo', 'buscando trabajo', 'busco empleo', 'buscando empleo',
  'open to work', 'opentowork', 'desemplead', 'en busqueda laboral',
  'disponible para trabajar', 'necesito trabajo',
];

function parseArgs(argv) {
  const o = { max: 100, via: null, tipo: null, rubro: null, query: '', save: false, prospectos: false, dryRun: false, incluirBuscadores: false, help: false, listar: false };
  const libres = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--save') o.save = true;
    else if (a === '--prospectos') o.prospectos = true;
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--incluir-buscadores') o.incluirBuscadores = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--rubro') o.rubro = argv[++i];
    else if (a === '--tipo') o.tipo = argv[++i];
    else if (a === '--via') o.via = argv[++i];
    else if (a === '--max') o.max = Number(argv[++i]);
    else if (a === 'rubros') o.listar = true;
    else if (!a.startsWith('--')) libres.push(a);
  }
  o.query = libres.join(' ').trim();
  o.via = o.via || (o.query && !o.rubro ? 'tuits' : 'perfiles');
  return o;
}

function ayuda() {
  console.log(`Uso:
  node discover.mjs rubros                          lista los rubros de rubros.json
  node discover.mjs --rubro <id> [opciones]         busca cuentas del rubro

Opciones:
  --via perfiles|tuits|ambas   qué actor usar (default: perfiles)
  --tipo persona|empresa|grupo|desconocido   filtra el resultado
  --max N                      ítems máximos por corrida (default 100)
  --save                       guarda en cuentas-por-rubro.json
  --prospectos                 además copia a prospectos.json para DM
  --incluir-buscadores         no descarta cuentas que buscan trabajo
  --dry-run                    muestra las búsquedas y el costo, sin llamar a Apify

Modo directo (sin rubro):
  node discover.mjs "<query de X>" [--save] [--max N]

El token va en prospectos/.env:  APIFY_TOKEN=apify_api_...
El plan free de Apify no permite usar actors por API.`);
}

function cargarRubros() {
  try {
    return JSON.parse(fs.readFileSync(RUBROS_FILE, 'utf8'));
  } catch (e) {
    console.error(`No pude leer rubros.json: ${e.message}`);
    process.exit(1);
  }
}

function listarRubros(rubros) {
  console.log('Rubros definidos en rubros.json:\n');
  for (const [id, r] of Object.entries(rubros)) {
    console.log(`  ${id.padEnd(12)} ${r.nombre}`);
    console.log(`  ${''.padEnd(12)} ${r.descripcion || ''}`);
    console.log(`  ${''.padEnd(12)} ${(r.usuarios || []).length} búsquedas de perfil · ${(r.tuits || []).length} de tuits\n`);
  }
}

const sinAcentos = (s = '') => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

function clasificar(u) {
  const texto = sinAcentos(`${u.name || ''} ${u.description || ''}`);
  const score = { persona: 0, empresa: 0, grupo: 0 };
  for (const [tipo, pistas] of Object.entries(PISTAS)) {
    for (const p of pistas.fuertes) if (texto.includes(p)) score[tipo] += 2;
    for (const p of pistas.debiles) if (texto.includes(p)) score[tipo] += 1;
  }
  if (/business/i.test(u.professional?.professional_type || u.verifiedType || '')) score.empresa += 4;
  const max = Math.max(...Object.values(score));
  if (max === 0) return 'desconocido';
  return ['empresa', 'grupo', 'persona'].find((t) => score[t] === max);
}

function esBuscador(bio, excluir) {
  const texto = sinAcentos(bio);
  return [...BUSCA_TRABAJO, ...excluir.map(sinAcentos)].some((p) => texto.includes(p));
}

function normalizar(u, { rubro, excluir = [], fuente }) {
  const handle = String(u.userName || u.username || '').replace(/^@/, '').toLowerCase();
  if (!handle) return null;
  const bio = String(u.description || '').trim();
  return {
    handle,
    nombre: String(u.name || u.displayName || handle),
    tipo: clasificar(u),
    rubros: rubro ? [rubro] : [],
    bio: bio.slice(0, 280),
    ubicacion: String(u.location || ''),
    web: u.entities?.url?.urls?.[0]?.expanded_url || u.website || '',
    seguidores: num(u.followers),
    siguiendo: num(u.following),
    listas: num(u.listedCount),
    puedeDM: u.canDm ?? null,
    verificado: Boolean(u.isBlueVerified || u.isVerified),
    tipoVerificacion: String(u.verifiedType || ''),
    profesional: String(u.professional?.professional_type || ''),
    creado: String(u.createdAt || ''),
    buscaTrabajo: esBuscador(bio, excluir),
    fuentes: [fuente],
    encontrado: new Date().toISOString(),
  };
}

function fusionar(dest, src) {
  if (!dest) return src;
  const limpio = Object.fromEntries(
    Object.entries(src).filter(([, v]) => v !== '' && v !== null && v !== undefined && !(Array.isArray(v) && !v.length)),
  );
  return {
    ...dest,
    ...limpio,
    tipo: dest.tipo !== 'desconocido' ? dest.tipo : src.tipo,
    buscaTrabajo: dest.buscaTrabajo || src.buscaTrabajo,
    rubros: [...new Set([...(dest.rubros || []), ...(src.rubros || [])])],
    fuentes: [...new Set([...(dest.fuentes || []), ...(src.fuentes || [])])],
  };
}

async function correrActor(actor, input, token) {
  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Apify ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

function estimar(perfiles, tuits, max, via) {
  let usd = 0;
  if (via === 'perfiles' || via === 'ambas') {
    const gratis = perfiles.length * PRECIO.gratisPorBusqueda;
    usd += perfiles.length * PRECIO.busquedaUsuarios + Math.max(0, max - gratis) * PRECIO.usuarioExtra;
  }
  if (via === 'tuits' || via === 'ambas') {
    usd += max * PRECIO.tuit;
  }
  return usd;
}

function imprimir(cuentas) {
  for (const tipo of TIPOS) {
    const items = cuentas.filter((c) => c.tipo === tipo);
    if (!items.length) continue;
    console.log(`\n${ETIQUETA_TIPO[tipo]} (${items.length})`);
    for (const c of items.slice(0, 30)) {
      const seg = c.seguidores == null ? '—' : String(c.seguidores);
      const alerta = c.buscaTrabajo ? '  ⚠ busca trabajo' : '';
      console.log(`  @${c.handle.padEnd(20)} ${(c.nombre || '').slice(0, 26).padEnd(26)} ${seg.padStart(8)} seg.${alerta}`);
      if (c.bio) console.log(`      ${c.bio.slice(0, 110)}`);
    }
    if (items.length > 30) console.log(`  … y ${items.length - 30} más`);
  }
  const sinClasificar = cuentas.filter((c) => c.tipo === 'desconocido').length;
  console.log(`\ntotal: ${cuentas.length}${sinClasificar ? ` · ${sinClasificar} sin clasificar` : ''}`);
}

function guardarCuentas(cuentas) {
  const db = fs.existsSync(CUENTAS) ? JSON.parse(fs.readFileSync(CUENTAS, 'utf8')) : { actualizado: null, cuentas: {} };
  db.cuentas = db.cuentas || {};
  let nuevos = 0;
  for (const c of cuentas) {
    const prev = db.cuentas[c.handle];
    if (!prev) nuevos++;
    db.cuentas[c.handle] = fusionar(prev, c);
  }
  db.actualizado = new Date().toISOString();
  fs.writeFileSync(CUENTAS, JSON.stringify(db, null, 2));
  console.log(`\n${cuentas.length} cuentas guardadas en cuentas-por-rubro.json (${nuevos} nuevas, total ${Object.keys(db.cuentas).length})`);
}

function pasarAProspectos(cuentas) {
  const db = fs.existsSync(PROSPECTOS) ? JSON.parse(fs.readFileSync(PROSPECTOS, 'utf8')) : { prospectos: [] };
  const ya = new Set(db.prospectos.map((p) => p.handle));
  let n = 0;
  for (const c of cuentas) {
    if (ya.has(c.handle)) continue;
    db.prospectos.push({
      handle: c.handle,
      nombre: c.nombre,
      empresa: '',
      nota: c.bio || c.rubros.join(', '),
      estado: 'pendiente',
      variante: 'A',
      agregado: new Date().toISOString(),
      enviado: null,
      rubro: c.rubros[0] || '',
      tipo: c.tipo,
    });
    n++;
  }
  fs.writeFileSync(PROSPECTOS, JSON.stringify(db, null, 2));
  console.log(`${n} cuentas agregadas a prospectos.json (total ${db.prospectos.length})`);
}

export { parseArgs, clasificar, esBuscador, normalizar, fusionar, estimar };

// ── principal ────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { ayuda(); process.exit(0); }

  const rubros = cargarRubros();
  if (opts.listar) { listarRubros(rubros); process.exit(0); }

  if (!['perfiles', 'tuits', 'ambas'].includes(opts.via)) {
    console.error(`--via inválido: ${opts.via}. Usá perfiles, tuits o ambas.`);
    process.exit(1);
  }
  if (opts.tipo && !TIPOS.includes(opts.tipo)) {
    console.error(`--tipo inválido: ${opts.tipo}. Usá ${TIPOS.join(', ')}.`);
    process.exit(1);
  }
  if (!Number.isFinite(opts.max) || opts.max <= 0) {
    console.error('--max tiene que ser un número mayor a 0');
    process.exit(1);
  }

  let definicion = null;
  if (opts.rubro) {
    definicion = rubros[opts.rubro];
    if (!definicion) {
      console.error(`No existe el rubro "${opts.rubro}". Disponibles: ${Object.keys(rubros).join(', ')}`);
      process.exit(1);
    }
  }
  if (!opts.rubro && !opts.query) {
    console.error('Falta un rubro (--rubro rrhh) o una query directa. Probá: node discover.mjs rubros');
    process.exit(1);
  }

  const perfiles = opts.rubro && (opts.via === 'perfiles' || opts.via === 'ambas') ? definicion.usuarios || [] : [];
  const tuits = opts.query
    ? [opts.query]
    : (opts.rubro && (opts.via === 'tuits' || opts.via === 'ambas') ? definicion.tuits || [] : []);
  if (perfiles.length && opts.max < 5) {
    console.error('El actor de usuarios exige un mínimo de 5 ítems por corrida: subí --max a 5 o más.');
    process.exit(1);
  }
  const excluir = definicion?.excluir || [];
  const rubroId = opts.rubro || null;
  const costo = estimar(perfiles, tuits, opts.max, opts.via);

  console.log(`rubro: ${rubroId ? `${rubroId} (${definicion.nombre})` : 'directo'}`);
  console.log(`búsquedas: ${perfiles.length} de perfil · ${tuits.length} de tuits · máx ${opts.max} ítems por corrida`);
  console.log(`costo estimado: US$${costo.toFixed(3)}\n`);

  if (opts.dryRun) {
    console.log('— dry-run: no se llama a Apify —');
    if (perfiles.length) {
      console.log(`\n[perfiles] ${ACTOR_USUARIOS}`);
      for (const q of perfiles) console.log(`  · ${q}`);
    }
    if (tuits.length) {
      console.log(`\n[tuits] ${ACTOR_TUITS}`);
      for (const q of tuits) console.log(`  · ${q}`);
    }
    process.exit(0);
  }

  // token: variable de entorno o archivo .env local
  const envFile = path.join(DIR, '.env');
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  }
  const TOKEN = process.env.APIFY_TOKEN;
  if (!TOKEN) {
    console.error('Falta APIFY_TOKEN. Creá tu token en https://console.apify.com/account/integrations y guardalo en prospectos/.env:');
    console.error('  APIFY_TOKEN=apify_api_...');
    console.error('El plan free de Apify no permite usar actors por API.');
    process.exit(1);
  }

  const porHandle = new Map();

  try {
    if (perfiles.length) {
      console.log(`buscando ${perfiles.length} perfiles…`);
      const items = await correrActor(ACTOR_USUARIOS, { searchTerms: perfiles, maxItems: opts.max }, TOKEN);
      console.log(`  usuarios recibidos: ${items.length}`);
      for (const u of items) {
        const c = normalizar(u, { rubro: rubroId, excluir, fuente: 'perfil' });
        if (c) porHandle.set(c.handle, fusionar(porHandle.get(c.handle), c));
      }
    }

    if (tuits.length) {
      console.log(`buscando tuits (${tuits.length} queries)…`);
      const items = await correrActor(ACTOR_TUITS, { searchTerms: tuits, maxItems: opts.max, sort: 'Top' }, TOKEN);
      console.log(`  tuits recibidos: ${items.length}`);
      for (const t of items) {
        const autor = t.author || t.user || {};
        const c = normalizar(autor, { rubro: rubroId, excluir, fuente: 'tuit' });
        if (c) porHandle.set(c.handle, fusionar(porHandle.get(c.handle), c));
      }
    }
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }

  let cuentas = [...porHandle.values()];
  if (!opts.incluirBuscadores) cuentas = cuentas.filter((c) => !c.buscaTrabajo);
  if (opts.tipo) cuentas = cuentas.filter((c) => c.tipo === opts.tipo);
  cuentas.sort((a, b) => (b.seguidores ?? -1) - (a.seguidores ?? -1));

  if (!cuentas.length) {
    console.log('\nno quedaron cuentas después de filtrar.');
    process.exit(0);
  }

  imprimir(cuentas);

  if (opts.save) guardarCuentas(cuentas);
  if (opts.prospectos) pasarAProspectos(cuentas);
  if (!opts.save && !opts.prospectos) console.log('\n(no se guardó nada; usá --save y/o --prospectos)');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
