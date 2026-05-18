import { supabase } from './supabase';

export enum AuthRole {
  ADMIN = 'admin',
  GESTOR = 'gestor',
  ANALISTA = 'analista',
}

export interface AuthProfile {
  id: string;
  user_id: string;
  email: string;
  name: string;
  full_name: string;
  role: AuthRole;
  group_id: string;
  legacy_user_id?: string | null;
  analyst_profile_id?: string | null;
  normalized_login?: string | null;
  active: boolean;
  is_global_admin: boolean;
  permissions?: any;
}

class AuthService {
  async authenticate(email: string, password: string): Promise<AuthProfile> {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error || !data.user) {
      throw new Error('E-mail ou senha inválidos.');
    }

    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', data.user.id)
      .single();

    if (profileError || !profile) {
      await supabase.auth.signOut();
      throw new Error('Perfil não encontrado para este usuário.');
    }

    if (!profile.active) {
      await supabase.auth.signOut();
      throw new Error('Usuário desativado.');
    }

    this.setSession(profile);
    return profile as AuthProfile;
  }

  async logout() {
    await supabase.auth.signOut();
    localStorage.removeItem('certitech_user');
    localStorage.removeItem('certitech_session_active');
    localStorage.removeItem('etn_user_profile');
    window.location.reload();
  }

  isAuthenticated(): boolean {
    return localStorage.getItem('certitech_session_active') === 'true';
  }

  getCurrentUser(): AuthProfile | null {
    const raw = localStorage.getItem('etn_user_profile');
    if (!raw) return null;

    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private setSession(profile: AuthProfile) {
    localStorage.setItem('etn_user_profile', JSON.stringify(profile));

    localStorage.setItem(
      'certitech_user',
      JSON.stringify({
        userId: profile.legacy_user_id || profile.user_id,
        authUserId: profile.user_id,
        name: profile.normalized_login || profile.name || profile.full_name,
        fullName: profile.full_name,
        email: profile.email,
        role: profile.role,
        groupId: profile.group_id,
        isGlobalAdmin: profile.is_global_admin,
        permissions: profile.permissions || {},
        analystProfileId: profile.analyst_profile_id || null,
      })
    );

    localStorage.setItem('certitech_session_active', 'true');
  }
}

export const authService = new AuthService();
