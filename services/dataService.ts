
import { saveAppState, loadAppState, saveAppStateHistory, listAppStateHistory } from './appStateService';
import { supabase } from './supabase';
import { 
  mockUsers, mockCities, mockClasses, mockTechnicians, mockEvents
} from './mockData';
import { 
  User, UserRole, Technician, CertificationProcessStatus, ApprovalStatus, 
  TrainingClass, CertificationSchedule, 
  ExpertiseType, Shift, ScheduleStatus, EventSchedule, ParticipationStatus, TrainingStatus,
  AnalystDemandMetrics, SchedulingConfig, Group, GroupRule, CityGroup, CertificationCity,
  VirtualScoreAdjustment, IntegrationBase, RoutingRule, AnalystIntegrationMapping
} from '../types';
import { auditService } from './auditService';
import * as XLSX from 'xlsx';

export interface ImportError {
  line: number;
  field: string;
  reason: string;
  value: any;
}


export interface ImportResult {
  inserted: number;
  updated: number;
  ignored: number;
  duplicatedInClass: number;
  newInOtherClass: number;
  errors: ImportError[];
}

export interface ManualScheduleValidationResult {
  canSchedule: boolean;
  brokenRules: string[];
  needsForce: boolean;
}

export interface SchedulingSummary {
  scheduled: number;
  backlog: number;
  reasons: Record<string, number>;
}
export interface AppStateHistoryEntry {
  id: string;
  group_id: string;
  data: any;
  created_at: string;
  created_by?: string;
  reason?: string;
}

export const StatusEngine = [
  { 
    key: 'technicians', 
    label: 'FILA — TREINAMENTO COM CERTIFICAÇÃO', 
    filter: (t: Technician) => t.status_principal === 'PENDENTE_CERTIFICAÇÃO' || t.status_principal === 'PENDENTE_TRATAMENTO' || t.status_principal === 'BACKLOG AGUARDANDO' 
  },
  { 
    key: 'training_no_cert', 
    label: 'FILA — TREINAMENTO SEM CERTIFICAÇÃO', 
    filter: (t: Technician) => t.status_principal === 'TREINAMENTO SEM CERTIFICAÇÃO'
  },
  { 
    key: 'scheduled', 
    label: 'AGENDADOS', 
    filter: (t: Technician) => t.status_principal === 'AGENDADOS' || t.certificationProcessStatus === CertificationProcessStatus.SCHEDULED 
  },
  { 
    key: 'approved', 
    label: 'APROVADOS', 
    filter: (t: Technician) => t.status_principal === 'APROVADOS' || t.certificationProcessStatus === CertificationProcessStatus.CERTIFIED_APPROVED 
  },
  { 
    key: 'pending', 
    label: 'PENDENTES', 
    filter: (t: Technician) => t.status_principal === 'PENDENTE' 
  },
  { 
    key: 'failed', 
    label: 'REPROVADOS', 
    filter: (t: Technician) => t.status_principal === 'REPROVADO' || t.certificationProcessStatus === CertificationProcessStatus.CERTIFIED_REPROVED_1 || t.certificationProcessStatus === CertificationProcessStatus.CERTIFIED_REPROVED_2 
  },
  { 
    key: 'analyst_cancelled', 
    label: 'CANC. ANALISTA', 
    filter: (t: Technician) => t.status_principal === 'CANCELADO_ANALISTA' || t.status_principal === 'CANCELADOS (ANALISTA)' || t.certificationProcessStatus === CertificationProcessStatus.CANCELLED_BY_ANALYST 
  },
  { 
    key: 'ineligible', 
    label: 'INABILITADOS', 
    filter: (t: Technician) => t.status_principal === 'INABILITADO' || t.certificationProcessStatus === CertificationProcessStatus.INABILITADO 
  }
];

const normalizeText = (value?: string): string => {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
};

const normalizeUF = (value?: string): string => {
  return String(value || '').toUpperCase().trim();
};

class DataService {
  private users: User[];
  private groups: Group[];
  private groupRules: GroupRule[];
  private cities: CityGroup[];
  private technicians: Technician[];
  private trainingClasses: TrainingClass[];
  private schedules: CertificationSchedule[];
  private schedulesTeste: CertificationSchedule[];
  private events: EventSchedule[];
  private schedulingConfig: SchedulingConfig;
  private testModeActive: boolean = false;
  private scoreAdjustments: VirtualScoreAdjustment[];
  private integrationBases: IntegrationBase[];
private routingRules: RoutingRule[];
private analystMappings: AnalystIntegrationMapping[];

  constructor() {
    const savedGroups = localStorage.getItem('g_groups_v15');
    const savedRules = localStorage.getItem('g_rules_v15');
    const savedCities = localStorage.getItem('g_cities_v15');
    const savedUsers = localStorage.getItem('g_users_v15');
    const savedTechs = localStorage.getItem('certitech_technicians_v15');
    const savedClasses = localStorage.getItem('certitech_classes_v15');
    const savedSchedules = localStorage.getItem('certitech_schedules_v15');
    const savedSchedulesTeste = localStorage.getItem('certitech_schedules_teste_v15');
    const savedEvents = localStorage.getItem('certitech_events_v15');
    const savedConfig = localStorage.getItem('certitech_config_v15');
    const savedTestMode = localStorage.getItem('certitech_test_mode_v15');
    const savedAdjustments = localStorage.getItem('g_score_adjustments_v15');
    const savedBases = localStorage.getItem('g_integration_bases_v1');
const savedRulesRouting = localStorage.getItem('g_routing_rules_v1');
const savedMappings = localStorage.getItem('g_analyst_mapping_v1');

    this.groups = savedGroups
      ? JSON.parse(savedGroups)
      : [{ id: 'G3', name: 'NACIONAL BASE', active: true }];

    this.groupRules = savedRules
  ? JSON.parse(savedRules)
  : [{
      groupId: 'G3',
      presencialPerShift: 3,
      virtualPerShift: 2,
      schedulingWindowDays: 10,
      active: true
    }];

    this.cities = savedCities
      ? JSON.parse(savedCities)
      : mockCities.map(c => ({
          id: c.id,
          groupId: 'G3',
          name: c.name,
          uf: c.uf,
          type: c.defaultType,
          active: true,
          responsibleAnalystIds: c.responsibleAnalystIds
        }));

    this.users = savedUsers ? JSON.parse(savedUsers) : mockUsers;
    this.ensureFixedAdmin();
this.technicians =
  savedTechs && JSON.parse(savedTechs).length > 0
    ? JSON.parse(savedTechs)
    : mockTechnicians;
this.trainingClasses =
  savedClasses && JSON.parse(savedClasses).length > 0
    ? JSON.parse(savedClasses)
    : mockClasses;

// MIGRAÇÃO: garantir audience nas turmas antigas
this.trainingClasses = this.trainingClasses.map(c => {
  if (!(c as any).audience) {
    return {
      ...c,
      audience: 'ANALISTA'
    };
  }
  return c;
});

this.schedules = savedSchedules ? JSON.parse(savedSchedules) : [];
    
    this.schedulesTeste = savedSchedulesTeste ? JSON.parse(savedSchedulesTeste) : [];
    this.events = savedEvents ? JSON.parse(savedEvents) : [];
    this.schedulingConfig = savedConfig
  ? JSON.parse(savedConfig)
  : { smartPrioritizationEnabled: true, weightCity: 10, weightPending: 5, weightActive: 2 };
this.testModeActive = savedTestMode === 'true';
this.scoreAdjustments = savedAdjustments ? JSON.parse(savedAdjustments) : [];
    this.integrationBases = savedBases ? JSON.parse(savedBases) : [];
this.routingRules = savedRulesRouting ? JSON.parse(savedRulesRouting) : [];
this.analystMappings = savedMappings ? JSON.parse(savedMappings) : [];
    }

   private getActiveGroupId() {
  const ctx = this.getContext();
  return ctx.groupId || 'G3';
}

  public async initializeFromCloud() {
  try {
    const groupId = this.getActiveGroupId();
const cloudState = await loadAppState(groupId);

    if (!cloudState?.data) {
      return false;
    }

    const payload = cloudState.data;
    if (
  !payload ||
  !Array.isArray(payload.technicians) ||
  !Array.isArray(payload.trainingClasses) ||
  !Array.isArray(payload.schedules) ||
  !Array.isArray(payload.integrationBases) ||
  !Array.isArray(payload.routingRules) ||
  !Array.isArray(payload.analystMappings)
) {
  console.warn('Supabase incompleto — ignorando carregamento para evitar perda de dados.');
  return false;
}

    this.groups = payload.groups ?? this.groups;
    this.groupRules = payload.groupRules ?? this.groupRules;
    this.cities = payload.cities ?? this.cities;
    this.users = payload.users ?? this.users;
    this.ensureFixedAdmin();
    this.technicians = payload.technicians ?? this.technicians;
    this.trainingClasses = payload.trainingClasses ?? this.trainingClasses;
    this.schedules = payload.schedules ?? this.schedules;
    this.schedulesTeste = payload.schedulesTeste ?? this.schedulesTeste;
    this.events = payload.events ?? this.events;
    this.schedulingConfig = payload.schedulingConfig ?? this.schedulingConfig;
    this.testModeActive = payload.testModeActive ?? this.testModeActive;
    this.scoreAdjustments = payload.scoreAdjustments ?? this.scoreAdjustments;
    this.integrationBases = payload.integrationBases ?? this.integrationBases;
this.routingRules = payload.routingRules ?? this.routingRules;
this.analystMappings = payload.analystMappings ?? this.analystMappings;

    localStorage.setItem('g_groups_v15', JSON.stringify(this.groups));
    localStorage.setItem('g_rules_v15', JSON.stringify(this.groupRules));
    localStorage.setItem('g_cities_v15', JSON.stringify(this.cities));
    localStorage.setItem('g_users_v15', JSON.stringify(this.users));
    localStorage.setItem('certitech_technicians_v15', JSON.stringify(this.technicians));
    localStorage.setItem('certitech_classes_v15', JSON.stringify(this.trainingClasses));
    localStorage.setItem('certitech_schedules_v15', JSON.stringify(this.schedules));
    localStorage.setItem('certitech_schedules_teste_v15', JSON.stringify(this.schedulesTeste));
    localStorage.setItem('certitech_events_v15', JSON.stringify(this.events));
    localStorage.setItem('certitech_config_v15', JSON.stringify(this.schedulingConfig));
    localStorage.setItem('certitech_test_mode_v15', this.testModeActive ? 'true' : 'false');
    localStorage.setItem('g_score_adjustments_v15', JSON.stringify(this.scoreAdjustments));
    localStorage.setItem('g_integration_bases_v1', JSON.stringify(this.integrationBases));
localStorage.setItem('g_routing_rules_v1', JSON.stringify(this.routingRules));
localStorage.setItem('g_analyst_mapping_v1', JSON.stringify(this.analystMappings));

    return true;
  } catch (error) {
    console.error('Erro ao carregar do Supabase:', error);
    return false;
  }
}

