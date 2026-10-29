# apps/web — Vichea Laburo

Landing + autenticación + panel. Astro 5 en modo SSR con adapter de Node; la sesión la maneja
Supabase Auth y las reglas viven en la base (RLS).

## Correr en local

```bash
cd apps/web
npm install
cp .env.example .env
npm run dev          # http://127.0.0.1:4321
```

Sin claves de Supabase la app **igual arranca**: la landing se ve con los datos del scraper y los
formularios avisan que falta configuración. No inventa sesiones.

## Conectar Supabase (5 minutos)

1. Crear un proyecto gratuito en <https://supabase.com>.
2. **SQL Editor** → pegar el contenido de [`../../db/supabase.sql`](../../db/supabase.sql) → Run.
3. **Project Settings → API** → copiar `Project URL` y `anon public key` al `.env`:

   ```
   SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_ANON_KEY=eyJhbGciOi...
   PUBLIC_SITE_URL=http://127.0.0.1:4321
   ```

4. **Authentication → URL Configuration** → agregar `http://127.0.0.1:4321/auth/confirm`
   en *Redirect URLs*.
5. Reiniciar el servidor.

Desde ese momento: registro → correo de confirmación → `/auth/confirm` → `/panel` con sesión real.

## Modo demostración

Permite mostrar el producto —landing, panel y tabla de ofertas— sin backend. Exige un opt-in
explícito y se desactiva solo si Supabase está configurado:

| Variable | Dónde | Efecto |
|---|---|---|
| `DEV_DEMO=1` | `.env` local | habilita la demo sólo en `astro dev` |
| `PUBLIC_DEMO=1` | variables de entorno del hosting | habilita la demo **también en el build de producción** |

Con la demo activa: la landing muestra "Ver demo en vivo", `/panel` y `/busquedas` abren con un
usuario ficticio (`demo@vichea-laburo.local`) y un cartel amarillo visible. Las pantallas de
registro e ingreso avisan que el registro todavía no está abierto.

**Para producción real: no setear `PUBLIC_DEMO`.** Sin esa variable, y apenas `SUPABASE_URL` y
`SUPABASE_ANON_KEY` existen, las rutas vuelven a exigir sesión de verdad (302 a `/login`).

## Afinidad y transparencia

Cada oferta se puntúa de 0 a 100 contra el perfil del visitante y **siempre viaja con las
razones** que producen el número. El perfil (habilidades, intención, modalidad, zona) vive en
`localStorage`: no se envía al servidor ni se guarda en la base.

- `src/lib/skills.ts` — taxonomía de 12 habilidades con sus términos; un término puede
  pertenecer a dos (SQL es programación y datos).
- `src/lib/fit.ts` — `scoreJob()` y `transparency()`. La segunda señala avisos fantasma
  (60+ días), empresas sin identificar o posts sin modalidad.
- `src/client/busquedas.ts` — perfil + orden por afinidad + filtro «solo ≥60%».

Sin perfil no se inventa un número: la columna muestra `—`.

Los pesos están calibrados para que un aviso que coincide en habilidad, área y seniority
llegue a ~70-90, y uno de otra área quede por debajo de 30.

## Endpoints

| Ruta | Método | Qué hace |
|---|---|---|
| `/api/auth/login` | POST | Email + contraseña → cookie de sesión |
| `/api/auth/registro` | POST | Crea usuario y dispara verificación por email |
| `/api/auth/recuperar` | POST | Envía enlace de reset (respuesta neutra exista o no la cuenta) |
| `/api/auth/logout` | POST | Cierra sesión |
| `/api/waitlist` | POST | Guarda email en `waitlist` (RLS: insert anónimo, lectura cerrada) |
| `/auth/confirm` | GET | Verifica el token del correo y redirige al panel |

## Deploy (Vercel)

El proyecto usa dos adapters según el entorno: `@astrojs/node` en local y `@astrojs/vercel`
cuando existe la variable `VERCEL` (la define Vercel sola en su build). No hay que cambiar nada
a mano al desplegar.

1. Importar el repo en Vercel → **Root Directory: `apps/web`**.
2. Framework preset: **Astro** (lo detecta solo).
3. Variables de entorno: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `PUBLIC_SITE_URL`
   (esta última con el dominio final, sin barra al final).
4. Deploy.
5. En Supabase → **Authentication → URL Configuration**, agregar
   `https://TU-DOMINIO/auth/confirm` a las Redirect URLs. Sin esto, los mails de verificación
   vuelven a localhost.

**Datos en el deploy:** el `prebuild` copia `xscraper/data.json` a `src/data/latest.json` y Vite lo
embebe en el bundle. Si el directorio padre no estuviera disponible en el build, el script avisa y
usa el `latest.json` versionado — el sitio no se rompe, muestra el último snapshot conocido.
Consecuencia: **cada deploy congela los datos**; para que se actualicen solos hace falta la ingesta
a Postgres.

**Build de Vercel verificado en local:**

```bash
VERCEL=1 npm run build      # genera .vercel/output (Build Output API v3)
npm run build               # genera dist/ standalone para Node
```

## Variables de entorno

| Variable | Para qué |
|---|---|
| `SUPABASE_URL` | URL del proyecto |
| `SUPABASE_ANON_KEY` | Clave pública (la seguridad la da RLS, no el secreto de la clave) |
| `PUBLIC_SITE_URL` | Base de los links de confirmación y reset |
| `DEV_DEMO` | `1` habilita el panel de demostración en desarrollo |

Astro sólo expone en `import.meta.env` las variables con prefijo `PUBLIC_`; las del servidor se leen
de `process.env` con fallback (ver `src/lib/supabase.ts`).
