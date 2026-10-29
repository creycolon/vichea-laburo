// Afinidad y transparencia de una oferta.
//
// El enfoque viene de XScraper+ (score 0-100 + razones legibles), reescrito para avisos
// de empleo. La regla que se mantiene: un puntaje sin explicación no sirve — cada número
// viaja con las razones que lo producen.

import { extractSkills, skillArea, skillLabel } from './skills.ts';

export type JobLike = {
  title: string;
  company: string;
  geo: string;
  modality: string;
  area: string;
  source: string;
  days: number | null;
  seniority?: string;
};

export type Profile = {
  skills: string[];                     // ids de SKILLS
  intent: 'primer-empleo' | 'cambiar-area' | 'remoto' | 'mejorar';
  modality: 'cualquiera' | 'remoto' | 'híbrido' | 'presencial';
  geo: 'cualquiera' | 'Argentina' | 'LATAM' | 'Global / remoto';
};

export const EMPTY_PROFILE: Profile = {
  skills: [], intent: 'primer-empleo', modality: 'cualquiera', geo: 'cualquiera',
};

const INTENT_LABEL: Record<Profile['intent'], string> = {
  'primer-empleo': 'tu primer empleo',
  'cambiar-area': 'cambiar de área',
  remoto: 'trabajar remoto',
  mejorar: 'mejorar tu situación actual',
};

/**
 * Afinidad de 0 a 100. Sin perfil devuelve 0: es preferible "sin perfil" a un número
 * inventado. Con perfil, cada tramo suma o resta y deja su razón.
 */
export function scoreJob(job: JobLike, profile: Profile) {
  const reasons: string[] = [];
  const hasProfile = profile.skills.length > 0 || profile.intent !== 'primer-empleo'
    || profile.modality !== 'cualquiera' || profile.geo !== 'cualquiera';
  if (!hasProfile) return { fit: 0, reasons: [], matched: [] as string[] };

  const text = `${job.title} ${job.area} ${job.source}`;
  const jobSkills = extractSkills(text);
  const matched = jobSkills.filter((s) => profile.skills.includes(s));

  let score = 0;

  // 1. habilidades en común (hasta 50: 25 por coincidencia, tope 2)
  if (matched.length) {
    score += Math.min(50, matched.length * 25);
    reasons.push(`coincide en ${matched.map(skillLabel).join(' y ').toLowerCase()}`);
  }

  // 2. área compatible, aunque no aparezca la palabra exacta (15)
  const areas = new Set(profile.skills.map(skillArea).filter(Boolean));
  if (job.area && areas.has(job.area)) {
    score += 15;
    if (!matched.length) reasons.push(`es del área ${job.area.toLowerCase()}`);
  }

  // 3. seniority (hasta 14)
  const sen = (job.seniority ?? '').toLowerCase();
  if (sen === 'trainee' || sen === 'junior') {
    score += 14;
    if (profile.intent === 'primer-empleo') reasons.push('es un puesto junior/trainee');
  } else if (sen === 'senior' || sen === 'lead' || sen === 'manager') {
    score -= 20;
    reasons.push('pide experiencia senior');
  } else {
    score -= 4;
  }

  // 4. modalidad (hasta 12 / hasta −15)
  if (profile.modality !== 'cualquiera' && job.modality) {
    if (job.modality === profile.modality) {
      score += 12;
      reasons.push(`es ${profile.modality}`);
    } else {
      score -= 15;
      reasons.push(`es ${job.modality}, no ${profile.modality}`);
    }
  } else if (profile.intent === 'remoto' && job.modality === 'remoto') {
    score += 12;
    reasons.push('es remoto, como buscás');
  }

  // 5. geografía (8 / −8)
  if (profile.geo !== 'cualquiera' && job.geo) {
    if (job.geo === profile.geo) {
      score += 8;
      reasons.push(`está en ${job.geo.toLowerCase()}`);
    } else {
      score -= 8;
    }
  }

  // 6. frescura (hasta 6 / hasta −10)
  if (job.days !== null && job.days <= 3) {
    score += 6;
    reasons.push('se publicó hace menos de 3 días');
  } else if (job.days !== null && job.days > 45) {
    score -= 10;
    reasons.push('lleva más de 45 días publicada');
  }

  // 7. transparencia del aviso (hasta 6 / hasta −14)
  const t = transparency(job);
  if (t.score >= 70) {
    score += 6;
  } else if (t.score < 40) {
    score -= 14;
    reasons.push(...t.flags.slice(0, 1).map((f) => f.label));
  }

  return {
    fit: Math.max(0, Math.min(100, Math.round(score))),
    reasons: [...new Set(reasons)].slice(0, 4),
    matched,
  };
}

export type Flag = { code: string; label: string; delta: number };

/**
 * Señales de transparencia del aviso: lo que el portal no dice porque vive de publicarlos.
 * Cada flag resta o suma, y se muestra tal cual para que el número sea auditable.
 */
export function transparency(job: JobLike) {
  const flags: Flag[] = [];
  let score = 60;

  if (job.days !== null) {
    if (job.days <= 3) { score += 15; flags.push({ code: 'fresca', label: 'publicada hace poco', delta: 15 }); }
    else if (job.days > 60) { score -= 25; flags.push({ code: 'fantasma', label: `lleva ${job.days} días abierta`, delta: -25 }); }
    else if (job.days > 30) { score -= 12; flags.push({ code: 'vieja', label: `lleva ${job.days} días abierta`, delta: -12 }); }
  } else {
    score -= 5; flags.push({ code: 'sin-fecha', label: 'sin fecha de publicación', delta: -5 });
  }

  if (!job.company) { score -= 18; flags.push({ code: 'anonima', label: 'no identifica a la empresa', delta: -18 }); }
  else { score += 10; }

  if (!job.modality || job.modality === 'desconocida') {
    score -= 8; flags.push({ code: 'sin-modalidad', label: 'no aclara la modalidad', delta: -8 });
  }

  const sen = (job.seniority ?? '').toLowerCase();
  if (sen === 'desconocida') { score -= 6; flags.push({ code: 'sin-seniority', label: 'no aclara la experiencia pedida', delta: -6 }); }

  return { score: Math.max(0, Math.min(100, score)), flags };
}