  public subscribeToCloudUpdates() {
  const groupId = this.getActiveGroupId();

  const channel = supabase
    .channel(`app_state_changes_${groupId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'app_state',
        filter: `group_id=eq.${groupId}`,
      },
      async () => {
        const updated = await this.initializeFromCloud();

        if (updated) {
          window.dispatchEvent(new Event('data-updated'));
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
  
  private persist() {
  localStorage.setItem('g_groups_v15', JSON.stringify(this.groups));
  localStorage.setItem('g_rules_v15', JSON.stringify(this.groupRules));
  localStorage.setItem('g_cities_v15', JSON.stringify(this.cities));
  localStorage.setItem('g_users_v15', JSON.stringify(this.users));
  localStorage.setItem('certitech_technicians_v15', JSON.stringify(this.technicians));
  localStorage.setItem('certitech_classes_v15', JSON.stringify(this.trainingClasses));
  localStorage.setItem('certitech_schedules_v15', JSON.stringify(this.schedules));
  localStorage.setItem('certitech_schedules_teste_v15', JSON.stringify(this.schedulesTeste));
  localStorage.setItem('certitech_events_v15', JSON.stringify(this.events));
  localStorage.setItem('certitech_config_v15', JSON.stringify(this.schedulingConfig));
  localStorage.setItem('certitech_test_mode_v15', this.testModeActive ? 'true' : 'false');
  localStorage.setItem('g_score_adjustments_v15', JSON.stringify(this.scoreAdjustments));
  localStorage.setItem('g_integration_bases_v1', JSON.stringify(this.integrationBases));
localStorage.setItem('g_routing_rules_v1', JSON.stringify(this.routingRules));
localStorage.setItem('g_analyst_mapping_v1', JSON.stringify(this.analystMappings));

  const payload = this.buildFullPayload();

  const groupId = this.getActiveGroupId();

loadAppState(groupId)
  .then((currentCloudState) => {
    const currentUser = this.getCurrentUser();

    if (currentCloudState?.data) {
      return saveAppStateHistory({
        groupId: groupId,
        data: {
          ...currentCloudState.data,
          _backupMeta: {
            createdAt: new Date().toISOString(),
            createdBy: currentUser?.fullName || 'SYSTEM',
            reason: 'AUTO_BACKUP'
          }
        },
        createdBy: currentUser?.fullName || 'SYSTEM',
        reason: 'AUTO_BACKUP',
      });
    }

    return null;
  })
  .catch((error) => {
    console.error('Erro ao salvar histórico no Supabase:', error);
    return null;
  })
  .finally(() => {
    saveAppState(groupId, payload).catch((error) => {
      console.error('Erro ao salvar no Supabase:', error);
    });
  });
}

  private async createHistoryBackup(reason: string) {
  const currentUser = this.getCurrentUser();
  const groupId = this.getActiveGroupId();

  const payload = {
    ...this.buildFullPayload(),
    _backupMeta: {
      createdAt: new Date().toISOString(),
      createdBy: currentUser?.fullName || 'SYSTEM',
      reason
    }
  };

  await saveAppStateHistory({
    groupId: groupId,
    data: payload,
    createdBy: currentUser?.fullName || 'SYSTEM',
    reason,
  });
}
  private buildFullPayload() {
  const groupId = this.getActiveGroupId();

  return {
    groups: this.groups,
    groupRules: this.groupRules.filter(r => r.groupId === groupId),
    cities: this.cities.filter(c => c.groupId === groupId),
    users: this.users.filter(u => u.groupId === groupId || u.role === UserRole.ADMIN),
    technicians: this.technicians.filter(t => t.groupId === groupId),
    trainingClasses: this.trainingClasses.filter(c => c.groupId === groupId),
    schedules: this.schedules.filter(s => s.groupId === groupId),
    schedulesTeste: this.schedulesTeste.filter(s => s.groupId === groupId),
    events: this.events.filter(e => e.groupId === groupId),
    schedulingConfig: this.schedulingConfig,
    testModeActive: this.testModeActive,
    scoreAdjustments: this.scoreAdjustments.filter(a => a.groupId === groupId),
    integrationBases: this.integrationBases.filter(b => b.groupId === groupId),
    routingRules: this.routingRules.filter(r => r.groupId === groupId),
    analystMappings: this.analystMappings.filter(m => m.groupId === groupId)
  };
}
  
 public async resetTestData(user?: User) {
  const context = this.getContext();
  const currentUser = user || this.getCurrentUser();

  if (!currentUser || currentUser.role !== UserRole.ADMIN) {
    return { success: false, message: 'Apenas administradores podem resetar a base de testes.' };
  }

  try {
    await this.createHistoryBackup('BEFORE_RESET_TEST_DATA');
    // 1) recria base padrão do grupo
    this.groups = [{ id: 'G3', name: 'NACIONAL BASE', active: true }];

    this.groupRules = [{
  groupId: 'G3',
  presencialPerShift: 3,
  virtualPerShift: 2,
  schedulingWindowDays: 10,
  active: true
}];

    this.cities = mockCities.map(c => ({
      id: c.id,
      groupId: 'G3',
      name: c.name,
      uf: c.uf,
      type: c.defaultType,
      active: true,
      responsibleAnalystIds: c.responsibleAnalystIds
    }));

    this.users = mockUsers;
    this.ensureFixedAdmin();

    // 2) limpa totalmente a base operacional
    this.technicians = [];
    this.trainingClasses = [];
    this.schedules = [];
    this.schedulesTeste = [];
    this.events = [];
    this.scoreAdjustments = [];
    this.integrationBases = [];
this.routingRules = [];
this.analystMappings = [];

    // 3) restaura config padrão
    this.schedulingConfig = {
      smartPrioritizationEnabled: true,
      weightCity: 10,
      weightPending: 5,
      weightActive: 2
    };

    this.testModeActive = false;

    // 4) limpa localStorage antigo
    const keys = [
      'g_groups_v15',
      'g_rules_v15',
      'g_cities_v15',
      'g_users_v15',
      'certitech_technicians_v15',
      'certitech_classes_v15',
      'certitech_schedules_v15',
      'certitech_schedules_teste_v15',
      'certitech_events_v15',
      'certitech_config_v15',
      'certitech_test_mode_v15',
      'g_score_adjustments_v15',
      'g_integration_bases_v1',
'g_routing_rules_v1',
'g_analyst_mapping_v1'
    ];

    keys.forEach(k => localStorage.removeItem(k));

    // 5) persiste novamente local + cloud
    this.persist();

    // 6) auditoria
    auditService.logTicket({
      user: currentUser,
      action: 'AJUSTE_PRIORIDADE_PRESENCIAL',
      targetType: 'Sistema',
      targetValue: context.groupId,
      reason: 'Reset completo da base de teste: técnicos, turmas, agendamentos, eventos, aprovações, reprovações e ajustes removidos.',
      screen: 'Administração',
      groupId: context.groupId
    });

    // 7) atualiza interface
    window.dispatchEvent(new Event('data-updated'));

    return { success: true, message: 'Base de teste resetada com sucesso.' };
  } catch (error: any) {
    console.error('Erro ao resetar base de teste:', error);
    return { success: false, message: error?.message || 'Erro ao resetar base de teste.' };
  }
}

  public safeNormalize(value: any): string {
    const s = (value === null || value === undefined) ? "" : String(value);
    return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, ' ').trim().toUpperCase();
  }
  private ensureFixedAdmin() {
  const adminPasswordHash = btoa('salt_Claro@123_G3');

  const existingAdmin = this.users.find(
    u =>
      u.role === UserRole.ADMIN &&
      (u.firstNameLogin === 'ADMIN' || u.normalizedLogin === 'ADMIN')
  );

  if (existingAdmin) {
    existingAdmin.firstNameLogin = 'ADMIN';
    existingAdmin.normalizedLogin = 'ADMIN';
    existingAdmin.fullName = existingAdmin.fullName || 'Administrador do Sistema';
    existingAdmin.groupId = existingAdmin.groupId || 'G3';
    existingAdmin.passwordHash = adminPasswordHash;
    existingAdmin.active = true;
    existingAdmin.updatedAt = new Date().toISOString();
    return;
  }

  this.users.push({
    id: 'admin-fixo-g3',
    fullName: 'Administrador do Sistema',
    normalizedLogin: 'ADMIN',
    firstNameLogin: 'ADMIN',
    email: '',
    role: UserRole.ADMIN,
    groupId: 'G3',
    managerId: undefined,
    passwordHash: adminPasswordHash,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

  private getContext() {
    const userJson = localStorage.getItem('certitech_user');
    if (!userJson) return { groupId: 'G3', role: UserRole.ANALYST, userId: '' };
    return JSON.parse(userJson);
  }

  getCurrentUser(): User {
    const ctx = this.getContext();
    return this.users.find(u => u.id === ctx.userId) || this.users[0];
  }

  setCurrentUser(user: User) {
    const firstName = user.firstNameLogin || user.fullName.split(' ')[0].toUpperCase();
    localStorage.setItem('certitech_user', JSON.stringify({
      userId: user.id,
      name: firstName,
      role: user.role,
      groupId: user.groupId,
      managerId: user.managerId
    }));
    window.location.reload();
  }

  getUsers() { return [...this.users]; }
  getCities() { return [...this.cities]; }
  getEvents() { return this.events.filter(e => e.groupId === this.getContext().groupId); }
  getSchedules() { 
    const pool = this.testModeActive ? this.schedulesTeste : this.schedules;
    return pool.filter(s => s.groupId === this.getContext().groupId); 
  }
  getTechnicians() { return this.technicians.filter(t => t.groupId === this.getContext().groupId); }
  getTrainingClasses() { return this.trainingClasses.filter(c => c.groupId === this.getContext().groupId); }
  
  public async getBackupHistory(limit = 50): Promise<AppStateHistoryEntry[]> {
  const groupId = this.getContext().groupId || 'G3';
  const data = await listAppStateHistory(groupId, limit);
  return (data || []) as AppStateHistoryEntry[];
}

  public async restoreHistoryEntry(entryId: string) {
  try {
    const history = await this.getBackupHistory(200);
    const entry = history.find(item => item.id === entryId);

    if (!entry || !entry.data) {
      throw new Error('Backup histórico não encontrado.');
    }

    await this.createHistoryBackup('BEFORE_RESTORE_HISTORY_ENTRY');

    const parsed = entry.data;

    this.groups = Array.isArray(parsed.groups) ? parsed.groups : this.groups;
    this.groupRules = Array.isArray(parsed.groupRules) ? parsed.groupRules : this.groupRules;
    this.cities = Array.isArray(parsed.cities) ? parsed.cities : this.cities;
    this.users = Array.isArray(parsed.users) ? parsed.users : this.users;
    this.ensureFixedAdmin();
    this.technicians = Array.isArray(parsed.technicians) ? parsed.technicians : [];
    this.trainingClasses = Array.isArray(parsed.trainingClasses) ? parsed.trainingClasses : [];
    this.schedules = Array.isArray(parsed.schedules) ? parsed.schedules : [];
    this.schedulesTeste = Array.isArray(parsed.schedulesTeste) ? parsed.schedulesTeste : [];
    this.events = Array.isArray(parsed.events) ? parsed.events : [];
    this.schedulingConfig = parsed.schedulingConfig ?? this.schedulingConfig;
    this.testModeActive = typeof parsed.testModeActive === 'boolean' ? parsed.testModeActive : false;
    this.scoreAdjustments = Array.isArray(parsed.scoreAdjustments) ? parsed.scoreAdjustments : [];
    this.integrationBases = Array.isArray(parsed.integrationBases) ? parsed.integrationBases : [];
this.routingRules = Array.isArray(parsed.routingRules) ? parsed.routingRules : [];
this.analystMappings = Array.isArray(parsed.analystMappings) ? parsed.analystMappings : [];

    this.trainingClasses = this.trainingClasses.map(c => {
      if (!(c as any).audience) {
        return {
          ...c,
          audience: 'ANALISTA'
        };
      }
      return c;
    });

    this.persist();

    auditService.logTicket({
      user: this.getCurrentUser(),
      action: 'RESTORE_BACKUP_HISTORY',
      targetType: 'Sistema',
      targetValue: this.getContext().groupId,
      reason: `Restauração de histórico executada. EntryId: ${entryId}`,
      screen: 'Administração',
      groupId: this.getContext().groupId
    });

    window.dispatchEvent(new Event('data-updated'));

    return { success: true, message: 'Versão histórica restaurada com sucesso.' };
  } catch (error: any) {
    console.error('Erro ao restaurar histórico:', error);
    return { success: false, message: error?.message || 'Erro ao restaurar histórico.' };
  }
}
  
  public exportFullBackup() {
  const payload = {
    ...this.buildFullPayload(),
    exportedAt: new Date().toISOString(),
    exportedBy: this.getCurrentUser()?.fullName || 'SYSTEM',
    version: 'v15'
  };

  const blob = new Blob(
    [JSON.stringify(payload, null, 2)],
    { type: 'application/json;charset=utf-8' }
  );

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toISOString().replace(/[:.]/g, '-');

  a.href = url;
  a.download = `backup-certitech-${date}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  auditService.logTicket({
    user: this.getCurrentUser(),
    action: 'EXPORT_BACKUP_MANUAL',
    targetType: 'Sistema',
    targetValue: this.getContext().groupId,
    reason: 'Backup manual exportado em arquivo JSON.',
    screen: 'Administração',
    groupId: this.getContext().groupId
  });
}

  public async importFullBackup(file: File) {
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Arquivo de backup inválido.');
    }

    await this.createHistoryBackup('BEFORE_IMPORT_FULL_BACKUP');

    this.groups = Array.isArray(parsed.groups) ? parsed.groups : this.groups;
    this.groupRules = Array.isArray(parsed.groupRules) ? parsed.groupRules : this.groupRules;
    this.cities = Array.isArray(parsed.cities) ? parsed.cities : this.cities;
    this.users = Array.isArray(parsed.users) ? parsed.users : this.users;
    this.ensureFixedAdmin();
    this.technicians = Array.isArray(parsed.technicians) ? parsed.technicians : [];
    this.trainingClasses = Array.isArray(parsed.trainingClasses) ? parsed.trainingClasses : [];
    this.schedules = Array.isArray(parsed.schedules) ? parsed.schedules : [];
    this.schedulesTeste = Array.isArray(parsed.schedulesTeste) ? parsed.schedulesTeste : [];
    this.events = Array.isArray(parsed.events) ? parsed.events : [];
    this.schedulingConfig = parsed.schedulingConfig ?? this.schedulingConfig;
    this.testModeActive = typeof parsed.testModeActive === 'boolean' ? parsed.testModeActive : false;
    this.scoreAdjustments = Array.isArray(parsed.scoreAdjustments) ? parsed.scoreAdjustments : [];
    this.integrationBases = Array.isArray(parsed.integrationBases) ? parsed.integrationBases : [];
this.routingRules = Array.isArray(parsed.routingRules) ? parsed.routingRules : [];
this.analystMappings = Array.isArray(parsed.analystMappings) ? parsed.analystMappings : [];

    this.trainingClasses = this.trainingClasses.map(c => {
      if (!(c as any).audience) {
        return {
          ...c,
          audience: 'ANALISTA'
        };
      }
      return c;
    });

    this.persist();

    auditService.logTicket({
      user: this.getCurrentUser(),
      action: 'IMPORT_BACKUP_MANUAL',
      targetType: 'Sistema',
      targetValue: this.getContext().groupId,
      reason: `Backup manual importado${parsed.exportedAt ? ` (${parsed.exportedAt})` : ''}.`,
      screen: 'Administração',
      groupId: this.getContext().groupId
    });

    window.dispatchEvent(new Event('data-updated'));

    return { success: true, message: 'Backup restaurado com sucesso.' };
  } catch (error: any) {
    console.error('Erro ao importar backup:', error);
    return { success: false, message: error?.message || 'Erro ao importar backup.' };
  }
}
  
  public removeTrainingClassFromScheduled(classId: string): {
  success: boolean;
  removedTechniciansCount: number;
  removedSchedulesCount: number;
  message?: string;
} {
  try {
    const ctx = this.getContext();
    const currentUser = this.getCurrentUser();

    const trainingClass = this.trainingClasses.find(
      c => c.id === classId && c.groupId === ctx.groupId
    );

    if (!trainingClass) {
      return {
        success: false,
        removedTechniciansCount: 0,
        removedSchedulesCount: 0,
        message: 'Turma não encontrada.'
      };
    }

    // Técnicos vinculados à turma
    const classTechs = this.technicians.filter(
      t => t.groupId === ctx.groupId && t.trainingClassId === classId
    );

    const technicianIdsToRemove = new Set(classTechs.map(t => t.id));

    // Schedules da produção vinculados à turma/técnicos
    const prodSchedulesToRemove = this.schedules.filter(
      s =>
        s.groupId === ctx.groupId &&
        (
          s.trainingClassId === classId ||
          technicianIdsToRemove.has(s.technicianId)
        )
    );

    // Schedules de teste vinculados à turma/técnicos
    const testSchedulesToRemove = this.schedulesTeste.filter(
      s =>
        s.groupId === ctx.groupId &&
        (
          s.trainingClassId === classId ||
          technicianIdsToRemove.has(s.technicianId)
        )
    );

    const removedSchedulesCount =
      prodSchedulesToRemove.length + testSchedulesToRemove.length;

    // Remove agenda de produção
    this.schedules = this.schedules.filter(
      s =>
        !(
          s.groupId === ctx.groupId &&
          (
            s.trainingClassId === classId ||
            technicianIdsToRemove.has(s.technicianId)
          )
        )
    );

    // Remove agenda de teste
    this.schedulesTeste = this.schedulesTeste.filter(
      s =>
        !(
          s.groupId === ctx.groupId &&
          (
            s.trainingClassId === classId ||
            technicianIdsToRemove.has(s.technicianId)
          )
        )
    );

    // Remove técnicos da turma
    this.technicians = this.technicians.filter(
      t => !(t.groupId === ctx.groupId && t.trainingClassId === classId)
    );

    // Remove a turma
    this.trainingClasses = this.trainingClasses.filter(
      c => !(c.groupId === ctx.groupId && c.id === classId)
    );

    this.persist();

    auditService.logTicket({
      user: currentUser,
      action: 'REMOVER_TURMA_AGENDADOS',
      targetType: 'Turma',
      targetValue: trainingClass.id,
      reason: `Turma ${trainingClass.title || trainingClass.id} removida da aba AGENDADOS, com ${classTechs.length} técnico(s) excluído(s) e ${removedSchedulesCount} agendamento(s) removido(s), liberando a agenda dos analistas.`,
      screen: 'Turmas e Técnicos',
      groupId: ctx.groupId
    });

    window.dispatchEvent(new Event('data-updated'));

    return {
      success: true,
      removedTechniciansCount: classTechs.length,
      removedSchedulesCount
    };
  } catch (error) {
    console.error('Erro ao remover turma agendada:', error);

    return {
      success: false,
      removedTechniciansCount: 0,
      removedSchedulesCount: 0,
      message: error instanceof Error ? error.message : 'Erro ao remover turma.'
    };
  }
}

  removeTrainingClassAndTechnicians(trainingClassId: string) {
  try {
    const context = this.getContext();

    const technicians = this.getTechnicians();
    const trainingClasses = this.getTrainingClasses();
    const schedules = this.getSchedules();

    const trainingClassToRemove = trainingClasses.find(
      c => c.id === trainingClassId
    );

    if (!trainingClassToRemove) {
      throw new Error('Turma não encontrada.');
    }

    // Técnicos da turma
    const techniciansToRemove = technicians.filter(
      t => t.trainingClassId === trainingClassId
    );

    const technicianIdsToRemove = new Set(
      techniciansToRemove.map(t => t.id)
    );

    // Remove turma
    this.trainingClasses = this.trainingClasses.filter(
      c => !(c.id === trainingClassId && c.groupId === context.groupId)
    );

    // Remove técnicos
    this.technicians = this.technicians.filter(
      t => !(t.trainingClassId === trainingClassId && t.groupId === context.groupId)
    );

    // Remove agendamentos
    if (this.testModeActive) {
      this.schedulesTeste = this.schedulesTeste.filter(
        s =>
          !technicianIdsToRemove.has(s.technicianId) &&
          !(s.trainingClassId === trainingClassId && s.groupId === context.groupId)
      );
    } else {
      this.schedules = this.schedules.filter(
        s =>
          !technicianIdsToRemove.has(s.technicianId) &&
          !(s.trainingClassId === trainingClassId && s.groupId === context.groupId)
      );
    }

    // Salva no storage
    this.persist();

    return {
      success: true,
      removedTechniciansCount: techniciansToRemove.length
    };

  } catch (error) {
    console.error('Erro ao remover turma:', error);

    return {
      success: false,
      message: error instanceof Error ? error.message : 'Erro ao remover turma'
    };
  }
}
  getGroups() { return this.groups; }
  getGroupRules() { return this.groupRules; }
  getScoreAdjustments() { return this.scoreAdjustments.filter(a => a.groupId === this.getContext().groupId); }
  getIntegrationBases() {
  return this.integrationBases.filter(b => b.groupId === this.getContext().groupId);
}

