// Lógica cliente de la página de ofertas: filtros, perfil local, afinidad y guardado.
// El perfil vive en localStorage — igual que en XScraper+ — así que no viaja al servidor.

import { SKILLS, extractSkills } from '../lib/skills.ts';
import { scoreJob, transparency, EMPTY_PROFILE, type Profile } from '../lib/fit.ts';

type Job = {
  title: string; company: string; geo: string; modality: string;
  area: string; source: string; url: string; days: number | null; seniority?: string;
};

const { jobs, guardadas, configured, dev } = (window as any).__RADAR__ as {
  jobs: Job[]; guardadas: { id: string; name: string; filters: any }[]; configured: boolean; dev: boolean;
};

const PROFILE_KEY = 'vichea.profile.v1';
const SEARCH_KEY = 'vichea.searches.v1';
const $ = (id: string) => document.getElementById(id)!;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

const state = { q: '', geo: '', modality: '', area: '', minFit: false };
let profile: Profile = loadProfile();

function loadProfile(): Profile {
  try {
    const raw = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null');
    if (raw && Array.isArray(raw.skills)) return { ...EMPTY_PROFILE, ...raw };
  } catch { /* perfil corrupto: arrancamos vacío */ }
  return { ...EMPTY_PROFILE };
}

const hasProfile = () => profile.skills.length > 0 || profile.intent !== 'primer-empleo'
  || profile.modality !== 'cualquiera' || profile.geo !== 'cualquiera';

// ---------- perfil ----------
function renderProfile() {
  const box = $('skills');
  box.innerHTML = SKILLS.map((s) => `
    <span class="chip ${profile.skills.includes(s.id) ? 'on' : ''}" data-skill="${s.id}">${s.label}</span>
  `).join('');
  box.querySelectorAll('[data-skill]').forEach((el) => el.addEventListener('click', () => {
    const id = (el as HTMLElement).dataset.skill!;
    profile.skills = profile.skills.includes(id)
      ? profile.skills.filter((x) => x !== id)
      : [...profile.skills, id];
    saveProfile();
  }));

  ($('intent') as HTMLSelectElement).value = profile.intent;
  ($('pmod') as HTMLSelectElement).value = profile.modality;
  ($('pgeo') as HTMLSelectElement).value = profile.geo;
  $('profileState').textContent = hasProfile()
    ? `${profile.skills.length} habilidades · ${profile.intent.replace('-', ' ')}`
    : 'sin perfil — la afinidad no se calcula';
}

function saveProfile() {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  renderProfile();
  render();
}

['intent', 'pmod', 'pgeo'].forEach((id) => $(id).addEventListener('change', (e) => {
  const v = (e.target as HTMLSelectElement).value;
  if (id === 'intent') profile.intent = v as Profile['intent'];
  if (id === 'pmod') profile.modality = v as Profile['modality'];
  if (id === 'pgeo') profile.geo = v as Profile['geo'];
  saveProfile();
}));

$('clearProfile').addEventListener('click', () => {
  profile = { ...EMPTY_PROFILE };
  saveProfile();
});

// ---------- tabla ----------
const badge = (fit: number) => {
  const cls = fit >= 70 ? 'fit-hi' : fit >= 45 ? 'fit-mid' : 'fit-low';
  return `<span class="fit ${cls}" title="${fit}% de afinidad">${fit}%</span>`;
};

const transparencyCell = (j: Job) => {
  const t = transparency(j);
  if (!t.flags.length) return '<span class="dim">—</span>';
  const main = t.flags[0];
  const cls = t.score >= 65 ? 'tr-ok' : t.score >= 45 ? 'tr-warn' : 'tr-bad';
  return `<span class="tr ${cls}" title="${t.flags.map((f) => f.label).join(' · ')}">${esc(main.label)}</span>`;
};

