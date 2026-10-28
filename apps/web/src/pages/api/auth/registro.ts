import type { APIRoute } from 'astro';
import { createSupabase } from '../../../lib/supabase';

export const POST: APIRoute = async ({ request, cookies, redirect, url }) => {
  const form = await request.formData();
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const name = String(form.get('name') ?? '').trim();

  if (!email || password.length < 8) {
    return redirect(`/registro?error=${encodeURIComponent('Email válido y contraseña de al menos 8 caracteres')}`);
  }

  const supabase = createSupabase(cookies);
  if (!supabase) return redirect(`/registro?error=${encodeURIComponent('Supabase no está configurado todavía')}`);

  const site = import.meta.env.PUBLIC_SITE_URL ?? url.origin;
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name }, emailRedirectTo: `${site}/auth/confirm` },
  });
  if (error) return redirect(`/registro?error=${encodeURIComponent(error.message)}`);

  return redirect(`/registro?ok=${encodeURIComponent('Te mandamos un correo para confirmar la cuenta.')}`);
};