getRoutingRules() {
  return this.routingRules.filter(r => r.groupId === this.getContext().groupId);
}

getAnalystMappings() {
  return this.analystMappings.filter(m => m.groupId === this.getContext().groupId);
}

  public saveIntegrationBase(base: IntegrationBase) {
  const ctx = this.getContext();

  const normalizedBase: IntegrationBase = {
    ...base,
    id: base.id || `base-${Date.now()}`,
    groupId: base.groupId || ctx.groupId || this.getActiveGroupId(),
    name: this.safeNormalize(base.name),
    city: this.safeNormalize(base.city),
    uf: this.safeNormalize(base.uf),
    address: base.address || '',
    notes: base.notes || '',
    powerAppsBaseId: base.powerAppsBaseId || '',
    active: base.active ?? true
  };

  const idx = this.integrationBases.findIndex(
    b => b.id === normalizedBase.id && b.groupId === normalizedBase.groupId
  );

  if (idx >= 0) {
    this.integrationBases[idx] = normalizedBase;
  } else {
    this.integrationBases.push(normalizedBase);
  }

  this.persist();
  window.dispatchEvent(new Event('data-updated'));
  return normalizedBase;
}

  public saveRoutingRule(rule: RoutingRule) {
  const ctx = this.getContext();

  const normalizedRule: RoutingRule = {
  ...rule,
  id: rule.id || `rule-${Date.now()}`,
  groupId: rule.groupId || ctx.groupId || this.getActiveGroupId(),
  city: this.safeNormalize(rule.city),
  uf: this.safeNormalize(rule.uf),

  coveredCities: (rule.coveredCities || []).map(c => this.safeNormalize(c)),
  coveredUfs: (rule.coveredUfs || []).map(uf => this.safeNormalize(uf)),

  analystId: rule.analystId || undefined,
  company: rule.company ? this.safeNormalize(rule.company) : undefined,
  baseId: rule.baseId,
  priority: Number(rule.priority) || 1,
  active: rule.active ?? true,
  notes: rule.notes || ''
};

  const idx = this.routingRules.findIndex(
    r => r.id === normalizedRule.id && r.groupId === normalizedRule.groupId
  );

  if (idx >= 0) {
    this.routingRules[idx] = normalizedRule;
  } else {
    this.routingRules.push(normalizedRule);
  }

  this.persist();
  window.dispatchEvent(new Event('data-updated'));
  return normalizedRule;
}

  public saveAnalystMapping(mapping: AnalystIntegrationMapping) {
  const ctx = this.getContext();

  const normalizedMapping: AnalystIntegrationMapping = {
    ...mapping,
    id: mapping.id || `map-${Date.now()}`,
    groupId: mapping.groupId || ctx.groupId || this.getActiveGroupId(),
    userId: mapping.userId,
    powerAppsUserId: mapping.powerAppsUserId || '',
    active: mapping.active ?? true
  };

  const idx = this.analystMappings.findIndex(
    m => m.id === normalizedMapping.id && m.groupId === normalizedMapping.groupId
  );

  if (idx >= 0) {
    this.analystMappings[idx] = normalizedMapping;
  } else {
    this.analystMappings.push(normalizedMapping);
  }

  this.persist();
  window.dispatchEvent(new Event('data-updated'));
  return normalizedMapping;
}

  addIntegrationBase(base: IntegrationBase) {
  return this.saveIntegrationBase(base);
}

addRoutingRule(rule: RoutingRule) {
  return this.saveRoutingRule(rule);
}

