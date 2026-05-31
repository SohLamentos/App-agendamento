import { supabase } from './supabase';
import { UserRole } from '../types';

interface CreateUserProfileInput {
  email: string;
  fullName: string;
  role: UserRole;
  groupId: string;
  temporaryPassword: string;
  managerId?: string;
}

function mapRoleToSupabase(role: UserRole) {
  if (role === UserRole.ADMIN) return 'admin';
  if (role === UserRole.MANAGER) return 'gestor';
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

export async function createUserProfile(input: CreateUserProfileInput) {
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  const groupId = input.groupId.trim().toUpperCase();

  if (!email || !fullName || !groupId || !input.temporaryPassword) {
    throw new Error('Preencha nome, e-mail, grupo e senha temporária.');
  }

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password: input.temporaryPassword,
  });

  if (signUpError) {
    throw new Error(signUpError.message || 'Erro ao criar usuário no Supabase Auth.');
  }

  const authUserId = signUpData.user?.id;

  if (!authUserId) {
    throw new Error('Usuário Auth não retornado pelo Supabase.');
  }

  const { error: profileError } = await supabase
    .from('user_profiles')
    .insert({
      user_id: authUserId,
      email,
      name: normalizeLogin(fullName),
      full_name: fullName,
      role: mapRoleToSupabase(input.role),
      group_id: groupId,
      analyst_profile_id: input.managerId || null,
      normalized_login: normalizeLogin(fullName),
      active: true,
      is_global_admin: false,
      permissions: {},
    });

  if (profileError) {
    throw new Error(profileError.message || 'Erro ao criar perfil do usuário.');
  }

  return {
    authUserId,
    email,
    fullName,
    role: input.role,
    groupId,
  };
}
