import { defineMiddleware } from 'astro:middleware';
import { getUser, demoEnabled } from './lib/supabase';

const PROTECTED = ['/panel', '/busquedas'];

export const onRequest = defineMiddleware(async (context, next) => {
  const { user, configured } = await getUser(context.cookies);

  // Modo demostración: exige un opt-in explícito (PUBLIC_DEMO=1 o DEV_DEMO=1) y que
  // Supabase NO esté configurado. Sirve para mostrar el producto sin backend.
  const demo = !configured && demoEnabled();
  context.locals.user = user ?? (demo
    ? ({ id: 'demo', email: 'demo@vichea-laburo.local', user_metadata: { name: 'visitante' } } as any)
    : null);
  context.locals.configured = configured;
  context.locals.demo = demo;

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
