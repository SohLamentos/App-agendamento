import { supabase } from './supabase';

export async function loadAppState(groupId: string) {
  const { data, error } = await supabase
    .from('app_state')
    .select('*')
    .eq('group_id', groupId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw error;
  }

  return data;
}

export async function saveAppState(groupId: string, payload: any) {
  const { data, error } = await supabase
    .from('app_state')
    .upsert(
      {
        group_id: groupId,
        data: payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'group_id' }
    )
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}
