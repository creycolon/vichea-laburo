import type { APIRoute } from 'astro';
import { createSupabase } from '../../lib/supabase';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  const role = String(form.get('role') ?? '');
  if (!email.includes('@')) return redirect('/?alta=error#alta');

  const supabase = createSupabase(cookies);
  if (!supabase) return redirect('/?alta=demo#alta');

  const { error } = await supabase.from('waitlist').insert({ email, role_hint: role, source: 'landing' });
  // Email repetido no es un error para el usuario: ya está en la lista.
  if (error && error.code !== '23505') return redirect('/?alta=error#alta');
  return redirect('/?alta=ok#alta');
};
