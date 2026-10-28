import type { APIRoute } from 'astro';
import { createSupabase } from '../../lib/supabase';
import { currentOrgId } from '../../lib/jobs';

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'no autenticado' }), { status: 401 });

  const body = await request.json().catch(() => null);
  const name = String(body?.name ?? '').trim();
  const filters = body?.filters;
  if (!name || typeof filters !== 'object') {
    return new Response(JSON.stringify({ error: 'nombre y filtros son obligatorios' }), { status: 400 });
  }

  const supabase = createSupabase(cookies);
  if (!supabase) return new Response(JSON.stringify({ error: 'supabase no configurado' }), { status: 503 });

  const orgId = await currentOrgId(supabase);
  if (!orgId) return new Response(JSON.stringify({ error: 'el usuario no tiene organización' }), { status: 409 });

  const { data, error } = await supabase
    .from('saved_searches')
    .insert({ org_id: orgId, created_by: locals.user.id, name, filters })
    .select('id')
    .single();

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 });
  return new Response(JSON.stringify({ id: data.id }), { status: 201, headers: { 'content-type': 'application/json' } });
};
