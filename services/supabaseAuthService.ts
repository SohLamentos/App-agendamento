import { supabase } from './supabase';

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw new Error('E-mail ou senha inválidos.');
  }

  const user = data.user;

  if (!user) {
    throw new Error('Usuário não encontrado.');
  }

  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (profileError || !profile) {
    throw new Error('Perfil não encontrado.');
  }

  if (!profile.active) {
    throw new Error('Usuário desativado.');
  }

  localStorage.setItem(
    'etn_user_profile',
    JSON.stringify(profile)
  );

  return profile;
}

export async function signOut() {
  await supabase.auth.signOut();
  localStorage.removeItem('etn_user_profile');
}

export async function getCurrentProfile() {
  const { data } = await supabase.auth.getUser();

  if (!data.user) return null;

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', data.user.id)
    .single();

  return profile;
}