addAnalystMapping(mapping: AnalystIntegrationMapping) {
  return this.saveAnalystMapping(mapping);
}

  isTestMode() { return this.testModeActive; }
  setTestMode(v: boolean) { this.testModeActive = v; this.persist(); window.dispatchEvent(new Event('data-updated')); }

  /**
   * Rotina Automática: Move técnicos AGENDADOS para APROVADOS após a data de certificação passar (D+1).
   * Executada ao carregar o app.
   */
  public processAutoApprovals() {
    const context = this.getContext();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let changed = false;
    const currentUser = this.getCurrentUser();

    this.technicians.forEach(t => {
      // Regra: Somente se estiver no status AGENDADO e pertencer ao grupo ativo
      const isScheduled = t.groupId === context.groupId && (t.status_principal === "AGENDADOS" || t.certificationProcessStatus === CertificationProcessStatus.SCHEDULED);
      
      if (isScheduled && t.scheduledCertificationId) {
        // Exceções: Não mover se houver flag de ação manual ou status impeditivo
        const hasManualAction = t.aprovado_manual || t.reprovado_manual || t.cancelado_manual;
        if (hasManualAction) return;

        const sch = this.schedules.find(s => s.id === t.scheduledCertificationId);
        if (sch && sch.status === ScheduleStatus.CONFIRMED) {
          const certDate = new Date(sch.datetime);
          certDate.setHours(0, 0, 0, 0);

          // Lógica D+1: Se hoje >= (data_certificacao + 1 dia)
          const diffTime = today.getTime() - certDate.getTime();
          const diffDays = diffTime / (1000 * 3600 * 24);

          if (diffDays >= 1) {
            // Executar aprovação automática
            t.status_principal = "APROVADOS";
            t.certificationProcessStatus = CertificationProcessStatus.CERTIFIED_APPROVED;
            t.status_updated_at = new Date().toISOString();
            t.status_updated_by = "SISTEMA";
            
            // Gravar campos de auditoria específicos
            t.aprovado_auto = true;
            t.aprovado_auto_em = new Date().toISOString();
            t.aprovado_auto_regra = "D+1";

            // Atualizar status do agendamento para concluído
            sch.status = ScheduleStatus.COMPLETED;

            changed = true;

            // Logar Ticket de Auditoria
            auditService.logTicket({
              user: currentUser,
              action: 'APROVACAO_AUTOMATICA_D+1',
              targetType: 'CPF',
              targetValue: t.cpf,
              reason: `Aprovação automática: Data certif. (${sch.datetime.split('T')[0]}) ultrapassou D+1.`,
              screen: 'Sistema',
              groupId: t.groupId
            });
          }
        }
      }
    });

    if (changed) {
      this.persist();
      window.dispatchEvent(new Event('data-updated'));
    }
  }

  public saveScoreAdjustment(
  adj: Omit<VirtualScoreAdjustment, 'id' | 'createdAt' | 'createdBy' | 'startDate' | 'endDate'>
) {
  const user = this.getCurrentUser();

  const newAdj: VirtualScoreAdjustment = {
    ...adj,
    startDate: '1900-01-01',
    endDate: '2999-12-31',
    id: `adj-${Date.now()}`,
    createdAt: new Date().toISOString(),
    createdBy: user.fullName
  };

  this.scoreAdjustments.push(newAdj);
  this.persist();

  auditService.logTicket({
    user,
    action: 'AJUSTE_PRIORIDADE_PRESENCIAL',
    targetType: 'AjusteScore',
    targetValue: adj.analystId,
    after: JSON.stringify(newAdj),
    reason: `AJUSTE MANUAL DE PRIORIDADE: ${adj.reason}`,
    screen: 'Configuração de Balanceamento',
    groupId: adj.groupId
  });

  window.dispatchEvent(new Event('data-updated'));
}

  public deleteScoreAdjustment(id: string) {
    const user = this.getCurrentUser();
    const adj = this.scoreAdjustments.find(a => a.id === id);
    if (adj) {
      this.scoreAdjustments = this.scoreAdjustments.filter(a => a.id !== id);
      this.persist();
      auditService.logTicket({
        user,
        action: 'AJUSTE_PRIORIDADE_PRESENCIAL_REMOCAO',
        targetType: 'AjusteScore',
        targetValue: adj.analystId,
        before: JSON.stringify(adj),
        screen: 'Configuração de Balanceamento',
        groupId: adj.groupId
      });
      window.dispatchEvent(new Event('data-updated'));
    }
  }

  public resetScoreAdjustmentsByAnalyst(analystId: string) {
  const user = this.getCurrentUser();

  const analystAdjustments = this.scoreAdjustments.filter(
    a =>
      a.analystId === analystId &&
      a.groupId === user.groupId
  );

  if (analystAdjustments.length === 0) {
    return { success: true, removed: 0 };
  }

  this.scoreAdjustments = this.scoreAdjustments.filter(
    a => !(a.analystId === analystId && a.groupId === user.groupId)
  );

  this.persist();

  auditService.logTicket({
    user,
    action: 'RESET_PRIORIDADE_PRESENCIAL',
    targetType: 'Analista',
    targetValue: analystId,
    before: JSON.stringify(analystAdjustments),
    reason: 'Todos os ajustes de score do analista foram removidos manualmente.',
    screen: 'Configuração de Balanceamento',
    groupId: user.groupId
  });

  window.dispatchEvent(new Event('data-updated'));

  return { success: true, removed: analystAdjustments.length };
}

  private resolveBaseForScheduling(params: {
  city?: string;
  uf?: string;
  analystId?: string;
  company?: string;
}): { base: IntegrationBase | null; rule: RoutingRule | null } {
  const cityNorm = this.safeNormalize(params.city || '');
  const ufNorm = this.safeNormalize(params.uf || '');
  const companyNorm = this.safeNormalize(params.company || '');

  const validRules = this.routingRules
    .filter(r => r.active)
    const validRules = this.routingRules
  .filter(r => r.active)
  .filter(r => {
    const mainCity = this.safeNormalize(r.city);
    const coveredCities = (r.coveredCities || []).map(c => this.safeNormalize(c));

    return mainCity === cityNorm || coveredCities.includes(cityNorm);
  })
  .filter(r => this.safeNormalize(r.uf) === ufNorm)
  .sort((a, b) => (a.priority || 999) - (b.priority || 999));
    .filter(r => this.safeNormalize(r.uf) === ufNorm)
    .sort((a, b) => (a.priority || 999) - (b.priority || 999));

  const match =
    validRules.find(r =>
      r.analystId === params.analystId &&
      this.safeNormalize(r.company || '') === companyNorm
    ) ||
    validRules.find(r =>
      r.analystId === params.analystId &&
      !r.company
    ) ||
    validRules.find(r =>
      !r.analystId &&
      this.safeNormalize(r.company || '') === companyNorm
    ) ||
    validRules.find(r =>
      !r.analystId &&
      !r.company
    );

  if (!match) {
    return { base: null, rule: null };
  }

  const base = this.integrationBases.find(b => b.id === match.baseId && b.active) || null;

  return { base, rule: match };
}
  private getBusinessDays(startDateIso: string, count: number): string[] {
    const days: string[] = [];
    let d = new Date(startDateIso + 'T00:00:00');
    while (days.length < count) {
      if (d.getDay() !== 0 && d.getDay() !== 6) {
        days.push(d.toISOString().split('T')[0]);
      }
      d.setDate(d.getDate() + 1);
    }
    return days;
  }

  public getAnalystDemandMetrics(analystId: string): AnalystDemandMetrics {
    const user = this.users.find(u => u.id === analystId);
    if (!user || !user.analystProfileId) return { cityCount: 0, pendingPresentialCount: 0, activePresentialCount: 0, demandIndex: 0, level: 'BAIXA' };
    
    const context = this.getContext();
    const todayStr = new Date().toISOString().split('T')[0];
    const windowDays = this.getBusinessDays(todayStr, 10);
    
    const activeSchedules = this.schedules.filter(s => 
      s.analystId === analystId && 
      s.status === ScheduleStatus.CONFIRMED &&
      s.type === ExpertiseType.PRESENTIAL &&
      windowDays.some(day => s.datetime.startsWith(day))
    ).length;

    const assignedCities = this.cities.filter(c => c.responsibleAnalystIds.includes(user.analystProfileId!));
    
    // Contagem de técnicos em backlog para cidades presenciais atribuídas ao analista
    // Considera-se BACKLOG AGUARDANDO como pendência oficial de capacidade
    const backlogCount = this.technicians.filter(t => 
      t.status_principal === "BACKLOG AGUARDANDO" && 
      assignedCities.some(c => this.safeNormalize(c.name) === this.safeNormalize(t.city))
    ).length;

    // Fórmula: (Agendamentos Ativos * 10) + (Técnicos em Backlog * 1)
    const score = (activeSchedules * 10) + backlogCount;

    return { 
      cityCount: assignedCities.length, 
      pendingPresentialCount: backlogCount, 
      activePresentialCount: activeSchedules, 
      demandIndex: score, 
      level: score > 100 ? 'ALTA' : score > 40 ? 'MÉDIA' : 'BAIXA' 
    };
  }

  public runSmartSchedulingReinforced(startDateIso: string): SchedulingSummary {
  const summary: SchedulingSummary = { scheduled: 0, backlog: 0, reasons: {} };
  const addReason = (r: string) => {
    summary.reasons[r] = (summary.reasons[r] || 0) + 1;
  };

  const context = this.getContext();
  let groupRule = this.groupRules.find(r => r.groupId === context.groupId) || this.groupRules[0];

if (!groupRule) {
  groupRule = {
    groupId: context.groupId,
    presencialPerShift: 3,
    virtualPerShift: 2,
    schedulingWindowDays: 10,
    active: true
  };
  this.groupRules.push(groupRule);
}

if (groupRule.schedulingWindowDays !== 10) {
  groupRule.schedulingWindowDays = 10;
}

const windowDaysCount = 10;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const startReq = new Date(startDateIso + 'T00:00:00');
  const effectiveStart = startReq < today ? today.toISOString().split('T')[0] : startDateIso;
  const businessDays = this.getBusinessDays(effectiveStart, windowDaysCount);
  const businessDaySet = new Set(businessDays);
    const techniciansPool = this.technicians
  .filter(
    t =>
      t.groupId === context.groupId &&
      (
        t.status_principal === "PENDENTE_TRATAMENTO" ||
        t.status_principal === "PENDENTE_CERTIFICAÇÃO" ||
        t.status_principal === "BACKLOG AGUARDANDO" ||
        t.status_principal === "PENDENTE"
      )
  )
  .sort((a, b) => {
    const companyA = this.safeNormalize(a.company || '');
    const companyB = this.safeNormalize(b.company || '');
    const cityA = this.safeNormalize(a.city || '');
    const cityB = this.safeNormalize(b.city || '');
    const nameA = this.safeNormalize(a.name || '');
    const nameB = this.safeNormalize(b.name || '');

    if (companyA !== companyB) return companyA.localeCompare(companyB);
    if (cityA !== cityB) return cityA.localeCompare(cityB);
    return nameA.localeCompare(nameB);
  });

const analystsPool = this.users.filter(
  u => u.role === UserRole.ANALYST && u.active && u.groupId === context.groupId
);

const todayStr = new Date().toISOString().split('T')[0];
const activeAdjustments = this.scoreAdjustments.filter(
  a =>
    a.active &&
    todayStr >= a.startDate &&
    todayStr <= a.endDate &&
    a.groupId === context.groupId
);

  const getLotKey = (tech: Technician, targetType: ExpertiseType) => {
  const city = this.safeNormalize(tech.city || '');
  const state = this.safeNormalize(tech.state || '');
  const classId = this.safeNormalize(tech.trainingClassId || 'SEM_TURMA');

  // 🔴 PRESENCIAL → NÃO QUEBRA POR EMPRESA
  if (targetType === ExpertiseType.PRESENTIAL) {
    return `${targetType}__${city}__${state}__${classId}`;
  }

  // 🔵 VIRTUAL → MANTÉM EMPRESA
  const company = this.safeNormalize(tech.company || '');
  return `${targetType}__${company}__${city}__${state}__${classId}`;
};

  const getScheduledTechBySchedule = (schedule: CertificationSchedule) =>
    this.technicians.find(t => t.id === schedule.technicianId);

  const getWeeklyPresentialCount = (analystId: string) => {
    return this.schedules.filter(
      s =>
        s.analystId === analystId &&
        s.status !== ScheduleStatus.CANCELLED &&
        s.type === ExpertiseType.PRESENTIAL &&
        businessDaySet.has(s.datetime.split('T')[0])
    ).length;
  };

  const getManualPriorityAdjustment = (analystId: string) => {
    return activeAdjustments
      .filter(adj => adj.analystId === analystId)
      .reduce((acc, adj) => acc + (adj.penalty || 0), 0);
  };

  const sortAnalystsForScenario = (analysts: User[], requiresPresential: boolean) => {
  return [...analysts].sort((a, b) => {
    if (requiresPresential) {
      const weeklyPresentialA = getWeeklyPresentialCount(a.id);
      const weeklyPresentialB = getWeeklyPresentialCount(b.id);

      const manualA = getManualPriorityAdjustment(a.id);
      const manualB = getManualPriorityAdjustment(b.id);

      // PRESENCIAL:
// quanto mais presencial o analista já está absorvendo, mais ele tende a receber novos presenciais
// e o ajuste manual também AUMENTA a prioridade
const presentialPriorityA = weeklyPresentialA + manualA;
const presentialPriorityB = weeklyPresentialB + manualB;

if (presentialPriorityA !== presentialPriorityB) {
  return presentialPriorityB - presentialPriorityA;
}

      // Empate: menor pressão geral primeiro
      const metricsA = this.getAnalystDemandMetrics(a.id);
      const metricsB = this.getAnalystDemandMetrics(b.id);

      if (metricsA.demandIndex !== metricsB.demandIndex) {
        return metricsA.demandIndex - metricsB.demandIndex;
      }

      return this.safeNormalize(a.fullName || '').localeCompare(
        this.safeNormalize(b.fullName || '')
      );
    }

    // Fluxo atual mantido para virtual / demais cenários
    const metricsA = this.getAnalystDemandMetrics(a.id);
    const metricsB = this.getAnalystDemandMetrics(b.id);

    const adjA = getManualPriorityAdjustment(a.id);
    const adjB = getManualPriorityAdjustment(b.id);

    const scoreA = metricsA.demandIndex + adjA;
    const scoreB = metricsB.demandIndex + adjB;

    return scoreA - scoreB;
  });
};

    type LotSimulationResult = {
  analystId: string;
  capacity: number;
  canComplete: boolean;
  startDate: string | null;
  endDate: string | null;
  brokeContinuity: boolean;
  plannedDates: string[];
};

const getDaySchedulesForAnalyst = (analystId: string, dateIso: string) => {
  return this.schedules.filter(
    s =>
      s.analystId === analystId &&
      s.datetime.startsWith(dateIso) &&
      s.status !== ScheduleStatus.CANCELLED
  );
};

const isShiftBlockedForAnalyst = (analystId: string, dateIso: string, shift: Shift) => {
  return this.events.some(
    e =>
      e.involvedUserIds.includes(analystId) &&
      e.startDatetime.startsWith(dateIso) &&
      (e.shift === Shift.FULL_DAY || e.shift === shift)
  );
};
    const getAvailableSlotsForAnalystOnDate = (
  analystId: string,
  dateIso: string,
  targetType: ExpertiseType,
  limitPerShiftToUse: number
) => {
  const daySchedules = getDaySchedulesForAnalyst(analystId, dateIso);

  const hasVirtual = daySchedules.some(s => s.type === ExpertiseType.VIRTUAL);
  const hasPresential = daySchedules.some(s => s.type === ExpertiseType.PRESENTIAL);

  if (
    (targetType === ExpertiseType.VIRTUAL && hasPresential) ||
    (targetType === ExpertiseType.PRESENTIAL && hasVirtual)
  ) {
    return 0;
  }

  let totalFreeSlots = 0;

  for (const shift of [Shift.MORNING, Shift.AFTERNOON]) {
    const blocked = isShiftBlockedForAnalyst(analystId, dateIso, shift);
    if (blocked) continue;

    const shiftCount = daySchedules.filter(s => s.shift === shift).length;
    const freeSlots = Math.max(0, limitPerShiftToUse - shiftCount);
    totalFreeSlots += freeSlots;
  }

  return totalFreeSlots;
};

const simulateLotCapacityForAnalyst = (
  analyst: User,
  targetType: ExpertiseType,
  businessDaysToUse: string[],
  limitPerShiftToUse: number,
  lotSize: number
): LotSimulationResult => {
  let bestResult: LotSimulationResult = {
    analystId: analyst.id,
    capacity: 0,
    canComplete: false,
    startDate: null,
    endDate: null,
    brokeContinuity: false,
    plannedDates: []
  };

  for (let startIndex = 0; startIndex < businessDaysToUse.length; startIndex++) {
    let capacity = 0;
    let startDate: string | null = null;
    let endDate: string | null = null;
    let brokeContinuity = false;
    const plannedDates: string[] = [];

    for (let dayIndex = startIndex; dayIndex < businessDaysToUse.length; dayIndex++) {
      const dateIso = businessDaysToUse[dayIndex];
      const freeSlots = getAvailableSlotsForAnalystOnDate(
        analyst.id,
        dateIso,
        targetType,
        limitPerShiftToUse
      );

      // antes de começar o lote, pode pular dia sem problema
      if (capacity === 0) {
        if (freeSlots <= 0) {
          continue;
        }

        startDate = dateIso;
        endDate = dateIso;
        plannedDates.push(dateIso);
        capacity += freeSlots;

        if (capacity >= lotSize) {
          return {
            analystId: analyst.id,
            capacity,
            canComplete: true,
            startDate,
            endDate,
            brokeContinuity: false,
            plannedDates: [...plannedDates]
          };
        }

        continue;
      }

      // depois que começou, precisa manter continuidade
      if (freeSlots <= 0) {
        brokeContinuity = true;
        break;
      }

      endDate = dateIso;
      plannedDates.push(dateIso);
      capacity += freeSlots;

      if (capacity >= lotSize) {
        return {
          analystId: analyst.id,
          capacity,
          canComplete: true,
          startDate,
          endDate,
          brokeContinuity: false,
          plannedDates: [...plannedDates]
        };
      }
    }

    if (capacity > bestResult.capacity) {
      bestResult = {
        analystId: analyst.id,
        capacity,
        canComplete: capacity >= lotSize,
        startDate,
        endDate,
        brokeContinuity,
        plannedDates: [...plannedDates]
      };
    }
  }

  return bestResult;
};

    const simulateVirtualLotCapacityForAnalyst = (
  analyst: User,
  targetType: ExpertiseType,
  businessDaysToUse: string[],
  limitPerShiftToUse: number,
  lotSize: number
): LotSimulationResult => {
  let capacity = 0;
  let startDate: string | null = null;
  let endDate: string | null = null;
  let lastUsedDate: string | null = null;
  const plannedDates: string[] = [];

  for (const dateIso of businessDaysToUse) {
    const freeSlots = getAvailableSlotsForAnalystOnDate(
      analyst.id,
      dateIso,
      targetType,
      limitPerShiftToUse
    );

    if (freeSlots <= 0) continue;

    if (lastUsedDate) {
      const diff =
        (new Date(dateIso).getTime() - new Date(lastUsedDate).getTime()) /
        (1000 * 3600 * 24);

      if (diff > 3) continue;
    }

    if (!startDate) startDate = dateIso;

    endDate = dateIso;
    plannedDates.push(dateIso);
    capacity += freeSlots;
    lastUsedDate = dateIso;

    if (capacity >= lotSize) {
      return {
        analystId: analyst.id,
        capacity,
        canComplete: true,
        startDate,
        endDate,
        brokeContinuity: false,
        plannedDates: [...plannedDates]
      };
    }
  }

  return {
    analystId: analyst.id,
    capacity,
    canComplete: false,
    startDate,
    endDate,
    brokeContinuity: false,
    plannedDates: [...plannedDates]
  };
};
    
    const lotsMap = new Map<string, Technician[]>();

for (const tech of techniciansPool) {
  const routingMatch = this.resolveBaseForScheduling({
  city: tech.city,
  uf: tech.state,
  company: tech.company
});

const requiresPresential = !!routingMatch.base;
const targetType = requiresPresential ? ExpertiseType.PRESENTIAL : ExpertiseType.VIRTUAL;
const lotKey = getLotKey(tech, targetType);

  if (!lotsMap.has(lotKey)) {
    lotsMap.set(lotKey, []);
  }

  lotsMap.get(lotKey)!.push(tech);
}

const lots = Array.from(lotsMap.entries()).map(([lotKey, techs]) => ({
  lotKey,
  techs
}));

    
    for (const lot of lots) {
  const lotTechs = lot.techs;
  const tech = lotTechs[0];
  

    const routingMatch = this.resolveBaseForScheduling({
  city: tech.city,
  uf: tech.state,
  company: tech.company
});

const requiresPresential = !!routingMatch.base;
const targetType = requiresPresential ? ExpertiseType.PRESENTIAL : ExpertiseType.VIRTUAL;

    const limitPerShift =
      targetType === ExpertiseType.VIRTUAL
        ? (groupRule.virtualPerShift || 2)
        : (groupRule.presencialPerShift || 3);

    let allowedAnalysts = requiresPresential
  ? analystsPool.filter(a =>
      routingMatch.rule?.analystId
        ? a.id === routingMatch.rule.analystId
        : true
    )
  : analystsPool;

    allowedAnalysts = sortAnalystsForScenario(allowedAnalysts, requiresPresential);

    if (requiresPresential && allowedAnalysts.length === 0) {
  for (const lotTech of lotTechs) {
    lotTech.status_principal = "BACKLOG AGUARDANDO";
    lotTech.backlog_score_aplicado = true;
    lotTech.backlog_motivo = "SEM ANALISTA RESPONSÁVEL (CIDADE PRESENCIAL)";
  }

  addReason("SEM ANALISTA RESPONSÁVEL (CIDADE PRESENCIAL)");
  summary.backlog += lotTechs.length;
  continue;
}

    const lotKey = getLotKey(tech, targetType);

    // Nova regra sensível:
    // aplica somente para PRESENCIAL em cidades com MAIS DE 1 analista responsável.
    // Nova regra sensível:
// aplica somente para PRESENCIAL em cidades com MAIS DE 1 analista responsável.
const shouldLockLotToOneAnalyst = requiresPresential;

if (shouldLockLotToOneAnalyst) {
  
  const lotSize = lotTechs.length;

  let lotOwner: User | null = null;

const simulations = allowedAnalysts.map((analyst, index) => ({
  analyst,
  orderIndex: index,
  result: simulateLotCapacityForAnalyst(
    analyst,
    targetType,
    businessDays,
    limitPerShift,
    lotSize
  )
}));

const safeDate = (value: string | null | undefined) => value || '9999-12-31';

const fullCandidates = simulations
  .filter(x => x.result.canComplete && x.result.plannedDates.length > 0)
  .sort((a, b) => {
    const startA = safeDate(a.result.startDate);
    const startB = safeDate(b.result.startDate);

    // 🔹 1. PRIORIDADE PRINCIPAL → QUEM COMEÇA MAIS CEDO
    if (startA !== startB) {
      return startA.localeCompare(startB);
    }

    const endA = safeDate(a.result.endDate);
    const endB = safeDate(b.result.endDate);

    // 🔹 2. DESEMPATE → QUEM TERMINA MAIS CEDO
    if (endA !== endB) {
      return endA.localeCompare(endB);
    }

    // 🔹 3. DESEMPATE FINAL → PRIORIDADE MANUAL (SCORE)
    return a.orderIndex - b.orderIndex;
  });

const chosenSimulation = fullCandidates.length > 0 ? fullCandidates[0] : null;
lotOwner = chosenSimulation ? chosenSimulation.analyst : null;

if (!lotOwner) {
  const classLabel = tech.trainingClassId || 'SEM TURMA';
  const companyLabel = tech.company || 'SEM EMPRESA';
  const cityLabel = tech.city || 'SEM CIDADE';
  const stateLabel = tech.state || '';

  const responsibleNames = allowedAnalysts
    .map(a => a.fullName)
    .join(', ');

  for (const lotTech of lotTechs) {
    lotTech.status_principal = "BACKLOG AGUARDANDO";
    lotTech.backlog_score_aplicado = true;
    lotTech.backlog_motivo = `LOTE PRESENCIAL SEM ANALISTA CAPAZ DE FECHAR 100% NA JANELA (${windowDaysCount} DIAS)`;
  }

  addReason(
    `ALERTA GESTOR: liberar continuidade de agenda para ${cityLabel}${stateLabel ? `-${stateLabel}` : ''}. Lote ${classLabel} / ${companyLabel}. KEY=${lotKey}. Responsáveis avaliados: ${responsibleNames}`
  );

  summary.backlog += lotTechs.length;
  continue;
}


const scheduledEntries: Array<{ tech: Technician; schedule: CertificationSchedule }> = [];

const plannedDatesToUse = chosenSimulation?.result.plannedDates || [];
  for (const dateIso of plannedDatesToUse) {
  const daySchedules = this.schedules.filter(
    s =>
      s.analystId === lotOwner.id &&
      s.datetime.startsWith(dateIso) &&
      s.status !== ScheduleStatus.CANCELLED
  );

  const hasVirtual = daySchedules.some(s => s.type === ExpertiseType.VIRTUAL);
  const hasPresential = daySchedules.some(s => s.type === ExpertiseType.PRESENTIAL);

  if (
    (targetType === ExpertiseType.VIRTUAL && hasPresential) ||
    (targetType === ExpertiseType.PRESENTIAL && hasVirtual)
  ) {
    continue;
  }

  for (const shift of [Shift.MORNING, Shift.AFTERNOON]) {
    const isBlocked = this.events.some(
      e =>
        e.involvedUserIds.includes(lotOwner.id) &&
        e.startDatetime.startsWith(dateIso) &&
        (e.shift === Shift.FULL_DAY || e.shift === shift)
    );

    if (isBlocked) continue;

    let shiftSchedules = this.schedules.filter(
      s =>
        s.analystId === lotOwner.id &&
        s.datetime.startsWith(dateIso) &&
        s.shift === shift &&
        s.status !== ScheduleStatus.CANCELLED
    );

    while (shiftSchedules.length < limitPerShift && scheduledEntries.length < lotTechs.length) {
      const nextTech = lotTechs[scheduledEntries.length];

      const scheduleTime = this.getManualScheduleTime(
        lotOwner.id,
        dateIso,
        shift,
        targetType
      );
      const resolvedBase = this.resolveBaseForScheduling({
  city: nextTech.city,
  uf: nextTech.state,
  analystId: lotOwner.id,
  company: nextTech.company
});

      const newSch: CertificationSchedule = {
        id: `sch-auto-${Date.now()}-${Math.random()}`,
        groupId: nextTech.groupId,
        title: `CERTIFICAÇÃO AUTOMÁTICA - ${nextTech.name}`,
        technicianId: nextTech.id,
        analystId: lotOwner.id,
        trainingClassId: nextTech.trainingClassId,
        datetime: `${dateIso}T${scheduleTime}`,
        type: targetType,
        status: ScheduleStatus.CONFIRMED,
        availabilitySlotId: 'auto',
        shift,
        technology: nextTech.technology || 'GPON',
baseId: resolvedBase.base?.id,
baseName: resolvedBase.base?.name,
baseAddress: resolvedBase.base?.address,
baseNotes: resolvedBase.base?.notes,
powerAppsBaseId: resolvedBase.base?.powerAppsBaseId,
routingRuleId: resolvedBase.rule?.id
      };

      this.schedules.push(newSch);
      scheduledEntries.push({ tech: nextTech, schedule: newSch });

      shiftSchedules = this.schedules.filter(
        s =>
          s.analystId === lotOwner.id &&
          s.datetime.startsWith(dateIso) &&
          s.shift === shift &&
          s.status !== ScheduleStatus.CANCELLED
      );
    }
  }
}

if (scheduledEntries.length === lotTechs.length) {
  for (const entry of scheduledEntries) {
    entry.tech.status_principal = "AGENDADOS";
    entry.tech.certificationProcessStatus = CertificationProcessStatus.SCHEDULED;
    entry.tech.scheduledCertificationId = entry.schedule.id;
    entry.tech.status_updated_at = new Date().toISOString();
    entry.tech.status_updated_by = "SISTEMA";
  }

  summary.scheduled += lotTechs.length;
} else {
  // rollback total do lote
  const createdScheduleIds = new Set(scheduledEntries.map(x => x.schedule.id));
  this.schedules = this.schedules.filter(s => !createdScheduleIds.has(s.id));

  const classLabel = tech.trainingClassId || 'SEM TURMA';
  const companyLabel = tech.company || 'SEM EMPRESA';
  const cityLabel = tech.city || 'SEM CIDADE';
  const stateLabel = tech.state || '';

  for (const lotTech of lotTechs) {
    lotTech.status_principal = "BACKLOG AGUARDANDO";
    lotTech.backlog_score_aplicado = true;
    lotTech.backlog_motivo = `LOTE PRESENCIAL SEM VAGA NA SEQUÊNCIA CONTÍNUA DO ANALISTA ${lotOwner.fullName}`;
  }

  addReason(
  `ALERTA GESTOR: sequência contínua indisponível para ${cityLabel}${stateLabel ? `-${stateLabel}` : ''}. Lote ${classLabel} / ${companyLabel}. KEY=${lotKey}. Analista selecionado: ${lotOwner.fullName}`
);

  summary.backlog += lotTechs.length;
}

continue;
  }

    if (targetType === ExpertiseType.VIRTUAL) {
  const lotSize = lotTechs.length;

  let lotOwner: User | null = null;

  const simulations = allowedAnalysts.map((analyst, index) => ({
    analyst,
    orderIndex: index,
    result: simulateVirtualLotCapacityForAnalyst(
      analyst,
      targetType,
      businessDays,
      limitPerShift,
      lotSize
    )
  }));

  const safeDate = (value: string | null | undefined) => value || '9999-12-31';

  const fullCandidates = simulations
    .filter(x => x.result.canComplete && x.result.plannedDates.length > 0)
    .sort((a, b) => {
      const startA = safeDate(a.result.startDate);
      const startB = safeDate(b.result.startDate);

      if (startA !== startB) {
        return startA.localeCompare(startB);
      }

      const endA = safeDate(a.result.endDate);
      const endB = safeDate(b.result.endDate);

      if (endA !== endB) {
        return endA.localeCompare(endB);
      }

      return a.orderIndex - b.orderIndex;
    });

  const chosenSimulation = fullCandidates.length > 0 ? fullCandidates[0] : null;
  lotOwner = chosenSimulation ? chosenSimulation.analyst : null;

  if (!lotOwner) {
    const classLabel = tech.trainingClassId || 'SEM TURMA';
    const companyLabel = tech.company || 'SEM EMPRESA';
    const cityLabel = tech.city || 'SEM CIDADE';
    const stateLabel = tech.state || '';

    const analystNames = allowedAnalysts
      .map(a => a.fullName)
      .join(', ');

    for (const lotTech of lotTechs) {
      lotTech.status_principal = "BACKLOG AGUARDANDO";
      lotTech.backlog_score_aplicado = true;
      lotTech.backlog_motivo = `LOTE VIRTUAL SEM ANALISTA CAPAZ DE FECHAR 100% NA JANELA (${windowDaysCount} DIAS)`;
    }

    addReason(
      `LOTE VIRTUAL EM BACKLOG: ${companyLabel} / ${cityLabel}${stateLabel ? `-${stateLabel}` : ''} / ${classLabel}. Responsáveis avaliados: ${analystNames}`
    );

    summary.backlog += lotTechs.length;
    continue;
  }

  const scheduledEntries: Array<{ tech: Technician; schedule: CertificationSchedule }> = [];
  const plannedDatesToUse = chosenSimulation?.result.plannedDates || [];

  for (const dateIso of plannedDatesToUse) {
    const daySchedules = this.schedules.filter(
      s =>
        s.analystId === lotOwner.id &&
        s.datetime.startsWith(dateIso) &&
        s.status !== ScheduleStatus.CANCELLED
    );

    const hasVirtual = daySchedules.some(s => s.type === ExpertiseType.VIRTUAL);
    const hasPresential = daySchedules.some(s => s.type === ExpertiseType.PRESENTIAL);

    if (
      (targetType === ExpertiseType.VIRTUAL && hasPresential) ||
      (targetType === ExpertiseType.PRESENTIAL && hasVirtual)
    ) {
      continue;
    }

    for (const shift of [Shift.MORNING, Shift.AFTERNOON]) {
      const isBlocked = this.events.some(
        e =>
          e.involvedUserIds.includes(lotOwner.id) &&
          e.startDatetime.startsWith(dateIso) &&
          (e.shift === Shift.FULL_DAY || e.shift === shift)
      );

      if (isBlocked) continue;

      let shiftSchedules = this.schedules.filter(
        s =>
          s.analystId === lotOwner.id &&
          s.datetime.startsWith(dateIso) &&
          s.shift === shift &&
          s.status !== ScheduleStatus.CANCELLED
      );

      while (shiftSchedules.length < limitPerShift && scheduledEntries.length < lotTechs.length) {
        const nextTech = lotTechs[scheduledEntries.length];

        const scheduleTime = this.getManualScheduleTime(
          lotOwner.id,
          dateIso,
          shift,
          targetType
        );

        const newSch: CertificationSchedule = {
          id: `sch-auto-${Date.now()}-${Math.random()}`,
          groupId: nextTech.groupId,
          title: `CERTIFICAÇÃO AUTOMÁTICA - ${nextTech.name}`,
          technicianId: nextTech.id,
          analystId: lotOwner.id,
          trainingClassId: nextTech.trainingClassId,
          datetime: `${dateIso}T${scheduleTime}`,
          type: targetType,
          status: ScheduleStatus.CONFIRMED,
          availabilitySlotId: 'auto',
          shift,
          technology: nextTech.technology || 'GPON'
        };

        this.schedules.push(newSch);
        scheduledEntries.push({ tech: nextTech, schedule: newSch });

        shiftSchedules = this.schedules.filter(
          s =>
            s.analystId === lotOwner.id &&
            s.datetime.startsWith(dateIso) &&
            s.shift === shift &&
            s.status !== ScheduleStatus.CANCELLED
        );
      }
    }
  }

  if (scheduledEntries.length === lotTechs.length) {
    for (const entry of scheduledEntries) {
      entry.tech.status_principal = "AGENDADOS";
      entry.tech.certificationProcessStatus = CertificationProcessStatus.SCHEDULED;
      entry.tech.scheduledCertificationId = entry.schedule.id;
      entry.tech.status_updated_at = new Date().toISOString();
      entry.tech.status_updated_by = "SISTEMA";
    }

    summary.scheduled += lotTechs.length;
  } else {
    const createdScheduleIds = new Set(scheduledEntries.map(x => x.schedule.id));
    this.schedules = this.schedules.filter(s => !createdScheduleIds.has(s.id));

    const classLabel = tech.trainingClassId || 'SEM TURMA';
    const companyLabel = tech.company || 'SEM EMPRESA';
    const cityLabel = tech.city || 'SEM CIDADE';
    const stateLabel = tech.state || '';

    for (const lotTech of lotTechs) {
      lotTech.status_principal = "BACKLOG AGUARDANDO";
      lotTech.backlog_score_aplicado = true;
      lotTech.backlog_motivo = `LOTE VIRTUAL SEM VAGA SUFICIENTE NO ANALISTA ${lotOwner.fullName}`;
    }

    addReason(
      `LOTE VIRTUAL EM BACKLOG: ${companyLabel} / ${cityLabel}${stateLabel ? `-${stateLabel}` : ''} / ${classLabel}. Analista selecionado: ${lotOwner.fullName}`
    );

    summary.backlog += lotTechs.length;
  }

  continue;
}
  }

  this.persist();
  auditService.logTicket({
    user: this.getCurrentUser(),
    action: 'GERAR_AGENDAMENTO_AUTOMATICO',
    targetType: 'Sistema',
    targetValue: `scheduled:${summary.scheduled}|backlog:${summary.backlog}`,
    reason: `Agendamento automático executado a partir de ${effectiveStart}. Agendados: ${summary.scheduled}. Backlog: ${summary.backlog}.`,
    screen: 'Agenda',
    groupId: context.groupId
  });

  window.dispatchEvent(new Event('data-updated'));
  return summary;
}

  public approveScheduledTechnician(techId: string) {
    const tech = this.technicians.find(t => t.id === techId);
    const currentUser = this.getCurrentUser();
    if (!tech) return { success: false, message: 'Técnico não localizado.' };
    const ctx = this.getContext();
    if (tech.groupId !== ctx.groupId) return { success: false, message: 'Sem permissão para este grupo.' };
    try {
      if (tech.scheduledCertificationId) {
        const sch = this.schedules.find(s => s.id === tech.scheduledCertificationId);
        if (sch) sch.status = ScheduleStatus.COMPLETED;
      }
      tech.status_principal = "APROVADOS";
      tech.certificationProcessStatus = CertificationProcessStatus.CERTIFIED_APPROVED;
      tech.status_updated_at = new Date().toISOString();
      tech.status_updated_by = currentUser.fullName;
      tech.aprovado_manual = true; // Marca como ação manual para evitar re-processamento automático
      
      this.persist();

auditService.logTicket({
  user: currentUser,
  action: 'MARCAR_APROVADO',
  targetType: 'CPF',
  targetValue: tech.cpf,
  reason: `Técnico ${tech.name} (${tech.cpf}) aprovado manualmente na aba AGENDADOS.`,
  screen: 'Turmas e Técnicos',
  groupId: tech.groupId
});

window.dispatchEvent(new Event('data-updated'));
return { success: true };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  }

  public applyImprovisoCancellation(analystId: string, dateIso: string, shift: Shift) {
    const currentUser = this.getCurrentUser();
    const affectedSchedules = this.getSchedulesImpactedByImproviso(analystId, dateIso, shift);
    affectedSchedules.forEach(sch => {
      sch.status = ScheduleStatus.CANCELLED;
      const tech = this.technicians.find(t => t.id === sch.technicianId);
      if (tech) {
        tech.status_principal = "CANCELADOS (ANALISTA)";
        tech.status_submotivo = "ANALISTA INDISPONÍVEL";
        tech.status_observacao = "CANCELADO POR IMPROVISO NA AGENDA";
        tech.status_updated_at = new Date().toISOString();
        tech.status_updated_by = currentUser.fullName;
        tech.scheduledCertificationId = undefined;
        tech.certificationProcessStatus = CertificationProcessStatus.CANCELLED_BY_ANALYST;
        tech.cancelado_manual = true;
      }
    });

    this.persist();

auditService.logTicket({
  user: currentUser,
  action: 'CANCELAMENTO_POR_IMPROVISO',
  targetType: 'Analista',
  targetValue: analystId,
  reason: `Improviso lançado para o analista ${analystId} em ${dateIso}, período ${shift}, com ${affectedSchedules.length} agendamento(s) cancelado(s).`,
  screen: 'Agenda',
  groupId: currentUser.groupId
});

window.dispatchEvent(new Event('data-updated'));
    
  }

  public getSchedulesImpactedByImproviso(uid: string, d: string, s: Shift) {
    return this.schedules.filter(sch => sch.analystId === uid && sch.datetime.startsWith(d) && sch.status === ScheduleStatus.CONFIRMED && (s === Shift.FULL_DAY || sch.shift === s));
  }

  public validateManualSchedule(techId: string, analystId: string, dateIso: string, shift: Shift, type: ExpertiseType): ManualScheduleValidationResult {
    const brokenRules: string[] = [];
    const tech = this.technicians.find(t => t.id === techId);
    const analyst = this.users.find(u => u.id === analystId);
    const cityConfig = this.cities.find(c => this.safeNormalize(c.name) === this.safeNormalize(tech?.city));
    const isBlocked = this.events.some(e => e.involvedUserIds.includes(analystId) && e.startDatetime.startsWith(dateIso) && (e.shift === Shift.FULL_DAY || e.shift === shift));
    const hasFullDayEvent = this.events.some(
  e =>
    e.involvedUserIds.includes(analystId) &&
    e.startDatetime.startsWith(dateIso) &&
    e.shift === Shift.FULL_DAY
);

if (hasFullDayEvent) {
  brokenRules.push("O analista está bloqueado no dia inteiro.");
} else if (isBlocked) {
  brokenRules.push("O analista possui bloqueio de agenda neste período.");
}
    const daySchedules = this.schedules.filter(s => s.analystId === analystId && s.datetime.startsWith(dateIso) && s.status !== ScheduleStatus.CANCELLED);
    const hasOppositeType = type === ExpertiseType.VIRTUAL ? daySchedules.some(s => s.type === ExpertiseType.PRESENTIAL) : daySchedules.some(s => s.type === ExpertiseType.VIRTUAL);
    if (hasOppositeType) brokenRules.push(`O analista já possui agendamentos de tipo oposto (${type === ExpertiseType.VIRTUAL ? 'PRESENCIAL' : 'VIRTUAL'}) neste dia.`);
    const limit = type === ExpertiseType.VIRTUAL ? 2 : 3;
    const currentCount = daySchedules.filter(s => s.shift === shift).length;
    if (currentCount >= limit) brokenRules.push(`Capacidade esgotada para este turno (${currentCount}/${limit}).`);
    if (type === ExpertiseType.PRESENTIAL && cityConfig && !cityConfig.responsibleAnalystIds.includes(analyst?.analystProfileId || '')) {
      brokenRules.push(`O analista escolhido não é responsável por esta cidade (${tech?.city}).`);
    }
    return { canSchedule: brokenRules.length === 0, brokenRules, needsForce: brokenRules.length > 0 };
  }

  private getManualScheduleTime(
  analystId: string,
  dateIso: string,
  shift: Shift,
  type: ExpertiseType
): string {
  const sameSlotSchedules = this.schedules.filter(s =>
  s.analystId === analystId &&
  s.datetime.startsWith(dateIso) &&
  s.shift === shift &&
  s.type === type &&
  s.status !== ScheduleStatus.CANCELLED
);

  const position = sameSlotSchedules.length + 1;
  const isPresential = type === ExpertiseType.PRESENTIAL;

  if (isPresential) {
    if (shift === Shift.MORNING) {
      if (position === 1) return '09:00:00';
      if (position === 2) return '10:00:00';
      if (position === 3) return '11:00:00';
    }

    if (shift === Shift.AFTERNOON) {
      if (position === 1) return '14:00:00';
      if (position === 2) return '15:00:00';
      if (position === 3) return '16:00:00';
    }
  } else {
    if (shift === Shift.MORNING) {
      if (position === 1) return '09:30:00';
      if (position === 2) return '10:30:00';
    }

    if (shift === Shift.AFTERNOON) {
      if (position === 1) return '14:30:00';
      if (position === 2) return '15:30:00';
    }
  }

  return shift === Shift.MORNING ? '09:00:00' : '14:00:00';
}
  public manualScheduleReinforced(params: { techId: string, analystId: string, dateIso: string, shift: Shift, type: ExpertiseType, forced: boolean, brokenRules?: string[] }) {
    const tech = this.technicians.find(t => t.id === params.techId);
    const currentUser = this.getCurrentUser();
    if (tech) {
      const scheduleTime = this.getManualScheduleTime(
    params.analystId,
    params.dateIso,
    params.shift,
    params.type
  );
      const newSch: CertificationSchedule = {
  id: `sch-man-${Date.now()}`,
  groupId: tech.groupId,
  title: `MANUAL ${params.forced ? '(FORÇADO)' : ''} - ${tech.name}`,
  technicianId: tech.id,
  analystId: params.analystId,
  trainingClassId: tech.trainingClassId,
  datetime: `${params.dateIso}T${scheduleTime}`,
  type: params.type,
  status: ScheduleStatus.CONFIRMED,
  availabilitySlotId: 'manual',
  shift: params.shift,
  technology: tech.technology || 'GPON',
  forcado: params.forced,
  regrasBurladas: params.brokenRules
};
      this.schedules.push(newSch);
      tech.status_principal = "AGENDADOS";
      tech.certificationProcessStatus = CertificationProcessStatus.SCHEDULED;
      tech.scheduledCertificationId = newSch.id;
      tech.status_updated_at = new Date().toISOString();
      tech.status_updated_by = currentUser.fullName;
      this.persist();

auditService.logTicket({
  user: currentUser,
  action: 'AGENDAMENTO_MANUAL',
  targetType: 'CPF',
  targetValue: tech.cpf,
  reason: params.forced
    ? `Agendamento manual forçado para ${tech.name} (${tech.cpf}) em ${params.dateIso}, turno ${params.shift}, modalidade ${params.type}. Regras burladas: ${params.brokenRules?.join(' | ') || 'não informado'}.`
    : `Agendamento manual realizado para ${tech.name} (${tech.cpf}) em ${params.dateIso}, turno ${params.shift}, modalidade ${params.type}.`,
  forcado: params.forced,
  regrasBurladas: params.brokenRules,
  screen: 'Turmas e Técnicos',
  groupId: tech.groupId
});

window.dispatchEvent(new Event('data-updated'));
return { success: true };
    }
    return { success: false };
  }

  public withdrawScheduling(params: { techId: string, statusPrincipal: string, subReason: string, observation: string, category?: string }) {
    const tech = this.technicians.find(t => t.id === params.techId);
    const currentUser = this.getCurrentUser();
    if (tech) {
      if (tech.scheduledCertificationId) {
        const sch = this.schedules.find(s => s.id === tech.scheduledCertificationId);
        if (sch) sch.status = ScheduleStatus.CANCELLED;
        tech.scheduledCertificationId = undefined;
      }
      tech.status_principal = params.statusPrincipal;
      tech.status_submotivo = params.subReason;
      tech.status_observacao = params.observation;
      tech.categoria_reprovacao = params.category;
      tech.status_updated_at = new Date().toISOString();
      tech.status_updated_by = currentUser.fullName;
      
      // Marca ação manual correspondente
      if (params.statusPrincipal === "REPROVADO") tech.reprovado_manual = true;
      if (params.statusPrincipal === "CANCELADO_ANALISTA" || params.statusPrincipal === "INABILITADO") tech.cancelado_manual = true;
      
      this.persist();
      window.dispatchEvent(new Event('data-updated'));
      return { success: true };
    }
    return { success: false };
  }

  public addEvent(event: EventSchedule) {
    if (!event.id) event.id = `evt-${Date.now()}`;
    this.events.push(event);
    this.persist();
    window.dispatchEvent(new Event('data-updated'));
  }

  public removeEvent(userId: string, dateIso: string) {
    this.events = this.events.filter(e => !(e.involvedUserIds.includes(userId) && e.startDatetime.startsWith(dateIso)));
    this.persist();
    window.dispatchEvent(new Event('data-updated'));
  }

  public addEventRange(userId: string, start: string, end: string, title: string, type: any) {
    let curr = new Date(start + 'T00:00:00');
    const last = new Date(end + 'T00:00:00');
    while (curr <= last) {
      const dateIso = curr.toISOString().split('T')[0];
      this.removeEvent(userId, dateIso);
      this.addEvent({ id: `evt-range-${Date.now()}-${Math.random()}`, groupId: this.getContext().groupId, title: title.toUpperCase(), type, startDatetime: `${dateIso}T00:00:00Z`, endDatetime: `${dateIso}T23:59:59Z`, involvedUserIds: [userId], shift: Shift.FULL_DAY });
      curr.setDate(curr.getDate() + 1);
    }
  }

  private normalizeHeaderName(name: any): string {
  const s = (name === null || name === undefined) ? "" : String(name);
  return s
    .trim()
    .toUpperCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*\/\s*/g, "/");
}
  private getHeaderIndex(headers: string[], aliases: string[]): number {
  for (const alias of aliases) {
    const idx = headers.indexOf(this.normalizeHeaderName(alias));
    if (idx !== -1) return idx;
  }
  return -1;
}

