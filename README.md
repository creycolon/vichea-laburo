# Radar Junior

Plataforma de inteligencia de demanda laboral junior/trainee en LATAM: releva portales,
deduplica las ofertas y las normaliza por empresa, ubicación, modalidad y área.

```
apps/web/     # landing + auth + panel (Astro 5 SSR + Supabase)
job-radar/    # scraper de fuentes públicas (hoy escribe data.json)
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

## Scraper

```bash
cd job-radar
node fetch.mjs    # releva fuentes, filtra y escribe data.json + history/<fecha>.json
node diff.mjs     # compara los dos últimos snapshots
```

## Base de datos

`db/supabase.sql` es el archivo que se ejecuta (crea tablas, RLS, triggers y semilla de fuentes).
`db/schema.sql` es la versión portable sin Supabase, para referencia.

## Documentación

- [DER y decisiones del modelo](docs/der.md)
- [Estructura, stack y orden de construcción](docs/estructura.md)