function render() {
  const scored = jobs.map((j) => ({ job: j, ...scoreJob(j, profile) }));

  const out = scored.filter(({ job: j, fit }) => {
    if (state.geo && j.geo !== state.geo) return false;
    if (state.modality && j.modality !== state.modality) return false;
    if (state.area && j.area !== state.area) return false;
    if (state.minFit && hasProfile() && fit < 60) return false;
    if (state.q) {
      const hay = `${j.title} ${j.company} ${j.area} ${j.source}`.toLowerCase();
      if (!hay.includes(state.q)) return false;
    }
    return true;
  });

  if (hasProfile()) out.sort((a, b) => b.fit - a.fit);

  $('count').textContent = `${out.length} de ${jobs.length}`;
  $('rows').innerHTML = out.length
    ? out.map(({ job: j, fit, reasons }) => `
      <tr>
        <td><a href="${j.url}" target="_blank" rel="noopener">${esc(j.title)}</a>
          ${reasons.length ? `<div class="why">${reasons.map(esc).join(' · ')}</div>` : ''}
        </td>
        <td class="dim">${esc(j.company || '—')}</td>
        <td class="dim">${esc(j.geo)}</td>
        <td><span class="tag ${j.modality === 'presencial' ? 'p' : j.modality === 'híbrido' ? 'h' : 'r'}">${esc(j.modality)}</span></td>
        <td class="dim">${esc(j.area)}</td>
        <td class="dim">${j.days !== null ? `${j.days} d` : '—'}</td>
        <td class="dim">${transparencyCell(j)}</td>
        <td>${hasProfile() ? badge(fit) : '<span class="dim">—</span>'}</td>
      </tr>`).join('')
    : '<tr><td colspan="8" class="empty">Nada con esos filtros.</td></tr>';
}

document.querySelectorAll('[data-k]').forEach((el) => el.addEventListener('click', () => {
  const k = (el as HTMLElement).dataset.k as 'geo' | 'modality' | 'area';
  const v = (el as HTMLElement).dataset.v!;
  state[k] = state[k] === v ? '' : v;
  document.querySelectorAll(`[data-k="${k}"]`).forEach((x) => x.classList.toggle('on', (x as HTMLElement).dataset.v === state[k]));
  render();
}));

$('minFit').addEventListener('click', () => {
  state.minFit = !state.minFit;
  $('minFit').classList.toggle('on', state.minFit);
  render();
});

$('q').addEventListener('input', (e) => { state.q = (e.target as HTMLInputElement).value.toLowerCase().trim(); render(); });

// ---------- búsquedas guardadas ----------
const localSearches = (): { id: string; name: string; filters: any }[] => {
  try { return JSON.parse(localStorage.getItem(SEARCH_KEY) || '[]'); } catch { return []; }
};

function renderGuardadas() {
  const items = configured ? guardadas : localSearches();
  $('guardadasSub').textContent = configured
    ? 'Se guardan en tu organización y sirven para generar alertas diarias.'
    : dev
      ? 'Modo demostración: se guardan sólo en este navegador (localStorage). Con Supabase configurado van a la base.'
      : 'Modo demostración: por ahora las búsquedas quedan en este navegador.';
  $('guardadasList').innerHTML = items.length
    ? `<div class="grid3">${items.map((s) => `
        <article class="card">
          <h3 style="margin-top:0">${esc(s.name)}</h3>
          <p style="font-size:12.5px;color:var(--dim-2)">${esc(JSON.stringify(s.filters))}</p>
        </article>`).join('')}</div>`
    : '<div class="empty"><strong>Todavía no guardaste ninguna</strong>Filtrá y usá “Guardar esta búsqueda”.</div>';
}

$('saveBtn').addEventListener('click', async () => {
  const name = [state.geo || 'Todas', state.modality || 'todas las modalidades', state.area || 'todas las áreas']
    .join(' · ') + (state.q ? ` · “${state.q}”` : '');
  const filters = { ...state, profile: hasProfile() ? { skills: profile.skills, intent: profile.intent } : null };

  if (!configured) {
    const list = localSearches();
    list.push({ id: crypto.randomUUID(), name, filters });
    localStorage.setItem(SEARCH_KEY, JSON.stringify(list));
    renderGuardadas();
    return;
  }
  const res = await fetch('/api/busquedas', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, filters }),
  });
  if (res.ok) location.href = '/busquedas?ok=1';
});

renderProfile();
render();
renderGuardadas();

// expuesto para depurar desde la consola del navegador
(window as any).__vichea = { get profile() { return profile; }, jobs, state };
