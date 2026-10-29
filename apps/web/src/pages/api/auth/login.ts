import type { APIRoute } from 'astro';
import { createSupabase } from '../../../lib/supabase';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const next = String(form.get('next') ?? '/panel');

  if (!email || !password) return redirect(`/login?error=${encodeURIComponent('Completá email y contraseña')}`);

  const supabase = createSupabase(cookies, request.headers.get('cookie'));
  if (!supabase) return redirect(`/login?error=${encodeURIComponent('Supabase no está configurado: faltan SUPABASE_URL y SUPABASE_ANON_KEY')}`);

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return redirect(`/login?error=${encodeURIComponent(error.message)}&next=${encodeURIComponent(next)}`);

  return redirect(next.startsWith('/') ? next : '/panel');
};
