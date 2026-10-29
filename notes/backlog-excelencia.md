# Backlog de mejoras — Vichea Laburo

Última actualización: 2026-10-29. Nada de lo listado acá está implementado salvo donde se aclare.

Criterio de prioridad: **primero lo que mejora la reunión con el reclutador**, después lo que
mejora el producto, al final lo que habilita escala. Lo que solo suma datos sin código va primero
porque se paga con tiempo, no con trabajo.

---

## P0 — antes de mostrar el producto a un reclutador

### 1. Acumular historial (no es código: es esperar)

Con 14 días de corridas se habilitan tres métricas que hoy no existen y que son el diferencial
frente a cualquier portal:

- antigüedad real de cada búsqueda abierta,
- cuántas veces se republicó la misma búsqueda,
- tasa de cierre por empresa (cuántas se cubren en menos de X días).

**Qué hace falta:** que el cron corra todos los días sin huecos. Hoy corre por un recordatorio mío;
el workflow de GitHub Actions ya está escrito y espera los secrets del repo.

### 2. Que la web lea de Postgres, no del snapshot

Hoy `apps/web` lee `src/data/latest.json`, copiado en el build. Consecuencia concreta: la página
muestra **69** ofertas y la base tiene **73**. Cada corrida del scraper queda invisible hasta el
próximo deploy.

**Qué hace falta:** `stats.ts` y `jobs.ts` pasan a consultar `jobs` con la publishable key.
Las policies de lectura para `authenticated` ya existen; falta decidir si la landing (anónima)
lee con `anon` o si sirve el agregado desde el servidor.

### 3. El informe de una página

El artefacto que se deja y se reenvía. Con los datos de hoy ya se puede armar:

> "En el AMBA hay 34 búsquedas junior abiertas, 65% presenciales o híbridas, en 46 empresas.
> ADN concentra 8. Doce llevan más de 30 días sin cubrirse."

---

## P1 — después del demo

### 4. Guardar la descripción del aviso

**Qué habilita:** detectar seniority inflado ("dice Junior, pide 3 años") y extraer skills reales
en vez de adivinarlas por el título.

**Qué falta:** el scraper ya trae el texto y lo descarta. `job_source_records.raw_payload` (jsonb)
existe y está vacío. Es dejar de tirar un dato que ya tenemos.

### 5. Reposteos

**Qué diría:** "esta empresa publicó el mismo puesto 3 veces en 6 semanas".

**Qué falta:** ninguna columna nueva. Se cuenta con una query sobre `job_source_records.first_seen_at`
agrupando por `job_id`. Depende de P0.1: necesita semanas de datos.

### 6. Ubicación, opt-in

**Principio ya decidido:** por defecto **no hay barrera de ubicación**. Solo actúa si el usuario
pide "usar mi ubicación" o elige una ciudad —la suya u otra—. Nunca geolocalización por IP en
silencio, ni siquiera para ordenar.

Dos niveles de intención:

| Acción | Efecto |
|---|---|
| Elegir una ciudad | **Ordena**: primero esa ciudad, después lo cercano, después el resto |
| Activar "solo en esta ciudad" | **Filtra**: oculta lo demás |

**Estado visible y reversible:** chip con la ciudad activa y una X para volver a "todas".

**Por qué importa:** de 40 ofertas argentinas, 36 son presenciales o híbridas. La ubicación decide
el 90% de los casos.

**Qué falta:**

- conservar la ciudad cruda (hoy se colapsa en `AR`); el dato ya viene en el scraping,
- geocodificar a `lat/lon`: la granularidad cruda mezcla barrio ("Belgrano"), partido
  ("Avellaneda"), ciudad ("Córdoba") y provincia ("Mendoza"), así que comparar por nombre falla,
- resolver "usar mi ubicación" contra el catálogo propio, no contra un servicio externo.

---

## P2 — escala

### 7. Fuentes por país

Si el producto crece, el motor tiene que resolver **fuentes según el país consultado**, con el
mercado propio como default. El país sale de la selección explícita del usuario, nunca de la IP.

**Lo que ya está bien:** `sources.slug` lleva el país (`computrabajo-ar`), `locations.country` y
`job_source_records.source_id` existen, y el parser de Computrabajo es el mismo en 9 países
(verificado en `.com.pe`: 200, 20 tarjetas, con ciudad real).

**Lo que hoy ata el producto a Argentina** — desacoplar *antes* de agregar un país:

| Dónde | Qué asume |
|---|---|
| `xscraper/src/normalize.mjs` → `geo()` | devuelve el trío `Argentina / LATAM / Global` |
| Chips de geografía (web) | hardcodeados a esos tres valores |
| `xscraper/src/ingest.mjs` → `locationOf()` | mapea todo a `AR`; solo distingue CABA y GBA |
| `SOURCE_SLUGS` | mapa fijo; debería derivarse de `sources` |

**Atajo recomendado:** adoptar **país → ciudad** (`AR-CABA`, `PE-LIMA`) resuelve a la vez el punto 6
y este, con el mismo trabajo.

### 8. Proteger el panel de analista

Hoy es público a propósito: `noindex`, datos de portales abiertos. Cuando haya que cerrarlo, dos
caminos: contraseña compartida en Vercel (5 minutos) o lectura por Supabase con RLS y usuarios.

---

## Decisiones ya tomadas (no reabrir sin razón)

1. **La ubicación es opt-in.** Sin acción del usuario, el radar muestra todo.
2. **Ordenar ≠ filtrar.** Elegir ciudad ordena; ocultar requiere un toggle explícito.
3. **No competir por volumen.** El mercado junior de un portal son 40-60 búsquedas por día;
   el diferencial es la lente (dedupe, modalidad, antigüedad, empresas), no el inventario.
4. **Multi-país, no ahora.** Primero sacar las suposiciones argentinas; el mecanismo cuando haya
   cliente en otro país.
5. **Las taxonomías de modelos de negocio** (SaaS, dropshipping, afiliación) no van en Vichea:
   pertenecen al producto de oportunidades de negocio.
