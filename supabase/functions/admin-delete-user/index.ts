import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Token não informado.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();

    const { userId, email } = body;

    if (!userId && !email) {
      return new Response(JSON.stringify({ error: 'Informe userId ou email.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey =
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY_LEGACY');

    if (!serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Service Role Key não configurada.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      }
    );

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: requesterProfile } = await userClient
      .from('user_profiles')
      .select('*')
      .single();

    if (!requesterProfile) {
      return new Response(JSON.stringify({ error: 'Solicitante inválido.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const requesterRole = String(requesterProfile.role || '').toLowerCase();
    const requesterGroup = requesterProfile.group_id;

    const { data: targetProfile } = await adminClient
      .from('user_profiles')
      .select('*')
      .or(userId ? `user_id.eq.${userId},id.eq.${userId}` : `email.eq.${email}`)
      .maybeSingle();

    if (!targetProfile) {
      return new Response(JSON.stringify({ error: 'Usuário não encontrado em user_profiles.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (targetProfile.is_global_admin === true || String(targetProfile.role).toLowerCase() === 'admin') {
      return new Response(JSON.stringify({ error: 'Não é permitido excluir ADMIN.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (
      requesterProfile.is_global_admin !== true &&
      requesterRole !== 'admin' &&
      !(requesterRole === 'gestor' && requesterGroup === targetProfile.group_id)
    ) {
      return new Response(JSON.stringify({ error: 'Sem permissão para excluir este usuário.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await adminClient
      .from('user_profiles')
      .delete()
      .eq('id', targetProfile.id);

    if (targetProfile.user_id) {
      const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(
        targetProfile.user_id
      );

      if (deleteAuthError) {
        return new Response(
          JSON.stringify({
            error: deleteAuthError.message || 'Perfil removido, mas falhou ao excluir Auth.',
          }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err?.message || 'Erro inesperado.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
