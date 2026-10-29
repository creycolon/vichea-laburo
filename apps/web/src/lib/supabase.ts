import { createServerClient } from '@supabase/ssr';
import type { AstroCookies } from 'astro';

// Astro sólo expone en import.meta.env las variables con prefijo PUBLIC_, así que las
// claves del servidor se leen de process.env (Astro carga .env ahí) con fallback.
const env = (key: string): string | undefined =>
  (import.meta.env as Record<string, any>)[key] ?? (process.env as Record<string, any>)[key];

export const SUPABASE_URL = env('SUPABASE_URL');
export const SUPABASE_ANON_KEY = env('SUPABASE_ANON_KEY');

/** true cuando hay claves configuradas. Si es false, la app funciona en modo demostración. */
export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/**
 * Cliente de Supabase atado a las cookies del request.
 * Devuelve null si faltan las variables de entorno: las páginas deben manejar ese caso
 * en vez de romper, porque en desarrollo sin claves la landing tiene que seguir viéndose.
 */
export function createSupabase(cookies: AstroCookies) {
  if (!isConfigured) return null;

  return createServerClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookies.getAll().map(({ name, value }) => ({ name, value })),
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
export async function getUser(cookies: AstroCookies) {
  const supabase = createSupabase(cookies);
  if (!supabase) return { user: null, configured: false as const };
  const { data } = await supabase.auth.getUser();
  return { user: data.user ?? null, configured: true as const };
}
