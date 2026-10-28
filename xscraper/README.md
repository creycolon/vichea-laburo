# XScraper

Motor de relevamiento de **Vichea Laburo**. Junta ofertas de portales públicos, las normaliza,
las deduplica y deja un snapshot por día. Es el único componente que habla con sitios externos.

```
fuentes ──► normalizar ──► filtrar ──► deduplicar ──► data.json + history/<fecha>.json
```

## Uso

```bash
cd xscraper
node cli.mjs            # corrida completa
node cli.mjs --diff     # qué cambió respecto del snapshot anterior
```

Salidas, todas en esta carpeta:

| Archivo | Qué es | Se versiona |
|---|---|---|
| `data.json` | estado actual (ofertas + métricas agregadas) | sí |
| `history/<YYYY-MM-DD>.json` | un corte por día, para serie temporal | sí |
| `index.html` | vista estática generada desde la plantilla | sí |

## Fuentes

| Fuente | Tipo | Modalidad | Cobertura |
|---|---|---|---|
| Computrabajo AR | HTML | por URL (`-presencial`, `-hibrido`, `-en-remoto`) | Argentina |
| GetOnBoard | API | `remote_modality` del payload | LATAM |
| Vacantes Digitales | API | `job_location_type` (TELECOMMUTE/ONSITE/HYBRID) | LATAM |
| Remotive | API | remoto por definición | Global |
| RemoteOK | API | remoto por definición | Global |
| We Work Remotely | RSS | remoto por definición | Global |
| Himalayas | API | remoto por definición | Global |
| Arbeitnow | API | flag `remote` | Europa (se descarta por geografía) |

**Regla de oro:** la modalidad nunca se infiere del texto si la fuente la publica como dato.
Cuando no la publica, se marca lo que corresponde y se documenta en `normalize.mjs`.

## Etapas

1. **Relevar** (`src/engine.mjs`) — un bloque por fuente. Cada una devuelve ofertas crudas con
   `source`, `title`, `company`, `url`, `location`, `modality`, `date`, `tags`.
2. **Normalizar** (`src/normalize.mjs`) — regex de seniority (`JUNIOR`, `SENIOR`, `FORMACION`),
   clasificador de área, bucket geográfico (`Argentina` / `LATAM` / `Global / remoto` / `Otra`) y
   `seniorityOf()`. Es la parte opinada: cambiarla cambia el producto.
3. **Filtrar** — solo junior/trainee, sin títulos senior, con geografía válida y no más viejo que
   90 días.
4. **Deduplicar** — clave `dedupeKey(company, title, geo)` normalizada (minúsculas, sin acentos ni
   signos). La misma búsqueda en dos portales queda una vez.
5. **Escribir** — `data.json`, el snapshot del día y el HTML.

## Agregar una fuente

1. Sumar un bloque en `src/engine.mjs` que empuje a `jobs` con los campos canónicos.
2. Si publica modalidad o país como dato, mapearlo ahí; no delegar en el clasificador de texto.
3. Anotar la fuente en la tabla de arriba y agregarla a `sources` en `db/supabase.sql`.

## Límites conocidos

- **No escribe en Postgres todavía.** El contrato con la app es `data.json`; cuando exista la
  ingesta, `apps/web/src/lib/stats.ts` y `jobs.ts` pasan a ser queries y nada más cambia.
- Computrabajo es scraping: si cambia el HTML, el parser se rompe. Es la fuente más frágil y la
  más valiosa (es la única con volumen real en Argentina).
- No hay reintentos ni rate limit configurable por fuente todavía: los pedidos van en serie con
  400 ms de pausa donde importa.

## Variables

Ninguna. Todas las fuentes son públicas y sin clave. Si alguna empieza a pedir token, va en
`process.env` y se documenta acá.
