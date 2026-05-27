import { supabase } from './supabase';

const APP_ID = 'agendamento_certificacao';

export async function loadAppState(groupId: string) {
  const { data, error } = await supabase
    .from('app_state')
    .select('*')
    .eq('app_id', 'agendamento_certificacao')
    .eq('group_id', groupId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}
    throw error;
  }

  return data;
}

export async function saveAppState(groupId: string, payload: any) {
  const row = {
    app_id: APP_ID,
    group_id: groupId,
    data: payload,
    updated_at: new Date().toISOString(),
  };

  const { data: updated, error: updateError } = await supabase
    .from('app_state')
    .update(row)
    .eq('app_id', APP_ID)
    .eq('group_id', groupId)
    .select()
    .maybeSingle();

  if (updateError) {
    throw updateError;
  }

  if (updated) {
    return updated;
  }

  const { data: inserted, error: insertError } = await supabase
    .from('app_state')
    .insert([row])
    .select()
    .single();

  if (insertError) {
    throw insertError;
  }

  return inserted;
}

export async function saveAppStateHistory(params: {
  groupId: string;
  data: any;
  createdBy?: string;
  reason?: string;
}) {
  const { data, error } = await supabase
    .from('app_state_history')
    .insert([
      {
        app_id: APP_ID,
        group_id: params.groupId,
        data: params.data,
        created_by: params.createdBy ?? 'SYSTEM',
        reason: params.reason ?? 'AUTO_BACKUP',
      },
    ])
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function listAppStateHistory(groupId: string, limit = 50) {
  const { data, error } = await supabase
    .from('app_state_history')
    .select('*')
    .eq('app_id', APP_ID)
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return data;
}

export async function getAppStateHistoryEntry(historyId: string) {
  const { data, error } = await supabase
    .from('app_state_history')
    .select('*')
    .eq('app_id', APP_ID)
    .eq('id', historyId)
    .single();

  if (error) throw error;

  return data;
}

export async function restoreAppStateFromHistory(
  historyId: string,
  restoredBy = 'SYSTEM'
) {
  const history = await getAppStateHistoryEntry(historyId);

  if (!history?.data || !history.group_id) {
    throw new Error('Backup histórico inválido ou vazio.');
  }

  const current = await loadAppState(history.group_id);

  if (current?.data) {
    await saveAppStateHistory({
      groupId: history.group_id,
      data: {
        ...current.data,
        _backupMeta: {
          createdAt: new Date().toISOString(),
          createdBy: restoredBy,
          reason: 'AUTO_BACKUP_BEFORE_RESTORE',
          sourceHistoryId: historyId,
        },
      },
      createdBy: restoredBy,
      reason: 'AUTO_BACKUP_BEFORE_RESTORE',
    });
  }

  const restored = await saveAppState(history.group_id, {
    ...history.data,
    _restoreMeta: {
      restoredAt: new Date().toISOString(),
      restoredBy,
      sourceHistoryId: historyId,
    },
  });

  await saveAppStateHistory({
    groupId: history.group_id,
    data: restored.data,
    createdBy: restoredBy,
    reason: `RESTORE_FROM_HISTORY:${historyId}`,
  });

  return restored;
}