private getRowStringValue(row: any[], index: number): string {
  if (index < 0) return "";
  return String(row[index] ?? "").trim().toUpperCase();
}

  private processCpfValue(value: any): { cpf: string | null; error?: string } {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return { cpf: null, error: "CPF não encontrado" };
    }
    const s = String(value).trim();
    if (s === "") {
      return { cpf: null, error: "CPF não encontrado" };
    }

    // Remover não numéricos
    const clean = s.replace(/\D/g, "");
    
    // Validar tamanho
    if (clean.length < 9) {
      return { cpf: null, error: "CPF inválido (tamanho insuficiente)" };
    }

    // Aplicar padStart(11)
    const padded = clean.padStart(11, "0");

    // Proteção contra 00000000000
    if (padded === "00000000000") {
      return { cpf: null, error: "CPF inválido (sequência zerada)" };
    }

    return { cpf: padded };
  }

    public updateCompaniesFromSpreadsheet(raw: any[][]) {
  let updated = 0;
  let notFound = 0;
  const errors: ImportError[] = [];

  if (!raw || raw.length === 0) {
    return { updated, notFound, errors };
  }

  const headers = (raw[0] || []).map(h => this.normalizeHeaderName(h));

  const cpfIdx = this.getHeaderIndex(headers, ["CPF"]);

  let solicitanteIdx = this.getHeaderIndex(headers, [
    "SOLICITANTE",
    "SOLICITANTE/NOME",
    "SOLICITANTE / NOME",
    "NOME DO SOLICITANTE",
    "SOLICITANTE NOME"
  ]);

  if (solicitanteIdx === -1) {
    solicitanteIdx = 9; // coluna J
  }

  raw.slice(1).forEach((row, index) => {
    if (!row || row.length === 0) return;

    const { cpf: cleanCpf, error: cpfError } = this.processCpfValue(
      cpfIdx !== -1 ? row[cpfIdx] : null
    );

    if (cpfError) {
      errors.push({
        line: index + 2,
        field: "CPF",
        reason: cpfError,
        value: cpfIdx !== -1 ? row[cpfIdx] : null
      });
      return;
    }

    if (!cleanCpf) return;

    const solicitante =
      solicitanteIdx !== -1 && row.length > solicitanteIdx
        ? String(row[solicitanteIdx] ?? "").trim()
        : "";

    const tech = this.technicians.find(t => t.cpf === cleanCpf);

    if (!tech) {
      notFound++;
      return;
    }

    (tech as any).solicitante = solicitante;
    (tech as any).solicitor = solicitante;

    updated++;
  });

  this.persist();
  window.dispatchEvent(new Event('data-updated'));

  return { updated, notFound, errors };
}

