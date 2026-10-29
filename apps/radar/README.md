# Radar — panel de analista

Segunda aplicación del sistema. No es marketing ni producto para clientes: es el **útil de
análisis** sobre lo que releva XScraper. Sin landing, sin registro, `noindex`.

Muestra: KPIs del día, apertura/cierre respecto del snapshot anterior, distribución por
modalidad, geografía, área y fuente, ranking de empresas con más búsquedas y la tabla completa.

## Correr

```bash
cd apps/radar
npm install
npm run dev     # http://127.0.0.1:4322
```

El `predev`/`prebuild` copia el snapshot de XScraper a `src/data/`. Si XScraper no corrió nunca,
la página se ve vacía (con el aviso correspondiente), no rota.

## Deploy

Vercel → Root Directory **`apps/radar`**. Framework Astro. Sin variables de entorno.

El adapter cambia solo según el entorno (igual que `apps/web`): `@astrojs/node` en local,
`@astrojs/vercel` cuando existe `VERCEL`.

## Cómo se actualiza

```
GitHub Actions (cron 08:00 ART) → XScraper → commit del snapshot → Vercel redespliega
```

El workflow está en [`.github/workflows/xscraper.yml`](../../.github/workflows/xscraper.yml) y
hace tres cosas: releva, escribe en Supabase (si hay secrets) y commitea `data.json` +
`history/` + `index.html`. Ese commit es el que dispara el redeploy de este panel.

**Secrets necesarios** (Settings → Secrets and variables → Actions):

| Secret | Para qué |
|---|---|
| `SUPABASE_URL` | habilitar la ingesta a Postgres |
| `SUPABASE_SERVICE_ROLE_KEY` | idem; sin ella el workflow solo releva y commitea |

## Seguridad

Hoy es público a propósito y sin autenticación: los datos son ofertas publicadas en portales
abiertos. Tiene `robots: noindex`. Cuando haya que restringirlo, las opciones son una
contraseña compartida en Vercel o mover la lectura a Supabase con RLS — pendiente de decisión.
