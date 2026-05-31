import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type RoleInput = 'Admin' | 'Gestor' | 'Analista';

function mapRole(role: RoleInput) {
  if (role === 'Admin') return 'admin';
  if (role === 'Gestor') return 'gestor';
  return 'analista';
}

function normalizeLogin(fullName: string) {
  return fullName
    .trim()
    .split(/\s+/)[0]
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Variáveis SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausentes.');
    }

    const authHeader = req.headers.get('Authorization');

    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Token ausente.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const userClient = createClient(supabaseUrl, serviceRoleKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const {
      data: { user: requester },
      error: requesterError,
    } = await userClient.auth.getUser();

    if (requesterError || !requester) {
      return new Response(JSON.stringify({ error: 'Usuário solicitante inválido.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: requesterProfile, error: requesterProfileError } = await adminClient
      .from('user_profiles')
      .select('*')
      .eq('user_id', requester.id)
      .single();

    if (requesterProfileError || !requesterProfile) {
      return new Response(JSON.stringify({ error: 'Perfil do solicitante não encontrado.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();

    const email = String(body.email || '').trim().toLowerCase();
    const fullName = String(body.fullName || '').trim();
    const role = body.role as RoleInput;
    const requestedGroupId = String(body.groupId || '').trim().toUpperCase();
    const temporaryPassword = String(body.temporaryPassword || '').trim();

    if (!email || !fullName || !role || !requestedGroupId || !temporaryPassword) {
      return new Response(JSON.stringify({ error: 'Preencha nome, e-mail, perfil, grupo e senha.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const requesterRole = String(requesterProfile.role || '').toLowerCase();
    const requesterGroupId = String(requesterProfile.group_id || '').toUpperCase();
    const isRequesterGlobalAdmin = requesterProfile.is_global_admin === true;

    let finalGroupId = requestedGroupId;

    if (requesterRole === 'gestor') {
      if (role !== 'Analista') {
        return new Response(JSON.stringify({ error: 'Gestor só pode criar analistas.' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      finalGroupId = requesterGroupId;
    }

    if (requesterRole === 'admin' && !isRequesterGlobalAdmin) {
      return new Response(JSON.stringify({ error: 'Apenas admin global pode criar usuários.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (requesterRole !== 'admin' && requesterRole !== 'gestor') {
      return new Response(JSON.stringify({ error: 'Perfil sem permissão para criar usuários.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (role === 'Admin' && !isRequesterGlobalAdmin) {
      return new Response(JSON.stringify({ error: 'Apenas admin global pode criar administradores.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (role === 'Gestor' && !isRequesterGlobalAdmin) {
      return new Response(JSON.stringify({ error: 'Apenas admin global pode criar gestores.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: existingProfile } = await adminClient
      .from('user_profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existingProfile) {
      return new Response(JSON.stringify({ error: 'Já existe perfil com este e-mail.' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: createdAuth, error: createAuthError } =
      await adminClient.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
      });

    if (createAuthError || !createdAuth.user) {
      return new Response(JSON.stringify({ error: createAuthError?.message || 'Erro ao criar Auth User.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const normalizedLogin = normalizeLogin(fullName);

    const { error: profileError } = await adminClient
      .from('user_profiles')
      .insert({
        user_id: createdAuth.user.id,
        email,
        name: normalizedLogin,
        full_name: fullName,
        role: mapRole(role),
        group_id: finalGroupId,
        legacy_user_id: null,
        analyst_profile_id: null,
        normalized_login: normalizedLogin,
        active: true,
        is_global_admin: role === 'Admin' ? true : false,
        permissions: {},
      });

    if (profileError) {
      await adminClient.auth.admin.deleteUser(createdAuth.user.id);

      return new Response(JSON.stringify({ error: profileError.message || 'Erro ao criar perfil.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      userId: createdAuth.user.id,
      email,
      fullName,
      role,
      groupId: finalGroupId,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Erro inesperado.',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
