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

`.env` puede traer `DEV_DEMO=1`. Sólo en desarrollo, y sólo si Supabase no está configurado,
permite entrar a `/panel` con una sesión falsa (`demo@radar.local`) para revisar el diseño.
El panel muestra un cartel amarillo; nunca se activa en producción ni con claves presentes.

## Endpoints

| Ruta | Método | Qué hace |
|---|---|---|
| `/api/auth/login` | POST | Email + contraseña → cookie de sesión |
| `/api/auth/registro` | POST | Crea usuario y dispara verificación por email |
| `/api/auth/recuperar` | POST | Envía enlace de reset (respuesta neutra exista o no la cuenta) |
| `/api/auth/logout` | POST | Cierra sesión |
| `/api/waitlist` | POST | Guarda email en `waitlist` (RLS: insert anónimo, lectura cerrada) |
| `/auth/confirm` | GET | Verifica el token del correo y redirige al panel |

## Variables de entorno

| Variable | Para qué |
|---|---|
| `SUPABASE_URL` | URL del proyecto |
| `SUPABASE_ANON_KEY` | Clave pública (la seguridad la da RLS, no el secreto de la clave) |
| `PUBLIC_SITE_URL` | Base de los links de confirmación y reset |
| `DEV_DEMO` | `1` habilita el panel de demostración en desarrollo |

Astro sólo expone en `import.meta.env` las variables con prefijo `PUBLIC_`; las del servidor se leen
de `process.env` con fallback (ver `src/lib/supabase.ts`).
