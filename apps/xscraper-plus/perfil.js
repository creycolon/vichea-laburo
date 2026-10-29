/* Perfil y afinidad — capa local, sin dependencias.
 *
 * El perfil del usuario NO se guarda en el corpus ni se envía a ningún sitio.
 * Vive en localStorage y se aplica en el navegador sobre los resultados ya
 * construidos por web/construir.py.
 *
 * La puntuación es deliberadamente transparente: suma coincidencias de texto,
 * habilidades, modelo e intención, y descuenta ruido. No es una probabilidad.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.Perfil = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const norm = (s) => String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  // Palabras que no aportan señal al comparar el perfil con un resultado.
  const STOP = new Set(`
    de la que el en y a los se del las un por con no una su para es al lo como
    mas pero sus le ya o este si porque esta entre cuando muy sin sobre tambien
    me hasta hay donde quien desde todo nos durante todos uno les ni contra
    otros ese eso ante ellos e esto mi antes algunos que unos yo otro otras
    otra el tanto esa estos mucho quienes nada muchos cual poco ella estar
    estas algunas algo nosotros mis tu te ti tus ellas nosotras vosotros
    vosotras os mio mia mios mias tuyo tuya tuyos tuyas suyo suya suyos suyas
    nuestro nuestra nuestros nuestras vuestro vuestra vuestros vuestras esos
    esas estoy estas esta estamos estan este estes estemos esten estare estaras
    estara estaremos estaran estaria estarias estariamos estarian estaba estabas
    estabamos estaban estuve estuviste estuvo estuvimos estuvieron estuviera
    estuvieras estuvieramos estuvieran estuviese estuvieses estuviesemos
    estuviesen estando estado estados he has ha hemos han haya hayas hayamos
    hayan habre habras habra habremos habran habria habrias habriamos habrian
    habia habias habiamos habian hube hubiste hubo hubimos hubieron hubiera
    hubieras hubieramos hubieran hubiese hubieses hubiesemos hubiesen habiendo
    habido habida habidos habidas soy eres es somos son sea seas seamos sean
    sere seras sera seremos seran seria serias seriamos serian era eras eramos
    eran fui fuiste fue fuimos fueron fuera fueras fueramos fueran fuese fueses
    fuesemos fuesen siendo sido tengo tienes tiene tenemos tienen tenga tengas
    tengamos tengan tendre tendras tendra tendremos tendran tendria tendrias
    tendriamos tendrian tenia tenias teniamos tenian tuve tuviste tuvo tuvimos
    tuvieron tuviera tuvieras tuvieramos tuvieran tuviese tuvieses tuviesemos
    tuviesen teniendo tenido tenida tenidos tenidas quiero quieres quiere
    queremos quieren quiera quieras queramos quieran querre querras querra
    querremos querran querria querrias querriamos querrian queria querias
    queriamos querian quise quisiste quiso quisimos quisieron quisiera quisieras
    quisieramos quisieran quisiese quisieses quisiessemos quisiesen queriendo
    querido querida queridos queridas puedo puedes puede podemos pueden pueda
    puedas podamos puedan podre podras podra podremos podran podria podrias
    podriamos podrian podia podias podiamos podian pude pudiste pudo pudimos
    pudieron pudiera pudieras pudieramos pudieran pudiese pudieses pudiesemos
    pudiesen pudiendo podido podida podidos podidas hago haces hace hacemos
    hacen haga hagas hagamos hagan hare haras hara haremos haran haria harias
    hariamos harian hacia hacias haciamos hacian hice hiciste hizo hicimos
    hicieron hiciera hicieras hicieramos hicieran hiciese hicieses hiciesemos
    hiciesen haciendo hecho hecha hechos hechas se sabes sabe sabemos saben sepa
    sepas sepamos sepan sabre sabras sabra sabremos sabran sabria sabrias
    sabriamos sabrian sabia sabias sabiamos sabian supe supiste supo supimos
    supieron supiera supieras supieramos supieran supiese supieses supiesemos
    supiesen sabiendo sabido sabida sabidos sabidas
    the and for with that this from have has are was were will would can could
    should about into your you i my me we our they their it its of to in on at
    as by or an is be been being do does did doing done want like know skills
    skill experience work working business money make making online internet
    opportunity opportunities https http www com
  `.trim().split(/\s+/));

  // Verbos y comodines que describen la intención, no el contenido. Se usan
  // para avisar de un perfil demasiado genérico, pero no para puntuar.
  const GENERIC = new Set(`
    dinero money ganar earn ingreso ingresos income facturar negocio business
    trabajo work trabajar empleo job oportunidad opportunity emprender
    emprendimiento proyecto project hacer hacerlo quiero querria quisiera
    gustaria podria saber sabes conocimiento conocimientos experiencia skills
    skill aprender estudiar vender vendo ofrecer crear montar lanzar ayudar
    online internet digital nada poco mucho algo cosa cosas tema temas
  `.trim().split(/\s+/));

  const SKILLS = [
    { id: "automatizacion", label: "Automatización", terms: ["automatizacion", "automation", "n8n", "zapier", "make", "workflow", "agente", "agent", "prompt"] },
    { id: "programacion", label: "Programación", terms: ["programacion", "programming", "saas", "software", "app", "aplicacion", "codigo", "code", "developer", "api", "web"] },
    { id: "ventas", label: "Ventas / clientes", terms: ["venta", "ventas", "sales", "cliente", "clientes", "client", "precio", "pricing", "agencia", "agency", "servicio", "consultoria"] },
    { id: "redaccion", label: "Redacción / copy", terms: ["redaccion", "copy", "copywriting", "contenido", "content", "newsletter", "blog", "guion", "texto"] },
    { id: "diseno", label: "Diseño", terms: ["diseno", "design", "ui", "ux", "marca", "brand", "plantilla", "template", "web"] },
    { id: "video", label: "Vídeo / edición", terms: ["youtube", "tiktok", "reels", "shorts", "video", "edicion", "faceless", "podcast"] },
    { id: "seo", label: "SEO / marketing", terms: ["seo", "marketing", "trafico", "ads", "publicidad", "campana", "keyword"] },
    { id: "datos", label: "Datos / análisis", terms: ["datos", "data", "analisis", "analysis", "metricas", "dashboard", "automatizacion"] },
    { id: "idiomas", label: "Idiomas", terms: ["idioma", "idiomas", "ingles", "english", "espanol", "spanish", "traduccion", "translation", "internacional"] },
    { id: "finanzas", label: "Finanzas / números", terms: ["finanzas", "finance", "contabilidad", "margen", "precio", "pricing", "mrr", "ingresos"] },
    { id: "atencion", label: "Atención al cliente", terms: ["cliente", "clientes", "client", "soporte", "support", "atencion", "comunidad", "community"] },
    { id: "gestion", label: "Gestión / proyectos", terms: ["gestion", "management", "proyecto", "project", "operaciones", "operations", "equipo", "team"] }
  ].map((s) => ({ ...s, terms: s.terms.map(norm) }));

  const INTENTS = [
    { id: "servicio", label: "Prestar un servicio", models: ["Agencia / servicios", "Servicios locales", "Freelance / remoto"], terms: ["cliente", "client", "servicio", "service", "agencia", "agency", "consultoria", "freelance"] },
    { id: "producto", label: "Crear un producto", models: ["SaaS / apps", "Dropshipping / POD", "Newsletter / comunidad", "Afiliación"], terms: ["producto", "product", "saas", "app", "software", "tienda", "shopify", "suscripcion"] },
    { id: "contenido", label: "Crear contenido", models: ["Contenido / creadores", "Cursos / mentoría", "Newsletter / comunidad", "Afiliación"], terms: ["contenido", "content", "youtube", "tiktok", "instagram", "newsletter", "curso"] },
    { id: "inversion", label: "Invertir / especular", models: ["Trading / cripto", "Dropshipping / POD", "SaaS / apps"], terms: ["invertir", "inversion", "trading", "cripto", "crypto", "bitcoin", "rentabilidad"] },
    { id: "aprender", label: "Aprender / explorar", models: ["Cursos / mentoría", "IA / automatización", "Contenido / creadores"], terms: ["aprender", "curso", "course", "tutorial", "formacion", "mentoria"] }
  ];

  // Términos que, si aparecen, hacen que un modelo sea afín al perfil.
  const MODEL_HINTS = {
    "IA / automatización": ["ia", "ai", "automatizacion", "automatizar", "automation", "n8n", "zapier", "chatgpt", "claude", "agente", "agent", "prompt"],
    "SaaS / apps": ["saas", "software", "app", "aplicacion", "mrr", "suscripcion", "producto digital"],
    "Contenido / creadores": ["youtube", "tiktok", "instagram", "reels", "shorts", "contenido", "creador", "creadores", "creator", "faceless", "podcast"],
    "Cursos / mentoría": ["curso", "course", "mentoria", "coaching", "taller", "workshop", "ebook", "formacion"],
    "Agencia / servicios": ["agencia", "agency", "freelance", "consultoria", "consulting", "cliente", "client", "servicio", "marketing", "venta", "ventas", "pyme", "pymes"],
    "Afiliación": ["afiliacion", "affiliate", "comision", "amazon"],
    "Dropshipping / POD": ["dropshipping", "shopify", "printful", "printify", "ecommerce", "tienda"],
    "Trading / cripto": ["trading", "cripto", "crypto", "bitcoin", "forex", "inversion", "airdrop"],
    "Reventa / arbitraje": ["reventa", "reselling", "arbitraje", "amazon fba", "ebay", "vinted"],
    "Newsletter / comunidad": ["newsletter", "substack", "patreon", "comunidad", "discord", "membership"],
    "Servicios locales": ["local", "limpieza", "cleaning", "reparacion", "jardineria", "restaurante", "fontaneria"],
    "Freelance / remoto": ["freelance", "remoto", "remote", "teletrabajo"]
  };
  const MODEL_HINTS_NORM = Object.fromEntries(
    Object.entries(MODEL_HINTS).map(([k, v]) => [k, v.map(norm)])
  );

  function tokens(text) {
    const raw = norm(text)
      .replace(/[^a-z0-9áéíóúñü+#.\s-]/g, " ")
      .split(/\s+/)
      .filter(Boolean);
    const out = [];
    const seen = new Set();
    for (const t of raw) {
      const clean = t.replace(/^[.-]+|[.-]+$/g, "");
      if (!clean) continue;
      // "ia" y "ai" son señales fuertes aunque tengan dos letras.
      if (clean.length < 3 && !["ia", "ai", "ml", "vr", "3d"].includes(clean)) continue;
      if (STOP.has(clean)) continue;
      if (!seen.has(clean)) {
        seen.add(clean);
        out.push(clean);
      }
      // "make.com" o "e-commerce" también aportan "make" y "commerce".
      for (const part of clean.split(/[.-]+/)) {
        if (part.length < 3 || STOP.has(part) || seen.has(part)) continue;
        seen.add(part);
        out.push(part);
      }
    }
    return out;
  }

  const arr = (v) => (Array.isArray(v) ? v : v instanceof Set ? [...v] : []);

  function isActive(profile = {}) {
    return Boolean(String(profile.text || "").trim().length >= 2
      || arr(profile.skills).length
      || arr(profile.intents).length);
  }

  function resumen(profile = {}) {
    const active = isActive(profile);
    const all = tokens(profile.text);
    const useful = all.filter((t) => !GENERIC.has(t));
    return {
      active,
      tokens: useful,
      generic: active && useful.length === 0 && !arr(profile.skills).length && !arr(profile.intents).length,
      skills: arr(profile.skills).length,
      intents: arr(profile.intents).length
    };
  }

  // Plurales y derivados: "cliente" casa con "clientes", "automatizar" con
  // "automatización". Se exigen seis letras de prefijo común para no unir
  // palabras cortas por accidente.
  function similar(a, b) {
    if (a === b) return true;
    // Dominios y herramientas: "make" casa con "make.com".
    if (a.startsWith(b + ".") || b.startsWith(a + ".")) return true;
    if (a.length < 5 || b.length < 5) return false;
    if (Math.abs(a.length - b.length) > 4) return false;
    const max = Math.min(a.length, b.length, 8);
    let i = 0;
    while (i < max && a[i] === b[i]) i += 1;
    return i >= 6;
  }

  function makeMatcher(hayTokens, hayText) {
    return (term) => {
      const n = norm(term);
      if (!n) return false;
      if (n.includes(" ")) return hayText.includes(n);
      if (hayTokens.has(n)) return true;
      for (const tok of hayTokens) if (similar(tok, n)) return true;
      return false;
    };
  }

  // El modelo solo es "afín" si el perfil lo menciona, no porque el propio
  // resultado contenga las palabras de su categoría.
  function makeProfileMatcher(pTokens, profileText) {
    const text = norm(profileText);
    return (term) => {
      const n = norm(term);
      if (!n) return false;
      if (n.includes(" ")) return text.includes(n);
      return pTokens.some((tok) => similar(tok, n));
    };
  }

  function evaluate(t, profile = {}) {
    if (!isActive(profile)) return { fit: null, reasons: [], matched: [], modelHits: [] };

    const models = arr(t.models);
    const hayText = norm([
      t.text,
      ...arr(t.tools),
      ...arr(t.domains),
      ...arr(t.hashtags),
      ...models,
      ...(t.signals ? Object.values(t.signals).flat() : [])
    ].join(" "));
    const hayTokens = new Set(tokens(hayText));
    const has = makeMatcher(hayTokens, hayText);
    const pTokens = tokens(profile.text).filter((x) => !GENERIC.has(x));
    const profileHas = makeProfileMatcher(pTokens, profile.text);

    const matched = pTokens.filter((x) => has(x));
    let score = 0;
    const reasons = [];

    // Un perfil ya escrito es una señal, aunque solo sea texto libre.
    if (pTokens.length || arr(profile.skills).length || arr(profile.intents).length) score += 8;

    if (matched.length) {
      score += Math.min(35, matched.length * 7);
      reasons.push(`coincide en ${matched.slice(0, 3).join(", ")}`);
    }

    const skillHits = [];
    for (const id of arr(profile.skills)) {
      const skill = SKILLS.find((s) => s.id === id);
      if (skill && skill.terms.some(has)) skillHits.push(skill.label);
    }
    if (skillHits.length) {
      score += Math.min(18, skillHits.length * 9);
      reasons.push(`encaja con ${skillHits.slice(0, 2).join(" y ")}`);
    }

    const hinted = [];
    for (const model of models) {
      const hints = MODEL_HINTS_NORM[model] || [];
      const hits = hints.filter((h) => profileHas(h));
      if (hits.length) hinted.push({ model, hits });
    }
    hinted.sort((a, b) => b.hits.length - a.hits.length);
    if (hinted.length) {
      score += Math.min(20, 10 + hinted[0].hits.length * 2);
      reasons.push(`modelo afín: ${hinted[0].model}`);
    }

    const intents = arr(profile.intents);
    const intentHit = INTENTS.find((it) => intents.includes(it.id)
      && models.some((m) => it.models.includes(m)));
    if (intentHit) {
      score += 18;
      reasons.push(`encaja con «${intentHit.label.toLowerCase()}»`);
    }
    if (intents.includes("servicio") && models.includes("Trading / cripto") && !intents.includes("inversion")) {
      score -= 12;
      reasons.push("tu objetivo es servicio, no inversión");
    }

    // La evidencia previa ayuda, pero no puede convertir un resultado vacío en
    // una oportunidad: solo aporta hasta 18 puntos.
    score += Math.round((t.viability || 0) * 0.10 + (t.repeatability || 0) * 0.08);
    if ((t.repeatability || 0) >= 50) reasons.push("señal repetible");
    if ((t.quality || 0) < 28) {
      score -= 10;
      reasons.push("poca sustancia");
    }
    const spam = arr(t.spam_flags).length;
    if (spam) {
      score -= Math.min(20, spam * 8);
      reasons.push("señales de spam");
    }
    if ((t.speculation || 0) >= 50 && !intents.includes("inversion")) {
      score -= 10;
      reasons.push("alta especulación");
    }

    return {
      fit: Math.max(0, Math.min(100, Math.round(score))),
      reasons: [...new Set(reasons)].slice(0, 5),
      matched: matched.slice(0, 5),
      modelHits: hinted.map((x) => x.model)
    };
  }

  return { norm, tokens, isActive, resumen, evaluate, SKILLS, INTENTS, MODEL_HINTS, GENERIC };
});
