import type { APIRoute } from 'astro';
import { createSupabase } from '../../../lib/supabase';

export const POST: APIRoute = async ({ request, cookies, redirect, url }) => {
  const form = await request.formData();
  const email = String(form.get('email') ?? '').trim();
  const supabase = createSupabase(cookies, request.headers.get('cookie'));
  if (!supabase) return redirect(`/recuperar?error=${encodeURIComponent('Supabase no está configurado todavía')}`);

  const site = import.meta.env.PUBLIC_SITE_URL ?? url.origin;
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${site}/panel` });
  // Respuesta idéntica exista o no la cuenta: no filtramos qué emails están registrados.
  return redirect(`/recuperar?ok=${encodeURIComponent('Si el email existe, te llega un enlace para restablecer la contraseña.')}`);
};
