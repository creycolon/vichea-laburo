import type { APIRoute } from 'astro';
import { createSupabase } from '../../../lib/supabase';

export const POST: APIRoute = async ({ cookies, redirect }) => {
  await createSupabase(cookies, request.headers.get('cookie'))?.auth.signOut();
  return redirect('/');
};
