// Normalización de texto: qué es junior, qué es senior, a qué área y a qué geografía pertenece.
// Este módulo es la parte "opinada" de XScraper: cambiar acá cambia el producto.

export const JUNIOR = /\b(junior|jr\.?(?=\s|$)|trainee|entry[-\s]?level|internship|interns?\b|graduate|apprentice|pasant[ií]a|becari[oa]|sin experiencia|no experience|recent grad|early career|aprendiz|primer empleo|reci[eé]n recibid)/i;

export const SENIOR = /\b(senior|sr\.?|lead|head|director|manager|principal|staff|architect|vp|chief|cto|ceo|founder)\b/i;

export const FORMACION = /\b(trainee|apprentice|graduate (program|scheme)|programa de formaci[oó]n|bootcamp|beca|pasant[ií]a|internship|aprendiz|pr[aá]cticas profesionales)/i;

// El orden importa: la primera regla que matchea gana. Lo específico va antes que lo genérico.
const AREAS = [
  ['Datos', /\b(data|datos|analytics|bi\b|business intelligence|machine learning|ml\b|ai\b|inteligencia artificial|scientist|etl|power ?bi|tableau)\b/i],
  ['Desarrollo', /\b(developer|desarrollador|engineer|ingenier|software|frontend|front-end|backend|back-end|full[-\s]?stack|programmer|programaci[oó]n|devops|sre|qa\b|tester|testing|android|ios|mobile|inform[aá]tic)/i],
  ['Diseño', /\b(design|dise[ñn]o|ux\b|ui\b|product design|graphic|gr[aá]fic)\b/i],
  ['Producto', /\b(product owner|product manager|producto|scrum|agile|analista funcional)\b/i],
  ['Marketing', /\b(marketing|growth|seo\b|sem\b|content|contenido|community|social media|copywrit|comunicaci[oó]n|periodis)\b/i],
  ['Comercial / Ventas', /\b(comercial|ventas|sales|vendedor|account executive|sdr\b|ejecutivo|prospect|telemarketing|inside sales|business development|kAM\b)/i],
  ['Administración / Contable', /\b(administrativ|asistente|auxiliar|contab|facturaci[oó]n|cobranzas?|pagos|impuest|tesorer|finanz|finance|billing|payroll|liquidaci[oó]n|auditor|legales|compras|proveedor)/i],
  ['RRHH / Reclutamiento', /\b(recruit|reclut|rrhh|recursos humanos|talent|sourcer|people|selecci[oó]n)\b/i],
  ['Soporte / IT', /\b(support|soporte|help ?desk|customer success|technical support|sysadmin|networking|redes|infraestructura)\b/i],
  ['Logística / Operaciones', /\b(log[ií]stica|operaciones|operations|dep[oó]sito|almac[eé]n|supply|warehouse|transporte|chofer)/i],
];

/** Área de negocio a partir de título + tags. Siempre devuelve algo ('Otros' como último recurso). */
export const classify = (text) => (AREAS.find(([, re]) => re.test(text)) ?? ['Otros'])[0];

/** Bucket geográfico usado en toda la app. 'Otra' se descarta en el filtro. */
export const geo = (loc = '', remote = false) => {
  const l = loc.toLowerCase().trim();
  if (/argentin|buenos aires|caba|gba|capital federal|capital|.*,\s*(c[oó]rdoba|santa fe|mendoza|salta|tucum)/.test(l)) return 'Argentina';
  if (/latam|latin america|south america|americas|brazil|chile|uruguay|colombia|m[eé]xico|per[uú]/.test(l)) return 'LATAM';
  if (/worldwide|anywhere|global/.test(l)) return 'Global / remoto';
  if (!l && remote) return 'Global / remoto';
  if (/remote/.test(l) && !/usa|united states|canada|europe|germany|uk\b|india|philipp/.test(l)) return 'Global / remoto';
  return 'Otra';
};

/** Deja el título limpio para deduplicar y para mostrar. */
export const clean = (s = '') => s.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();

/** Seniority explícita a partir del texto. Complementa al filtro binario JUNIOR/SENIOR. */
export const seniorityOf = (text = '') => {
  const t = text.toLowerCase();
  if (/trainee|pasant|becari|aprendiz|pr[aá]cticas/.test(t)) return 'trainee';
  if (/junior|jr\.?(\s|$)/.test(t)) return 'junior';
  if (/graduate|entry[-\s]?level|sin experiencia/.test(t)) return 'junior';
  if (/senior|sr\.?(\s|$)/.test(t)) return 'senior';
  if (/lead|principal|staff|head|director/.test(t)) return 'lead';
  if (/manager|coordinador/.test(t)) return 'manager';
  return 'desconocida';
};

/** Hash estable para deduplicar entre fuentes. */
export const dedupeKey = (company, title, geoBucket) =>
  [company, title, geoBucket]
    .map((s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim())
    .join('|');