public getUnconfiguredCities() {
  const configuredNames = new Set(this.cities.map(c => this.safeNormalize(c.name)));
  return mockCities.filter(mc => !configuredNames.has(this.safeNormalize(mc.name)));
}
  private isFixedAdmin(userId: string): boolean {
  return userId === 'admin-fixo-g3';
}

  public resetUserPassword(userId: string): boolean {
  const user = this.users.find(u => u.id === userId);
  if (!user) return false;

  user.passwordHash = btoa('salt_Claro@123_G3');
  user.updatedAt = new Date().toISOString();

  if (this.isFixedAdmin(userId)) {
    user.firstNameLogin = 'ADMIN';
    user.normalizedLogin = 'ADMIN';
    user.active = true;
  }

  this.persist();
  return true;
}

  public addGroup(group: { id: string, name: string }) {
    if (this.groups.find(g => g.id === group.id)) throw new Error("Grupo já existe.");
    this.groups.push({ ...group, active: true }); this.persist(); window.dispatchEvent(new Event('data-updated'));
  }

  public addUser(user: any) {
    const newUser: User = { id: `u-${Date.now()}`, fullName: user.fullName, normalizedLogin: user.fullName.toUpperCase(), firstNameLogin: user.fullName.split(' ')[0].toUpperCase(), email: '', role: user.role, groupId: user.groupId, managerId: user.managerId, passwordHash: btoa('salt_Claro@123_G3'), active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.users.push(newUser); this.persist(); window.dispatchEvent(new Event('data-updated'));
  }

  public adminUpdateRule(rule: GroupRule) {
    const idx = this.groupRules.findIndex(r => r.groupId === rule.groupId);
    if (idx >= 0) this.groupRules[idx] = rule; else this.groupRules.push(rule);
    this.persist(); window.dispatchEvent(new Event('data-updated'));
  }

  public addCityResponsibility(params: { groupId: string, city: string, uf: string, analystIds: string[] }) {
    const newCity: CityGroup = { id: `city-${Date.now()}`, groupId: params.groupId, name: params.city.toUpperCase(), uf: params.uf.toUpperCase(), type: ExpertiseType.PRESENTIAL, active: true, responsibleAnalystIds: params.analystIds };
    this.cities.push(newCity); this.persist(); window.dispatchEvent(new Event('data-updated'));
  }

  public updateUserStatus(userId: string, active: boolean) {
  const user = this.users.find(u => u.id === userId);
  if (!user) return;

  if (this.isFixedAdmin(userId) && !active) {
    alert('O ADMIN principal do sistema não pode ser desativado por segurança.');
    return;
  }

  user.active = active;
  user.updatedAt = new Date().toISOString();

  if (this.isFixedAdmin(userId)) {
    user.firstNameLogin = 'ADMIN';
    user.normalizedLogin = 'ADMIN';
  }

  this.persist();
  window.dispatchEvent(new Event('data-updated'));
}

  public downloadTemplate() {
  const headers = [[
    "Nome",
    "Email",
    "Cidade",
    "Estado",
    "Telefone",
    "CPF",
    "Empresa/Parceiro",
    "Login TOA",
    "OBS",
    "Solicitante",
    "Resultado Importação"
  ]];

  const ws = XLSX.utils.aoa_to_sheet(headers);

  // Aviso visual ao lado da planilha
  ws["M1"] = { t: "s", v: "OPÇÕES PARA RESULTADO IMPORTAÇÃO" };
  ws["M2"] = { t: "s", v: "Copie e cole um dos valores abaixo na coluna K:" };
  ws["M4"] = { t: "s", v: "FILA" };
  ws["M5"] = { t: "s", v: "NOSHOW" };
  ws["M6"] = { t: "s", v: "SEM EAD" };
  ws["M7"] = { t: "s", v: "REPROVADO EAD" };
  ws["M8"] = { t: "s", v: "REPROVADO VIRTUAL" };
  ws["M9"] = { t: "s", v: "INABILITADO" };

  // IMPORTANTE: expandir a área usada da planilha até M9
  ws["!ref"] = "A1:M9";

  // Largura das colunas
  ws["!cols"] = [
    { wch: 18 }, // A Nome
    { wch: 28 }, // B Email
    { wch: 18 }, // C Cidade
    { wch: 10 }, // D Estado
    { wch: 16 }, // E Telefone
    { wch: 16 }, // F CPF
    { wch: 24 }, // G Empresa/Parceiro
    { wch: 16 }, // H Login TOA
    { wch: 18 }, // I OBS
    { wch: 20 }, // J Solicitante
    { wch: 24 }, // K Resultado Importação
    { wch: 4 },  // L espaço
    { wch: 34 }  // M aviso
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "MODELO");
  XLSX.writeFile(wb, "MODELO_IMPORTACAO_TECNICOS_TURMA.xlsx");
}
  
  public downloadTestTemplate() { const headers = [["ANALISTA", "DATA", "TURNO", "TIPO", "TECNOLOGIA", "QUANTIDADE"]]; const ws = XLSX.utils.aoa_to_sheet(headers); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Modelo Teste"); XLSX.writeFile(wb, "modelo_agenda_teste.xlsx"); }
  public importTestSchedules(raw: any[][]): number {
  let count = 0;
  const ctx = this.getContext();

  raw.slice(1).forEach(row => {
    if (!row[0] || !row[1]) return;

    const [analystName, date, shift, type, tech, qty] = row;
    const analyst = this.users.find(
      u => u.normalizedLogin === String(analystName).toUpperCase()
    );

    if (analyst) {
      const numQty = parseInt(String(qty)) || 1;

      for (let i = 0; i < numQty; i++) {
        const parsedShift =
          String(shift).toUpperCase() === 'TARDE'
            ? Shift.AFTERNOON
            : Shift.MORNING;

        const parsedType =
          String(type).toUpperCase() === 'VIRTUAL'
            ? ExpertiseType.VIRTUAL
            : ExpertiseType.PRESENTIAL;

        const scheduleTime = this.getManualScheduleTime(
          analyst.id,
          String(date),
          parsedShift,
          parsedType
        );

        this.schedulesTeste.push({
          id: `sch-test-${Date.now()}-${Math.random()}`,
          groupId: ctx.groupId,
          title: `TESTE - ${analystName}`,
          technicianId: 'test-tech',
          analystId: analyst.id,
          datetime: `${date}T${scheduleTime}Z`,
          type: parsedType,
          status: ScheduleStatus.CONFIRMED,
          availabilitySlotId: 'test',
          shift: parsedShift,
          technology: String(tech || 'GPON').toUpperCase()
        });

        count++;
      }
    }
  });

  this.persist();
  window.dispatchEvent(new Event('data-updated'));
  return count;
}
  public importProductionSchedules(raw: any[][]): number {
  let count = 0;
  const ctx = this.getContext();
  const currentUser = this.getCurrentUser();

  raw.slice(1).forEach(row => {
    if (!row[0] || !row[1]) return;

    const [analystName, date, shift, type, tech, qty] = row;

    const analyst = this.users.find(
      u =>
        u.groupId === ctx.groupId &&
        u.role === UserRole.ANALYST &&
        u.normalizedLogin === String(analystName).toUpperCase()
    );

    if (analyst) {
      const numQty = parseInt(String(qty)) || 1;

      for (let i = 0; i < numQty; i++) {
        const parsedShift =
          String(shift).toUpperCase() === 'TARDE'
            ? Shift.AFTERNOON
            : Shift.MORNING;

        const parsedType =
          String(type).toUpperCase() === 'VIRTUAL'
            ? ExpertiseType.VIRTUAL
            : ExpertiseType.PRESENTIAL;

        const scheduleTime = this.getManualScheduleTime(
          analyst.id,
          String(date),
          parsedShift,
          parsedType
        );

        this.schedules.push({
          id: `sch-prod-${Date.now()}-${Math.random()}`,
          groupId: ctx.groupId,
          title: `PRODUÇÃO - ${analystName}`,
          technicianId: 'prod-tech',
          analystId: analyst.id,
          datetime: `${date}T${scheduleTime}Z`,
          type: parsedType,
          status: ScheduleStatus.CONFIRMED,
          availabilitySlotId: 'prod-import',
          shift: parsedShift,
          technology: String(tech || 'GPON').toUpperCase()
        });

        count++;
      }
    }
  });

  this.persist();

  auditService.logTicket({
    user: currentUser,
    action: 'IMPORT_AGENDA_PRODUCAO',
    targetType: 'Sistema',
    targetValue: ctx.groupId,
    reason: `Importação de agenda em produção realizada. ${count} slot(s) inserido(s).`,
    screen: 'Administração',
    groupId: ctx.groupId
  });

  window.dispatchEvent(new Event('data-updated'));
  return count;
}
  public clearTestSchedules() { this.schedulesTeste = []; this.persist(); window.dispatchEvent(new Event('data-updated')); }
  public clearProductionSchedules() {
  const ctx = this.getContext();
  const currentUser = this.getCurrentUser();

  this.schedules = this.schedules.filter(
    s => !(s.groupId === ctx.groupId && s.availabilitySlotId === 'prod-import')
  );

  this.persist();

  auditService.logTicket({
    user: currentUser,
    action: 'LIMPAR_AGENDA_PRODUCAO_IMPORTADA',
    targetType: 'Sistema',
    targetValue: ctx.groupId,
    reason: 'Limpeza dos slots importados em produção.',
    screen: 'Administração',
    groupId: ctx.groupId
  });

  window.dispatchEvent(new Event('data-updated'));
}
  public getDetailedIdleAnalysis(startDate: string, endDate: string) { const analysts = this.users.filter(u => u.role === UserRole.ANALYST); const start = new Date(startDate + 'T00:00:00'); const end = new Date(endDate + 'T23:59:59'); let businessDays = 0; let curr = new Date(start); while (curr <= end) { if (curr.getDay() !== 0 && curr.getDay() !== 6) businessDays++; curr.setDate(curr.getDate() + 1); } const totalPossibleHours = businessDays * 6; return analysts.map(analyst => { const analystEvents = this.events.filter(e => { const d = new Date(e.startDatetime.split('T')[0] + 'T12:00:00'); return e.involvedUserIds.includes(analyst.id) && d >= start && d <= end; }); const pool = this.testModeActive ? this.schedulesTeste : this.schedules; const analystSchedules = pool.filter(s => { const d = new Date(s.datetime.split('T')[0] + 'T12:00:00'); return s.analystId === analyst.id && d >= start && d <= end && s.status !== ScheduleStatus.CANCELLED; }); const getHoursFromEvents = (filteredEvents: EventSchedule[]) => { return filteredEvents.reduce((acc, e) => acc + (e.shift === Shift.FULL_DAY ? 6 : 3), 0); }; const trainingHours = getHoursFromEvents(analystEvents.filter(e => e.type === 'Training')); const internalCertHours = getHoursFromEvents(analystEvents.filter(e => e.title.toUpperCase().includes('CERTIFICAÇÃO'))); const offHours = getHoursFromEvents(analystEvents.filter(e => e.type === 'Day Off' || e.title.toUpperCase().includes('FOLGA') || e.title.toUpperCase().includes('FÉRIAS'))); const productiveHours = analystSchedules.reduce((acc, s) => { return acc + (s.type === ExpertiseType.VIRTUAL ? 1.5 : 1.0); }, 0); const nonProductiveBlockedHours = trainingHours + internalCertHours + offHours; const emptyHours = Math.max(0, totalPossibleHours - productiveHours - nonProductiveBlockedHours); const totalIdleHours = trainingHours + internalCertHours + offHours + emptyHours; const idlePercent = totalPossibleHours > 0 ? (totalIdleHours / totalPossibleHours) * 100 : 0; return { id: analyst.id, name: analyst.fullName, totalHours: totalPossibleHours, productiveHours, trainingHours, internalCertHours, offHours, emptyHours, totalIdleHours, idlePercent }; }); }
  public getOperationalReport(f: any) { return { kpis: { requested: 0, realized: 0, noShow: 0, reprovedEad: 0, reprovedVirtual: 0, reprovedPresential: 0, pending: 0 }, rankings: { partners: [], cities: [], states: [] } }; }
  public getQualityReport(f: any) { return { kpis: { noShowPct: 0, reprovedEadPct: 0, reprovedVirtualPct: 0, reprovedPresentialPct: 0 } }; }
  public getCapacityRiskReport() { return { summary: { capacity: 0, demand: 0, balance: 0 }, analysts: [] }; }
  public getBrazilMapData() {
    const context = this.getContext();
    const allTechs = this.technicians.filter(t => t.groupId === context.groupId);
    const scheduledTechs = allTechs.filter(t => 
      t.status_principal === 'AGENDADOS' || 
      t.certificationProcessStatus === CertificationProcessStatus.SCHEDULED
    );

    const statsByUF: Record<string, { techs: number, certs: number, reproved: number, noShow: number }> = {};

    // Initialize with all UFs to ensure they appear on the map if needed, 
    // or just process existing ones.
    allTechs.forEach(t => {
      // Tenta encontrar o UF correto se não estiver preenchido ou se for o fallback padrão
      let uf = (t.state || '').toUpperCase();
      if (!uf || uf === 'RS') {
        const cityMatch = mockCities.find(mc => this.safeNormalize(mc.name) === this.safeNormalize(t.city));
        if (cityMatch) uf = cityMatch.uf;
        else if (!uf) uf = 'RS';
      }
      
      if (!statsByUF[uf]) {
        statsByUF[uf] = { techs: 0, certs: 0, reproved: 0, noShow: 0 };
      }
      
      if (t.status_principal === 'AGENDADOS' || t.certificationProcessStatus === CertificationProcessStatus.SCHEDULED) {
        statsByUF[uf].techs++;
      }
      
      if (t.certificationProcessStatus === CertificationProcessStatus.CERTIFIED_APPROVED) {
        statsByUF[uf].certs++;
      }
      
      if (t.certificationProcessStatus === CertificationProcessStatus.CERTIFIED_REPROVED_1 || t.certificationProcessStatus === CertificationProcessStatus.CERTIFIED_REPROVED_2) {
        statsByUF[uf].reproved++;
      }
      
      if (t.participationStatus === ParticipationStatus.NO_SHOW) {
        statsByUF[uf].noShow++;
      }
    });

    return Object.entries(statsByUF).map(([uf, stats]) => ({
      uf,
      techs: stats.techs,
      certs: stats.certs,
      reprovedPct: (stats.certs + stats.reproved) > 0 ? (stats.reproved / (stats.certs + stats.reproved)) * 100 : 0,
      noShowPct: (stats.techs + stats.certs + stats.reproved + stats.noShow) > 0 ? (stats.noShow / (stats.techs + stats.certs + stats.reproved + stats.noShow)) * 100 : 0
    }));
  }
  
  public getBacklogForecasting() {
    return {
      kpis: {
        totalEligible: 0,
        capacityP: 0,
        capacityV: 0,
        projectedBacklog: 0,
        vencimento2d: 0,
        vencimento5d: 0
      },
      riskByClass: [],
      analystPressure: []
    };
  }

  public createTrainingClass(params: {
  type: 'GPON' | 'HFC' | 'OUTROS';
  requiresCert: boolean;
  classNumber: string;
  subcategory: string;
  audience: 'ANALISTA' | 'MULTIPLICADOR';
})
  {
    const ctx = this.getContext();
    const currentUser = this.getCurrentUser();

    const newClass: TrainingClass = {
      id: `class-${Date.now()}`,
      groupId: ctx.groupId,
      classNumber: String(params.classNumber || '').trim().toUpperCase(),
      title: `${params.type} - TURMA ${String(params.classNumber || '').trim()}`,
      subcategory: String(params.subcategory || '').trim().toUpperCase(),
      audience: params.audience,
      type: params.type,
      requiresCert: !!params.requiresCert,
      locationId: '',
      clientCompany: '',
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
      responsibleAnalystId: '',
      status: TrainingStatus.PLANNED,
      observations: '',
      createdAt: new Date().toISOString(),
      createdBy: currentUser.fullName
    };

    this.trainingClasses.push(newClass);
    this.persist();
    window.dispatchEvent(new Event('data-updated'));

    return newClass;
  }

  private applyImportedOutcome(
  tech: Technician,
  classObj: TrainingClass,
  importedOutcome: string,
  obs?: string
) {
  const outcome = this.safeNormalize(importedOutcome || '');

  tech.status_observacao = obs || tech.status_observacao || '';
  tech.status_updated_at = new Date().toISOString();
  tech.status_updated_by = this.getCurrentUser().fullName;

  // padrão: entra na fila para agendamento
  tech.status_submotivo = '';
  tech.categoria_reprovacao = '';
  tech.participationStatus = ParticipationStatus.ENROLLED;
  tech.eadApprovalStatus = ApprovalStatus.PENDING;
  tech.generalApprovalStatus = ApprovalStatus.PENDING;

  tech.status_principal = classObj.requiresCert
    ? 'PENDENTE_CERTIFICAÇÃO'
    : 'TREINAMENTO SEM CERTIFICAÇÃO';

  tech.certificationProcessStatus = classObj.requiresCert
    ? CertificationProcessStatus.QUALIFIED_AWAITING
    : CertificationProcessStatus.NOT_REQUIRED;

  // vazio = FILA
  if (!outcome || outcome === 'FILA') {
    return;
  }

  if (outcome === 'NOSHOW' || outcome === 'NO SHOW') {
    tech.status_principal = 'REPROVADO';
    tech.status_submotivo = 'NOSHOW';
    tech.categoria_reprovacao = 'NOSHOW';
    tech.participationStatus = ParticipationStatus.NO_SHOW;
    tech.generalApprovalStatus = ApprovalStatus.REPROVED;
    tech.certificationProcessStatus = CertificationProcessStatus.CERTIFIED_REPROVED_1;
    return;
  }

  if (outcome === 'SEM EAD') {
    tech.status_principal = 'REPROVADO';
    tech.status_submotivo = 'SEM EAD';
    tech.categoria_reprovacao = 'EAD';
    tech.eadApprovalStatus = ApprovalStatus.REPROVED;
    tech.generalApprovalStatus = ApprovalStatus.REPROVED;
    tech.certificationProcessStatus = CertificationProcessStatus.CERTIFIED_REPROVED_1;
    return;
  }

  if (outcome === 'REPROVADO EAD') {
    tech.status_principal = 'REPROVADO';
    tech.status_submotivo = 'REPROVADO EAD';
    tech.categoria_reprovacao = 'EAD';
    tech.eadApprovalStatus = ApprovalStatus.REPROVED;
    tech.generalApprovalStatus = ApprovalStatus.REPROVED;
    tech.certificationProcessStatus = CertificationProcessStatus.CERTIFIED_REPROVED_1;
    return;
  }

  if (outcome === 'REPROVADO VIRTUAL') {
    tech.status_principal = 'REPROVADO';
    tech.status_submotivo = 'REPROVADO VIRTUAL';
    tech.categoria_reprovacao = 'VIRTUAL';
    tech.generalApprovalStatus = ApprovalStatus.REPROVED;
    tech.certificationProcessStatus = CertificationProcessStatus.CERTIFIED_REPROVED_1;
    return;
  }

  if (outcome === 'INABILITADO' || outcome === 'NAO REALIZAR' || outcome === 'NÃO REALIZAR') {
    tech.status_principal = 'INABILITADO';
    tech.status_submotivo = 'GESTOR';
    tech.certificationProcessStatus = CertificationProcessStatus.INABILITADO;
    return;
  }

  // qualquer valor inválido ou não reconhecido cai na FILA
}
  
  public importTechniciansForClass(classObj: TrainingClass, rawData: any[][]): ImportResult {
    let inserted = 0;
    let updated = 0;
    let ignored = 0;
    let duplicatedInClass = 0;
    let newInOtherClass = 0;
    const errors: ImportError[] = [];

    if (!rawData || rawData.length < 2) {
      return { inserted, updated, ignored, duplicatedInClass, newInOtherClass, errors };
    }

    const headers = (rawData[0] || []).map(h => this.normalizeHeaderName(h));

    const nomeIdx = this.getHeaderIndex(headers, ['NOME']);
    const emailIdx = this.getHeaderIndex(headers, ['EMAIL', 'E-MAIL']);
    const cidadeIdx = this.getHeaderIndex(headers, ['CIDADE']);
    const estadoIdx = this.getHeaderIndex(headers, ['ESTADO', 'UF']);
    const telefoneIdx = this.getHeaderIndex(headers, ['TELEFONE', 'CELULAR']);
    const cpfIdx = this.getHeaderIndex(headers, ['CPF']);
    const empresaIdx = this.getHeaderIndex(headers, ['EMPRESA/PARCEIRO', 'EMPRESA / PARCEIRO', 'EMPRESA']);
    const loginToaIdx = this.getHeaderIndex(headers, ['LOGIN TOA', 'LOGINTOA']);
    const obsIdx = this.getHeaderIndex(headers, ['OBS', 'OBSERVACAO', 'OBSERVAÇÃO']);
    const solicitanteIdx = this.getHeaderIndex(headers, [
      'SOLICITANTE',
      'SOLICITANTE/NOME',
      'SOLICITANTE / NOME',
      'NOME DO SOLICITANTE'
]);
      const outcomeIdx = this.getHeaderIndex(headers, [
  'RESULTADO IMPORTAÇÃO',
  'RESULTADO IMPORTACAO',
  'RESULTADO',
  'STATUS'
]);
    

    rawData.slice(1).forEach((row, index) => {
      if (!row || row.every(cell => String(cell ?? '').trim() === '')) {
        return;
      }

      const nome = nomeIdx !== -1 ? String(row[nomeIdx] ?? '').trim().toUpperCase() : '';
      const cidade = cidadeIdx !== -1 ? String(row[cidadeIdx] ?? '').trim().toUpperCase() : '';
      const estado = estadoIdx !== -1 ? String(row[estadoIdx] ?? '').trim().toUpperCase() : '';
      const email = emailIdx !== -1 ? String(row[emailIdx] ?? '').trim() : '';
      const telefone = telefoneIdx !== -1 ? String(row[telefoneIdx] ?? '').trim() : '';
      const empresaParceiro = empresaIdx !== -1 ? String(row[empresaIdx] ?? '').trim().toUpperCase() : '';
      const loginToa = loginToaIdx !== -1 ? String(row[loginToaIdx] ?? '').trim().toUpperCase() : '';
      const obs = obsIdx !== -1 ? String(row[obsIdx] ?? '').trim() : '';
      const solicitante = solicitanteIdx !== -1 ? String(row[solicitanteIdx] ?? '').trim() : '';
      const importedOutcome = outcomeIdx !== -1 ? String(row[outcomeIdx] ?? '').trim() : '';
      
      const { cpf: cleanCpf, error: cpfError } = this.processCpfValue(
        cpfIdx !== -1 ? row[cpfIdx] : null
      );

      if (!cleanCpf) {
        errors.push({
          line: index + 2,
          field: 'CPF',
          reason: cpfError || 'CPF inválido',
          value: cpfIdx !== -1 ? row[cpfIdx] : null
        });
        ignored++;
        return;
      }

      const existingSameClass = this.technicians.find(
        t =>
          t.groupId === classObj.groupId &&
          t.trainingClassId === classObj.id &&
          String(t.cpf ?? '').replace(/\D/g, '').padStart(11, '0') === cleanCpf
      );

      if (existingSameClass) {
        duplicatedInClass++;
        ignored++;
        return;
      }

      const existingOtherClass = this.technicians.find(
        t =>
          t.groupId === classObj.groupId &&
          t.trainingClassId !== classObj.id &&
          String(t.cpf ?? '').replace(/\D/g, '').padStart(11, '0') === cleanCpf
      );

      if (existingOtherClass) {
        newInOtherClass++;
      }

      const newTech: Technician = {
        id: `tech-${Date.now()}-${Math.random()}`,
        groupId: classObj.groupId,
        name: nome,
        cpf: cleanCpf,
        city: cidade,
        state: estado || 'RS',
        email,
        phone: telefone,
        company: empresaParceiro,
        externalLogin: loginToa,
        solicitor: solicitante,
        certificationType: 'VIRTUAL',
        trainingClassId: classObj.id,
        participationStatus: ParticipationStatus.ENROLLED,
        eadExamScore: 0,
        finalTrainingScore: 0,
        eadApprovalStatus: ApprovalStatus.PENDING,
        generalApprovalStatus: ApprovalStatus.PENDING,
        certificationProcessStatus: classObj.requiresCert
          ? CertificationProcessStatus.QUALIFIED_AWAITING
          : CertificationProcessStatus.NOT_REQUIRED,
        certificationReproofCount: 0,
        generateCertification: classObj.requiresCert,
        observations: obs,
        unique_key: `${cleanCpf}_${classObj.id}`,
        status_principal: classObj.requiresCert
          ? 'PENDENTE_CERTIFICAÇÃO'
          : 'TREINAMENTO SEM CERTIFICAÇÃO',
        technology: classObj.type
      };

      (newTech as any).solicitante = solicitante;

      this.applyImportedOutcome(
  newTech,
  classObj,
  importedOutcome,
  obs
);

      this.technicians.push(newTech);
      inserted++;
    });

    this.persist();
    window.dispatchEvent(new Event('data-updated'));

        return { inserted, updated, ignored, duplicatedInClass, newInOtherClass, errors };
  }

  public reproveScheduledTechnician(params: {
    techId: string;
    outcome: 'NOSHOW' | 'REPROVADO_1_CERTIFICACAO' | 'REPROVADO_2_CERTIFICACAO';
    observation?: string;
  }) {
    const tech = this.technicians.find(t => t.id === params.techId);
    const currentUser = this.getCurrentUser();

    if (!tech) {
      return { success: false, message: 'Técnico não localizado.' };
    }

    const ctx = this.getContext();
    if (tech.groupId !== ctx.groupId) {
      return { success: false, message: 'Sem permissão para este grupo.' };
    }

    try {
      if (tech.scheduledCertificationId) {
        const sch = this.schedules.find(s => s.id === tech.scheduledCertificationId);
        if (sch) {
          sch.status = ScheduleStatus.CANCELLED;
        }
      }

      const currentAttempts = tech.certificationReproofCount || 0;
      let nextAttempts = currentAttempts;

      if (
        params.outcome === 'NOSHOW' ||
        params.outcome === 'REPROVADO_1_CERTIFICACAO' ||
        params.outcome === 'REPROVADO_2_CERTIFICACAO'
      ) {
        nextAttempts = currentAttempts + 1;
      }

      tech.reprovado_manual = true;
      tech.status_updated_at = new Date().toISOString();
      tech.status_updated_by = currentUser.fullName;
      tech.status_observacao = params.observation || '';
      tech.scheduledCertificationId = undefined;
      tech.generalApprovalStatus = ApprovalStatus.REPROVED;
      tech.certificationReproofCount = nextAttempts;

      if (params.outcome === 'NOSHOW') {
        tech.status_principal = 'REPROVADO';
        tech.status_submotivo = 'NOSHOW';
        tech.categoria_reprovacao = 'CERTIFICAÇÃO';
        tech.participationStatus = ParticipationStatus.NO_SHOW;
        tech.certificationProcessStatus =
          nextAttempts >= 2
            ? CertificationProcessStatus.INABILITADO
            : CertificationProcessStatus.CERTIFIED_REPROVED_1;

        if (nextAttempts >= 2) {
          tech.status_principal = 'INABILITADO';
          tech.generateCertification = false;
        }

        this.persist();
        auditService.logTicket({
          user: currentUser,
          action: nextAttempts >= 2
            ? 'NOSHOW_CERTIFICACAO_2_TENTATIVA_INABILITADO'
            : 'NOSHOW_CERTIFICACAO_1_TENTATIVA',
          targetType: 'CPF',
          targetValue: tech.cpf,
          reason: `No-show em certificação. Tentativas acumuladas: ${nextAttempts}.`,
          subReason: 'NOSHOW',
          categoryReproof: 'CERTIFICAÇÃO',
          screen: 'Turmas e Técnicos',
          groupId: tech.groupId
        });

        window.dispatchEvent(new Event('data-updated'));
        return {
          success: true,
          attempts: nextAttempts,
          movedToIneligible: nextAttempts >= 2
        };
      }

      if (params.outcome === 'REPROVADO_1_CERTIFICACAO') {
        if (nextAttempts >= 2) {
          tech.status_principal = 'INABILITADO';
          tech.status_submotivo = 'REPROVADO 2º CERTIFICAÇÃO';
          tech.categoria_reprovacao = 'CERTIFICAÇÃO';
          tech.certificationProcessStatus = CertificationProcessStatus.INABILITADO;
          tech.generateCertification = false;

          this.persist();
          auditService.logTicket({
            user: currentUser,
            action: 'REPROVACAO_INTELIGENTE_2_TENTATIVA_INABILITADO',
            targetType: 'CPF',
            targetValue: tech.cpf,
            reason: `Analista marcou 'REPROVADO 1º CERTIFICAÇÃO', mas o sistema identificou ${nextAttempts} tentativas acumuladas.`,
            subReason: 'REPROVADO 2º CERTIFICAÇÃO',
            categoryReproof: 'CERTIFICAÇÃO',
            screen: 'Turmas e Técnicos',
            groupId: tech.groupId
          });

          window.dispatchEvent(new Event('data-updated'));
          return {
            success: true,
            attempts: nextAttempts,
            movedToIneligible: true,
            autoPromotedToSecondFailure: true
          };
        }

        tech.status_principal = 'REPROVADO';
        tech.status_submotivo = 'REPROVADO 1º CERTIFICAÇÃO';
        tech.categoria_reprovacao = 'CERTIFICAÇÃO';
        tech.participationStatus = ParticipationStatus.ENROLLED;
        tech.certificationProcessStatus = CertificationProcessStatus.CERTIFIED_REPROVED_1;

        this.persist();
        auditService.logTicket({
          user: currentUser,
          action: 'REPROVACAO_1_CERTIFICACAO',
          targetType: 'CPF',
          targetValue: tech.cpf,
          reason: 'Técnico reprovado na certificação.',
          subReason: 'REPROVADO 1º CERTIFICAÇÃO',
          categoryReproof: 'CERTIFICAÇÃO',
          screen: 'Turmas e Técnicos',
          groupId: tech.groupId
        });

        window.dispatchEvent(new Event('data-updated'));
        return {
          success: true,
          attempts: nextAttempts,
          movedToIneligible: false
        };
      }

      if (params.outcome === 'REPROVADO_2_CERTIFICACAO') {
        tech.status_principal = 'INABILITADO';
        tech.status_submotivo = 'REPROVADO 2º CERTIFICAÇÃO';
        tech.categoria_reprovacao = 'CERTIFICAÇÃO';
        tech.participationStatus = ParticipationStatus.ENROLLED;
        tech.certificationProcessStatus = CertificationProcessStatus.INABILITADO;
        tech.generateCertification = false;

        if (tech.certificationReproofCount < 2) {
          tech.certificationReproofCount = 2;
        }

        this.persist();
        auditService.logTicket({
          user: currentUser,
          action: 'REPROVACAO_2_CERTIFICACAO_INABILITADO',
          targetType: 'CPF',
          targetValue: tech.cpf,
          reason: 'Técnico enviado para INABILITADOS após 2ª reprovação em certificação.',
          subReason: 'REPROVADO 2º CERTIFICAÇÃO',
          categoryReproof: 'CERTIFICAÇÃO',
          screen: 'Turmas e Técnicos',
          groupId: tech.groupId
        });

        window.dispatchEvent(new Event('data-updated'));
        return {
          success: true,
          attempts: tech.certificationReproofCount,
          movedToIneligible: true
        };
      }

      return { success: false, message: 'Resultado de reprovação inválido.' };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  }
}

export const dataService = new DataService();
