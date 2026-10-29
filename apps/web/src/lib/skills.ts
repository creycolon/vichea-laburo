// Taxonomía de habilidades para avisos de empleo junior/trainee.
// Adaptada del enfoque de XScraper+ (texto libre -> categorías) pero con el vocabulario
// de las búsquedas laborales argentinas, no del negocio digital.

export type Skill = { id: string; label: string; area: string; terms: string[] };

const norm = (s: string) =>
  String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export const SKILLS: Skill[] = [
  {
    id: 'programacion', label: 'Programación', area: 'Desarrollo',
    terms: ['react', 'angular', 'vue', 'node', 'python', 'java', 'javascript', 'typescript', 'php',
      'c#', '.net', 'go', 'rust', 'backend', 'frontend', 'full stack', 'fullstack', 'desarrollador',
      'developer', 'programador', 'sql', 'git', 'api', 'microservicios'],
  },
  {
    id: 'datos', label: 'Datos / BI', area: 'Datos',
    terms: ['data', 'datos', 'analytics', 'sql', 'power bi', 'tableau', 'looker', 'etl', 'machine learning',
      'inteligencia artificial', 'cientifico de datos', 'data scientist', 'bi', 'dashboards', 'excel avanzado'],
  },
  {
    id: 'diseno', label: 'Diseño', area: 'Diseño',
    terms: ['figma', 'ux', 'ui', 'photoshop', 'illustrator', 'diseño', 'design', 'prototipo', 'wireframe'],
  },
  {
    id: 'marketing', label: 'Marketing', area: 'Marketing',
    terms: ['seo', 'sem', 'google ads', 'meta ads', 'redes sociales', 'community manager', 'contenido',
      'copywriting', 'email marketing', 'growth', 'marketing digital'],
  },
  {
    id: 'ventas', label: 'Ventas / comercial', area: 'Comercial / Ventas',
    terms: ['ventas', 'comercial', 'crm', 'salesforce', 'hubspot', 'sdr', 'telemarketing', 'prospeccion',
      'cuentas', 'account', 'negociacion', 'kpi comercial'],
  },
  {
    id: 'administracion', label: 'Administración / contable', area: 'Administración / Contable',
    terms: ['facturacion', 'cobranzas', 'contabilidad', 'impuestos', 'tesoreria', 'conciliacion',
      'administrativo', 'proveedores', 'pagos', 'liquidacion', 'auditoria', 'balance'],
  },
  {
    id: 'rrhh', label: 'RRHH / reclutamiento', area: 'RRHH / Reclutamiento',
    terms: ['reclutamiento', 'rrhh', 'recursos humanos', 'seleccion', 'talento', 'entrevistas',
      'onboarding', 'recruiter', 'sourcing'],
  },
  {
    id: 'soporte', label: 'Soporte / IT', area: 'Soporte / IT',
    terms: ['soporte', 'help desk', 'mesa de ayuda', 'service desk', 'atencion al cliente', 'zendesk',
      'customer support', 'incidencias', 'redes', 'windows server', 'active directory'],
  },
  {
    id: 'logistica', label: 'Logística / operaciones', area: 'Logística / Operaciones',
    terms: ['logistica', 'deposito', 'stock', 'almacen', 'inventario', 'compras', 'abastecimiento',
      'transporte', 'operaciones', 'wms'],
  },
  {
    id: 'idiomas', label: 'Idiomas', area: '',
    terms: ['ingles', 'english', 'portugues', 'bilingue', 'bilingual', 'italiano', 'frances'],
  },
  {
    id: 'gestion', label: 'Gestión / proyectos', area: 'Producto',
    terms: ['scrum', 'agile', 'jira', 'gestion de proyectos', 'pmo', 'coordinacion', 'product owner',
      'kanban', 'stakeholders'],
  },
  {
    id: 'finanzas', label: 'Finanzas', area: 'Administración / Contable',
    terms: ['finanzas', 'presupuesto', 'p&l', 'riesgo', 'costos', 'forecast', 'fp&a', 'valorizacion'],
  },
];

// Un término puede pertenecer a más de una habilidad (SQL es programación y datos):
// el índice guarda un conjunto, no un valor único.
const INDEX = new Map<string, Set<string>>();
for (const s of SKILLS) {
  for (const t of s.terms) {
    const k = norm(t);
    if (!INDEX.has(k)) INDEX.set(k, new Set());
    INDEX.get(k)!.add(s.id);
  }
}

const TERMS_SORTED = [...INDEX.keys()].sort((a, b) => b.length - a.length);

/** Habilidades detectadas en un texto (título + área + fuente). Devuelve ids únicos. */
export function extractSkills(text: string): string[] {
  const t = ` ${norm(text)} `;
  const found = new Set<string>();
  for (const term of TERMS_SORTED) {
    // Sin cortar por habilidad ya encontrada: un término puede pertenecer a dos
    // categorías (SQL es programación y también datos), y el aviso suma ambas.
    // límite de palabra: evita que "go" matchee "gobierno" o "ui" matchee "ruido"
    const re = new RegExp(`(?<![a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`);
    if (re.test(t)) for (const id of INDEX.get(term)!) found.add(id);
  }
  return [...found];
}

export const skillLabel = (id: string) => SKILLS.find((s) => s.id === id)?.label ?? id;
export const skillArea = (id: string) => SKILLS.find((s) => s.id === id)?.area ?? '';
