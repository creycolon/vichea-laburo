import { defineMiddleware } from 'astro:middleware';
import { getUser } from './lib/supabase';

const PROTECTED = ['/panel', '/busquedas'];

export const onRequest = defineMiddleware(async (context, next) => {
  const { user, configured } = await getUser(context.cookies);

  // Modo demostración: sólo en desarrollo, sólo si Supabase no está configurado y
  // sólo si se pide explícitamente con DEV_DEMO=1. Sirve para ver el panel sin backend.
  const demo = import.meta.env.DEV && !configured && (process.env.DEV_DEMO === '1' || (import.meta.env as any).DEV_DEMO === '1');
  context.locals.user = user ?? (demo
    ? ({ id: 'demo', email: 'demo@radar.local', user_metadata: { name: 'demo' } } as any)
    : null);
  context.locals.configured = configured;

  const isProtected = PROTECTED.some((p) => context.url.pathname.startsWith(p));
  if (isProtected && !context.locals.user) {
    const next = encodeURIComponent(context.url.pathname + context.url.search);
    return context.redirect(`/login?next=${next}`);
  }
  if (!demo && context.locals.user && ['/login', '/registro'].includes(context.url.pathname)) {
    return context.redirect('/panel');
  }
  return next();
});
