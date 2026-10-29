# Vichea Laburo

Plataforma de inteligencia de demanda laboral junior/trainee en LATAM: releva portales,
deduplica las ofertas y las normaliza por empresa, ubicación, modalidad y área.

```
apps/web/     # landing + auth + panel (Astro 5 SSR + Supabase)
apps/radar/   # panel de analista sobre la salida de XScraper (sin login)
xscraper/     # XScraper: motor de relevamiento (hoy escribe data.json)
db/           # schema Postgres: supabase.sql (auth + RLS) y schema.sql (portable)
docs/         # DER explicado y decisiones de arquitectura
notes/        # apuntes de trabajo
```

## Empezar

```bash
cd apps/web
npm install
cp .env.example .env      # completar SUPABASE_URL y SUPABASE_ANON_KEY
npm run dev               # http://127.0.0.1:4321
```

Sin claves de Supabase la app arranca igual: la landing muestra los datos del scraper y los
formularios avisan que falta configuración. Ver `apps/web/README.md` para el paso a paso.

## XScraper

El motor de relevamiento. Releva 7 fuentes públicas, normaliza modalidad/geografía/seniority,
deduplica entre portales y escribe un snapshot por día.

```bash
cd xscraper
node cli.mjs          # corrida completa → data.json + history/<fecha>.json
node cli.mjs --diff   # qué abrió y qué cerró respecto del snapshot anterior
```

Detalle del pipeline y cómo agregar una fuente: [`xscraper/README.md`](xscraper/README.md).

## Panel de analista

```bash
cd apps/radar && npm install && npm run dev   # http://127.0.0.1:4322
```

Segunda app, sin landing ni registro: KPIs, apertura/cierre diario, distribuciones y tabla
completa. Se actualiza con el cron de GitHub Actions, que commitea el snapshot y dispara el
redeploy en Vercel. Detalle en [`apps/radar/README.md`](apps/radar/README.md).

## Base de datos

`db/supabase.sql` es el archivo que se ejecuta (crea tablas, RLS, triggers y semilla de fuentes).
`db/schema.sql` es la versión portable sin Supabase, para referencia.

## Documentación

- [DER y decisiones del modelo](docs/der.md)
- [Estructura, stack y orden de construcción](docs/estructura.md)
