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

export async function createUserProfile(input: CreateUserProfileInput) {
  const { data, error } = await supabase.functions.invoke('admin-create-user', {
    body: input,
  });

  if (error) {
    throw new Error(error.message || 'Erro ao chamar função de criação de usuário.');
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data;
}
