# Estructura del sistema

## Stack recomendado

| Capa | Elección | Por qué |
|---|---|---|
| App | **Astro 5 (SSR, adapter Node) + TypeScript** | Landing estática y rápida por defecto; las páginas que necesitan sesión son server-rendered |
| DB | **Postgres (Supabase)** | El schema necesita `jsonb`, `tsvector`, enums y constraints reales |
| Auth | **Supabase Auth** | Email+password, verificación, reset y OAuth resueltos; `auth.users` + RLS en la base |
| Acceso a datos | **supabase-js con cookies (`@supabase/ssr`)** | La sesión viaja en cookie httpOnly y las policies de RLS son la última línea de defensa |
| UI | **CSS propio** (sin framework) | Control total del diseño de la landing; cero dependencias de UI |
| Email | **SMTP de Supabase / Resend** | Verificación y reset ya salen por Supabase Auth |
| Deploy | **Vercel/Netlify (app) + Supabase (DB+Auth)** | Sin VPS; el cron del scraper corre aparte |
| Scraper | **Proceso aparte** (Node + cron) | No debe correr en el request de un usuario, ni en el runtime de la landing |

Separar el scraper de la app no es purismo: son ciclos de vida distintos. La app escala con requests; el scraper corre por reloj, tarda minutos y puede fallar solo.

## Estructura de carpetas

```
.
├── docs/
│   ├── der.md                 # el modelo, explicado
│   └── estructura.md
├── db/
│   ├── supabase.sql           # DDL que se ejecuta (auth + RLS + semillas)
│   └── schema.sql             # referencia portable, sin Supabase
├── apps/
│   └── web/                   # Astro: landing + auth + panel
│       ├── src/
│       │   ├── pages/
│       │   │   ├── index.astro        # landing
│       │   │   ├── login.astro
│       │   │   ├── registro.astro
│       │   │   ├── recuperar.astro
│       │   │   ├── panel.astro        # protegida por middleware
│       │   │   ├── auth/confirm.astro # verificación de email
│       │   │   └── api/               # endpoints de auth + waitlist
│       │   ├── layouts/Layout.astro
│       │   ├── lib/supabase.ts        # cliente SSR + getUser
│       │   ├── lib/stats.ts           # puente al snapshot del scraper
│       │   ├── middleware.ts          # protege /panel, hidrata locals.user
│       │   └── styles/global.css
│       └── .env.example
└── job-radar/                 # el scraper actual (aún escribe data.json)
    ├── fetch.mjs
    ├── diff.mjs
    ├── template.html
    └── history/               # un snapshot por día
```

## Las tres capas y su contrato

**1. Ingesta (scraper).** Escribe `crawl_runs`, `job_source_records`, `jobs`, `job_events`. Nunca lee de la app. Es el único que habla con portales externos.

**2. Dominio (app).** Lee `jobs` ya normalizado. No sabe qué es un selector CSS ni que Computrabajo existe.

**3. Presentación (landing + panel).** La landing es pública y estática; el panel requiere sesión y filtra por `org_id`.

## Landing: qué tiene que tener para no ser un template

1. **Tesis en el primer scroll.** Una frase que diga qué dato se vuelve decisión: *"Quién está contratando junior en Argentina esta semana, y hace cuántos días busca."*
2. **Prueba viva, no capturas.** Un contador real desde la DB: ofertas abiertas hoy, empresas, variación semanal. Se calcula en el servidor, se muestra sin login.
3. **Un solo CTA.** Email → `waitlist`, con doble opt-in por `auth_tokens`. Sin formulario de 8 campos.
4. **Señal de método.** De dónde salen los datos y con qué frecuencia se actualizan. Es lo que separa esto de un buscador de empleos.
5. **Cierre para el que no compra hoy.** Un ejemplo de reporte descargable (PDF de una página) para que el dato viaje solo.

## Auth: flujos mínimos y no negociables

- **Registro** con email + contraseña → hash `argon2id` → token de verificación (24 h) → email.
- **Login** → sesión con cookie `httpOnly`, `Secure`, `SameSite=Lax`, 30 días, rotación de token al iniciar.
- **OAuth Google** opcional, vinculable a una cuenta existente por email verificado.
- **Recuperación**: token de un uso, 1 hora, invalidado al usarse y al cambiar la contraseña.
- **Rate limit** en login y recuperación (por IP y por cuenta).
- **Middleware** que protege `(app)/*` y redirige a `/login?next=`.
- **Roles** desde el día uno: `owner` (facturación), `admin` (miembros), `member` (uso), `viewer` (solo lectura).

Nunca guardar: token en claro, contraseña reversible, ni sesión sin expiración.

## Orden de construcción sugerido

1. `db/schema.sql` → migración inicial → base vacía en Neon.
2. Auth completo (registro, verificación, login, recuperación) con tests de los flujos.
3. Landing con contadores reales leyendo de la DB.
4. Panel: listado de ofertas con filtros (el `index.html` actual es el prototipo visual).
5. Scraper escribiendo a Postgres en vez de a `data.json`.
6. Alertas + `api_keys`.

El paso 5 es el que cambia todo: mientras el scraper escriba archivos, la app no tiene de dónde leer.
