/* Perfil laboral y afinidad con ofertas — capa local, sin dependencias.
 *
 * Es independiente de xscraper.perfil.v1 (perfil de negocio). Vive en
 * localStorage bajo xscraper.empleo.perfil.v1 y solo se aplica en el navegador.
 *
 * La puntuación es una heurística transparente: títulos, habilidades,
 * seniority, salario, ubicación, modalidad y frescura. No es una probabilidad
 * ni una decisión automática.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PerfilLaboral = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const norm = (s) => String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const STOP = new Set(`
    de la que el en y a los se del las un por con no una su para es al lo como
    mas pero sus le ya o este si porque esta entre cuando muy sin sobre tambien
    me hasta hay donde quien desde todo nos durante todos uno les ni contra
    otros ese eso ante ellos e esto mi antes algunos unos yo otro otras otra
    el tanto esa estos mucho quienes nada muchos cual poco ella estar estas
    algunas algo nosotros mis tu te ti tus ellas nosotras vosotros vosotras os
    mio mia mios mias tuyo tuya tuyos tuyas suyo suya suyos suyas nuestro
    nuestra nuestros nuestras vuestro vuestra vuestros vuestras esos esas
    quiero quieres quiere queremos quieren busco buscar buscas buscamos
    trabajo trabajar empleo puesto rol role job jobs remote remoto remota
    the and for with that this from have has are was were will would can could
    should about into your you i my me we our they their it its of to in on at
    as by or an is be been being do does did doing done want like know skills
    skill experience work working business money make making online internet
    opportunity opportunities https http www com
  `.trim().split(/\s+/));

  const SKILLS = [
    { id: "automatizacion", label: "Automatización", terms: ["automatizacion", "automation", "n8n", "zapier", "make", "workflow", "rpa", "integromat"] },
    { id: "programacion", label: "Programación", terms: ["python", "javascript", "typescript", "java", "php", "ruby", "golang", "rust", "c#", ".net", "react", "node", "api", "backend", "frontend"] },
    { id: "datos", label: "Datos / analítica", terms: ["sql", "pandas", "power bi", "tableau", "etl", "analytics", "bigquery", "snowflake", "data engineer", "data analyst"] },
    { id: "cloud", label: "Cloud / DevOps", terms: ["aws", "azure", "gcp", "docker", "kubernetes", "terraform", "devops", "ci/cd", "linux"] },
    { id: "ia", label: "IA / LLM", terms: ["llm", "machine learning", "openai", "langchain", "rag", "prompt", "agent", "inteligencia artificial"] },
    { id: "ventas", label: "Ventas / B2B", terms: ["sales", "ventas", "b2b", "crm", "account executive", "business development", "comercial", "sdr"] },
    { id: "marketing", label: "Marketing / SEO", terms: ["seo", "sem", "google ads", "meta ads", "content marketing", "growth", "marketing", "copywriting"] },
    { id: "soporte", label: "Soporte / cliente", terms: ["customer support", "soporte", "customer success", "helpdesk", "atencion al cliente", "support engineer"] },
    { id: "gestion", label: "Gestión / proyectos", terms: ["project manager", "operations", "scrum", "agile", "pmo", "product manager", "jefe de proyecto"] },
    { id: "diseno", label: "Diseño / UX", terms: ["figma", "ui", "ux", "product design", "diseno grafico"] },
    { id: "redaccion", label: "Redacción / contenido", terms: ["copywriting", "content writer", "redactor", "editor", "technical writer"] },
    { id: "finanzas", label: "Finanzas / contabilidad", terms: ["accounting", "finance", "contabilidad", "fp&a", "controller", "auditoria"] },
    { id: "rrhh", label: "RRHH / recruiting", terms: ["recruiting", "talent", "human resources", "rrhh", "seleccion"] },
    { id: "idiomas", label: "Idiomas", terms: ["english", "ingles", "bilingual", "fluent", "french", "german", "aleman"] }
  ].map((s) => ({ ...s, terms: s.terms.map(norm) }));

  const SENIORITY = [
    { id: "any", label: "Cualquiera" },
    { id: "junior", label: "Junior / prácticas" },
    { id: "mid", label: "Mid" },
    { id: "senior", label: "Senior" },
    { id: "lead", label: "Lead / dirección" }
  ];

  const REMOTE = [
    { id: "any", label: "Cualquiera" },
    { id: "remote", label: "Remoto" },
    { id: "hybrid", label: "Híbrido" },
    { id: "onsite", label: "Presencial" }
  ];

  const LEVELS = {
    junior: /\b(junior|jr|entry.level|intern|internship|becari[oa]|trainee|graduate|practicas)\b/,
    mid: /\b(mid|intermediate|medior)\b/,
    senior: /\b(senior|sr\.?|staff|principal|expert)\b/,
    lead: /\b(lead|head of|director|vp|cto|coo|chief|manager)\b/
  };

  const FX = { EUR: 1, USD: 0.92, GBP: 1.17, CAD: 0.68, AUD: 0.60, CHF: 1.06 };

  function tokens(text) {
    const raw = norm(text).replace(/[^a-z0-9áéíóúñü+#.\s-]/g, " ").split(/\s+/).filter(Boolean);
    const out = [];
    const seen = new Set();
    for (const t of raw) {
      const clean = t.replace(/^[.-]+|[.-]+$/g, "");
      if (!clean || seen.has(clean)) continue;
      if (clean.length < 3 && !["ai", "ia", "ml", "qa", "ux", "ui"].includes(clean)) continue;
      if (STOP.has(clean)) continue;
      seen.add(clean);
      out.push(clean);
      for (const part of clean.split(/[.-]+/)) {
        if (part.length < 3 || STOP.has(part) || seen.has(part)) continue;
        seen.add(part);
        out.push(part);
      }
    }
    return out;
  }

  const arr = (v) => (Array.isArray(v) ? v : []);

  function isActive(profile = {}) {
    return Boolean(
      String(profile.titles || "").trim().length >= 2
      || arr(profile.skills).length
      || String(profile.location || "").trim()
      || Number(profile.salaryMin) > 0
      || (profile.seniority && profile.seniority !== "any")
      || (profile.remote && profile.remote !== "any")
    );
  }

  function resumen(profile = {}) {
    const active = isActive(profile);
    const titleTokens = tokens(profile.titles);
    return {
      active,
      generic: active && !titleTokens.length && !arr(profile.skills).length && !String(profile.location || "").trim(),
      tokens: titleTokens,
      skills: arr(profile.skills).length
    };
  }

  function levelOf(job) {
    const text = norm([job.seniority, job.title, ...(job.tags || [])].join(" "));
    for (const level of ["lead", "senior", "mid", "junior"]) {
      if (LEVELS[level].test(text)) return level;
    }
    return "";
  }

  function salaryEur(profile) {
    const value = Number(profile.salaryMin) || 0;
    if (!value) return 0;
    return Math.round(value * (FX[String(profile.currency || "EUR").toUpperCase()] || 1));
  }

  function evaluate(job, profile = {}) {
    if (!isActive(profile)) return { fit: null, reasons: [], gaps: [], matched: [] };

    const hay = norm([
      job.title, job.company, job.description, job.seniority, job.contract,
      ...(job.skills || []), ...(job.tags || [])
    ].join(" "));
    const titleTokens = tokens(profile.titles);
    const reasons = [];
    const gaps = [];
    let score = 12;

    // Títulos: la señal más fuerte, pero sin exigir coincidencia exacta.
    const titleHits = titleTokens.filter((t) => hay.includes(t));
    if (titleTokens.length) {
      if (titleHits.length) {
        score += Math.min(30, titleHits.length * 10);
        reasons.push(`título afín: ${titleHits.slice(0, 3).join(", ")}`);
      } else {
        score -= 8;
        gaps.push("el título no coincide");
      }
    }

    const skillHits = [];
    for (const id of arr(profile.skills)) {
      const skill = SKILLS.find((s) => s.id === id);
      if (skill && skill.terms.some((t) => hay.includes(t))) skillHits.push(skill.label);
    }
    if (skillHits.length) {
      score += Math.min(28, skillHits.length * 7);
      reasons.push(`pide ${skillHits.slice(0, 3).join(", ")}`);
    } else if (arr(profile.skills).length) {
      score -= 6;
      gaps.push("no menciona tus habilidades");
    }

    // Seniority: solo penaliza cuando la oferta lo declara.
    const jobLevel = levelOf(job);
    const wanted = profile.seniority || "any";
    if (wanted !== "any" && jobLevel) {
      if (wanted === jobLevel) {
        score += 10;
        reasons.push(`nivel ${jobLevel}`);
      } else if ((wanted === "junior" && ["senior", "lead"].includes(jobLevel))
        || (wanted === "lead" && jobLevel === "junior")) {
        score -= 10;
        gaps.push(`nivel ${jobLevel}, buscas ${wanted}`);
      } else {
        score += 2;
      }
    }

    // Salario: compara en EUR; el dato de la oferta puede ser aproximado.
    const target = salaryEur(profile);
    if (target && job.salary_eur) {
      if (job.salary_eur >= target) {
        score += 12;
        reasons.push("salario dentro de tu objetivo");
      } else if ((job.salary_eur_max || job.salary_eur) >= target) {
        score += 3;
        gaps.push("solo el máximo del rango llega a tu objetivo");
      } else {
        score -= 12;
        gaps.push("salario por debajo de tu objetivo");
      }
    } else if (target && !job.salary_eur) {
      gaps.push("salario no publicado");
    }

    // Ubicación: Madrid casa con "Madrid, Comunidad de Madrid"; España/EU
    // también valen por grupo de mercado.
    const loc = norm(profile.location);
    if (loc) {
      const jobLoc = norm(job.location);
      if (jobLoc.includes(loc) || loc.split(" ").every((t) => jobLoc.includes(t))) {
        score += 10;
        reasons.push(`ubicación: ${job.location}`);
      } else if (/\b(espana|spain)\b/.test(loc) && job.market_group === "es") {
        score += 8;
        reasons.push("oferta en España");
      } else if (/\b(europa|europe|eu|emea)\b/.test(loc) && job.market_group === "eu") {
        score += 6;
        reasons.push("oferta en Europa");
      } else if (job.remote) {
        score += 2;
        gaps.push("otra ubicación, pero es remoto");
      } else {
        score -= 8;
        gaps.push("ubicación distinta");
      }
    }

    // Modalidad.
    const pref = profile.remote || "any";
    if (pref === "remote") {
      if (job.remote) {
        score += 10;
        reasons.push("remoto");
      } else {
        score -= 15;
        gaps.push("no es remoto");
      }
    } else if (pref === "onsite") {
      if (job.remote) {
        score -= 10;
        gaps.push("es remoto, buscas presencial");
      } else {
        score += 8;
        reasons.push("presencial");
      }
    } else if (pref === "hybrid") {
      if (/\b(hybrid|hibrido|mixto)\b/.test(hay)) {
        score += 8;
        reasons.push("híbrido");
      } else if (!job.remote) {
        gaps.push("modalidad no indicada");
      }
    } else if (job.remote) {
      score += 2;
    }

    // Frescura y calidad del anuncio.
    const age = Number(job.age_days);
    if (Number.isFinite(age)) {
      if (age <= 7) score += 8;
      else if (age <= 14) score += 4;
      else if (age > 30) score -= 6;
    }
    if ((job.description || "").length > 300) score += 4;
    if (job.relevance) score += Math.round(job.relevance * 0.10);

    return {
      fit: Math.max(0, Math.min(100, Math.round(score))),
      reasons: [...new Set(reasons)].slice(0, 5),
      gaps: [...new Set(gaps)].slice(0, 4),
      matched: [...new Set([...titleHits, ...skillHits])].slice(0, 6)
    };
  }

  function evaluateAll(jobs, profile = {}) {
    return (jobs || []).map((job) => ({ job, ...evaluate(job, profile) }));
  }

  return { norm, tokens, isActive, resumen, evaluate, evaluateAll, levelOf, salaryEur, SKILLS, SENIORITY, REMOTE };
});
