import { createServerClient } from '@supabase/ssr';
import type { AstroCookies } from 'astro';

// Astro sólo expone en import.meta.env las variables con prefijo PUBLIC_, así que las
// claves del servidor se leen de process.env (Astro carga .env ahí) con fallback.
const env = (key: string): string | undefined =>
  // import.meta.env no existe fuera de Vite (tests en Node): optional chaining a propósito.
  ((import.meta as any).env as Record<string, any> | undefined)?.[key] ??
  (process.env as Record<string, any>)[key];

export const SUPABASE_URL = env('SUPABASE_URL');
export const SUPABASE_ANON_KEY = env('SUPABASE_ANON_KEY');

/** true cuando hay claves configuradas. Si es false, la app funciona en modo demostración. */
export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/**
 * Cliente de Supabase atado a las cookies del request.
 * Devuelve null si faltan las variables de entorno: las páginas deben manejar ese caso
 * en vez de romper, porque en desarrollo sin claves la landing tiene que seguir viéndose.
 */
/**
 * AstroCookies no expone getAll() ni el header: hay que pasar el header `cookie` del request.
 * El adaptador de @supabase/ssr necesita poder enumerar todas las cookies de la sesión.
 */
export function parseCookieHeader(header?: string | null): { name: string; value: string }[] {
  const out: { name: string; value: string }[] = [];
  for (const part of String(header ?? '').split(';')) {
    const raw = part.trim();
    if (!raw) continue;
    const eq = raw.indexOf('=');
    if (eq < 1) continue;
    const name = raw.slice(0, eq).trim();
    let value = raw.slice(eq + 1).trim();
    try { value = decodeURIComponent(value); } catch { /* valor no codificado */ }
    out.push({ name, value });
  }
  return out;
}

export function createSupabase(cookies: AstroCookies, cookieHeader?: string | null) {
  if (!isConfigured) return null;

  return createServerClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => parseCookieHeader(cookieHeader),
      setAll: (list) => {
        for (const { name, value, options } of list) {
          cookies.set(name, value, {
            ...options,
            path: options?.path ?? '/',
            sameSite: 'lax',
            httpOnly: true,
            secure: import.meta.env.PROD,
          });
        }
      },
    },
  });
}

/**
 * Modo demostración: deja entrar a /panel y /busquedas sin backend, con un usuario ficticio
 * y un cartel visible. Se activa con PUBLIC_DEMO=1 (pensado para mostrar el producto antes de
 * tener Supabase) o con DEV_DEMO=1 en desarrollo. Nunca se activa si Supabase está configurado.
 */
export const demoEnabled = () =>
  (import.meta.env as Record<string, any>).PUBLIC_DEMO === '1' ||
  (import.meta.env.DEV &&
    ((process.env as Record<string, any>).DEV_DEMO === '1' || (import.meta.env as Record<string, any>).DEV_DEMO === '1'));

/** Sesión actual (o null). Nunca lanza: si Supabase falla, se trata como anónimo. */
export async function getUser(cookies: AstroCookies, cookieHeader?: string | null) {
  const supabase = createSupabase(cookies, cookieHeader);
  if (!supabase) return { user: null, configured: false as const };
  const { data } = await supabase.auth.getUser();
  return { user: data.user ?? null, configured: true as const };
}
