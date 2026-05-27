
import {
  saveAppState,
  loadAppState,
  saveAppStateHistory,
  listAppStateHistory,
  restoreAppStateFromHistory,
} from './appStateService';

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
  filter: (t: Technician) => {
    const status = normalizeText(t.status_principal || '');
    const cert = String(t.certificationProcessStatus || '');

    const isAlreadyScheduled =
      status === 'AGENDADOS' ||
      cert === CertificationProcessStatus.SCHEDULED ||
      !!t.scheduledCertificationId;

    if (isAlreadyScheduled) {
      return false;
    }

    return (
      status === 'PENDENTE_CERTIFICACAO' ||
      status === 'PENDENTE_CERTIFICAÇÃO' ||
      status === 'PENDENTE_TRATAMENTO' ||
      status === 'BACKLOG AGUARDANDO' ||
      status === 'FILA' ||
      status === 'FILA CERTIFICACAO' ||
      status === 'FILA CERTIFICAÇÃO' ||
      cert === CertificationProcessStatus.QUALIFIED_AWAITING
    );
  }
},

      { 
  
  key: 'scheduled', 
  label: 'AGENDADOS', 
  filter: (t: Technician) =>
    t.status_principal === 'AGENDADOS' &&
    t.certificationProcessStatus === CertificationProcessStatus.SCHEDULED &&
    !!t.scheduledCertificationId
},

  {
    key: 'awaiting_result',
    label: 'AGUARDANDO RESULTADO',
    filter: (t: Technician) =>
      t.status_principal === 'AGUARDANDO_RESULTADO' ||
      t.certificationProcessStatus === CertificationProcessStatus.AWAITING_RESULT
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


type OperationalTimeType = ExpertiseType.VIRTUAL | ExpertiseType.PRESENTIAL;
type OperationalTimeGroup = 'DEFAULT' | 'RS' | 'FUSO_1' | 'AC';

function normalizeTextForTimeRule(value?: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function getOperationalTimeGroup(
  uf?: string,
  city?: string,
  type?: OperationalTimeType
): OperationalTimeGroup {
  const state = normalizeTextForTimeRule(uf);
  const normalizedCity = normalizeTextForTimeRule(city);

  if (type === ExpertiseType.PRESENTIAL) {
    if (state === 'RS') return 'RS';

    if (normalizedCity === 'MANAUS' || state === 'AM') {
      return 'FUSO_1';
    }

    return 'DEFAULT';
  }

  if (type === ExpertiseType.VIRTUAL) {
    if (state === 'AC') return 'AC';

    if (['AM', 'RO', 'RR', 'MT', 'MS'].includes(state)) {
      return 'FUSO_1';
    }

    return 'DEFAULT';
  }

  return 'DEFAULT';
}

function getOperationalStartTime(params: {

  uf?: string;
  city?: string;
}): string {
  const state = normalizeTextForTimeRule(params.uf);
  const city = normalizeTextForTimeRule(params.city);

  const isFuso1 =
    city === 'MANAUS' ||
    ['AM', 'RO', 'RR', 'MT', 'MS'].includes(state);

  // RS e cidades FUSO -1 seguem a mesma regra
  if (state === 'RS' || isFuso1) {
    return '09:00:00';
  }

  return '08:30:00';
}

function getPresentialPracticeTimeByRegion(params: {
  uf?: string;
  city?: string;
  shift: Shift;
  position: number;
}): string {
  const state = normalizeTextForTimeRule(params.uf);
  const city = normalizeTextForTimeRule(params.city);

  const isSpecialRule =
    state === 'RS' ||
    city === 'MANAUS' ||
    ['AM', 'RO', 'RR', 'MT', 'MS'].includes(state);

  if (params.shift === Shift.AFTERNOON) {
    if (params.position === 1) return '14:30:00';
    if (params.position === 2) return '15:30:00';
    return '16:30:00';
  }

  if (isSpecialRule) {
    if (params.position === 1) return '09:30:00';
    if (params.position === 2) return '10:30:00';
    return '11:30:00';
  }

  if (params.position === 1) return '09:00:00';
  if (params.position === 2) return '10:00:00';
  return '11:00:00';
}

function isFusoMinusOneGroup(group?: string): boolean {
  return group === 'FUSO_1';
}

function hasFusoMinusOneConflict(
  currentGroup: string,
  incomingGroup: string
): boolean {
  return isFusoMinusOneGroup(currentGroup) !== isFusoMinusOneGroup(incomingGroup);
}

function addMinutesToTime(time: string, minutesToAdd: number): string {
  const [hourRaw, minuteRaw] = time.split(':');
  const total = Number(hourRaw) * 60 + Number(minuteRaw) + minutesToAdd;
  const hour = Math.floor(total / 60);
  const minute = total % 60;

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
}

function hasRequiredAppStateShape(payload: any): boolean {
  return !!payload &&
    Array.isArray(payload.technicians) &&
    Array.isArray(payload.trainingClasses) &&
    Array.isArray(payload.schedules);
}

class DataService {
  private persistQueue: Promise<void> = Promise.resolve();
  private persistVersion: number = 0;
  private cloudUpdatedAt: string | null = null;
  private cloudLoaded: boolean = false;
  private lastPersistedPayloadJson: string | null = null;
private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private lastAutoBackupAt: string | null =
  localStorage.getItem('certitech_last_auto_backup_at_v1');

private shouldCreateAutoBackup(): boolean {
  if (!this.lastAutoBackupAt) return true;

  const last = new Date(this.lastAutoBackupAt);
  const now = new Date();

  const diffHours =
    (now.getTime() - last.getTime()) / (1000 * 60 * 60);

  return diffHours >= 24;
}

private markAutoBackupCreated() {
  this.lastAutoBackupAt = new Date().toISOString();
  localStorage.setItem(
    'certitech_last_auto_backup_at_v1',
    this.lastAutoBackupAt
  );
}
  private processAwaitingResults() {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  this.technicians.forEach((tech: Technician) => {
    if (
      tech.certificationProcessStatus !==
      CertificationProcessStatus.SCHEDULED
    ) {
      return;
    }

    if (!tech.scheduledCertificationId) {
      return;
    }

    const schedule = this.schedules.find(
      s => s.id === tech.scheduledCertificationId
    );

    if (!schedule?.datetime) {
      return;
    }

    const dataCert = new Date(schedule.datetime);
    dataCert.setHours(0, 0, 0, 0);

    const diffMs = hoje.getTime() - dataCert.getTime();
    const dias = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (dias >= 3) {
      tech.status_principal = 'AGUARDANDO_RESULTADO';
      tech.certificationProcessStatus = CertificationProcessStatus.AWAITING_RESULT;
      tech.status_observacao = 'Resultado não recebido via PowerApps/Excel';
      tech.status_updated_at = new Date().toISOString();
      tech.status_updated_by = 'SISTEMA';
    }
  });
}

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
      schedulingStartOffsetDays: 0,
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
this.technicians = [];
    // NORMALIZA CPF ANTIGO
this.technicians = this.technicians.map(t => {
  const cleanCpf = String(t.cpf || '')
    .replace(/\D/g, '');

  if (!cleanCpf) return t;

  return {
    ...t,
    cpf: cleanCpf.padStart(11, '0')
  };
});
    // PERSISTE NORMALIZAÇÃO ANTIGA

this.trainingClasses = [];

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

this.schedules = [];
    
    this.schedulesTeste = [];
this.events = [];
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
      console.warn('Supabase novo/limpo: nenhum app_state encontrado. App será iniciado com estado local/default.');

      this.cloudUpdatedAt = null;
      this.cloudLoaded = true;

      window.dispatchEvent(new Event('data-updated'));

      return true;
    }

    this.cloudUpdatedAt = cloudState.updated_at || null;
    this.cloudLoaded = true;

    let payload = cloudState.data;

// compatibilidade caso o Supabase tenha salvo o estado dentro de data.data
if (payload?.data && typeof payload.data === 'object') {
  payload = payload.data;
}

// compatibilidade caso tenha sido salvo dentro de payload
if (payload?.payload && typeof payload.payload === 'object') {
  payload = payload.payload;
}
    
        if (
  !payload ||
  !Array.isArray(payload.technicians) ||
  !Array.isArray(payload.trainingClasses) ||
  !Array.isArray(payload.schedules)
) {
  console.warn('Payload inválido recebido do Supabase:', payload);

  alert(
    'O estado atual salvo no Supabase está inválido. Será necessário restaurar uma versão válida pelo histórico.'
  );

  return false;
}

// campos opcionais/default para compatibilidade
payload.groups = Array.isArray(payload.groups) ? payload.groups : this.groups;
payload.users = Array.isArray(payload.users) ? payload.users : this.users;
payload.groupRules = Array.isArray(payload.groupRules) ? payload.groupRules : this.groupRules;
payload.cities = Array.isArray(payload.cities) ? payload.cities : this.cities;
payload.schedulesTeste = Array.isArray(payload.schedulesTeste) ? payload.schedulesTeste : [];
payload.events = Array.isArray(payload.events) ? payload.events : [];
payload.scoreAdjustments = Array.isArray(payload.scoreAdjustments) ? payload.scoreAdjustments : [];
payload.integrationBases = Array.isArray(payload.integrationBases) ? payload.integrationBases : [];
payload.routingRules = Array.isArray(payload.routingRules) ? payload.routingRules : [];
payload.analystMappings = Array.isArray(payload.analystMappings) ? payload.analystMappings : [];
    payload.baseFixedDates = Array.isArray(payload.baseFixedDates)
  ? payload.baseFixedDates
  : [];

localStorage.setItem(
  'certitech_base_fixed_dates_v1',
  JSON.stringify(payload.baseFixedDates)
);
    console.log('CLOUD STATE RECEBIDO:', cloudState);
console.log('PAYLOAD RECEBIDO:', payload);
console.log('CHECK PAYLOAD:', {
  hasPayload: !!payload,
  technicians: Array.isArray(payload?.technicians),
  trainingClasses: Array.isArray(payload?.trainingClasses),
  schedules: Array.isArray(payload?.schedules),
});

// compatibilidade com backups antigos
payload.integrationBases = Array.isArray(payload.integrationBases)
  ? payload.integrationBases
  : [];

payload.routingRules = Array.isArray(payload.routingRules)
  ? payload.routingRules
  : [];

payload.analystMappings = Array.isArray(payload.analystMappings)
  ? payload.analystMappings
  : [];

payload.schedulesTeste = Array.isArray(payload.schedulesTeste)
  ? payload.schedulesTeste
  : [];

payload.events = Array.isArray(payload.events)
  ? payload.events
  : [];

payload.scoreAdjustments = Array.isArray(payload.scoreAdjustments)
  ? payload.scoreAdjustments
  : [];

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
    this.lastPersistedPayloadJson = JSON.stringify(this.buildFullPayload());

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
localStorage.setItem(
  'g_analyst_mapping_v1',
  JSON.stringify(this.analystMappings)
);

/*
|--------------------------------------------------------------------------
| CARREGAMENTO SEGURO
|--------------------------------------------------------------------------
| IMPORTANTE:
| Ao carregar o app, não alteramos status automaticamente.
| Isso evita gravações involuntárias no Supabase e impede que
| agendamentos sejam aprovados/movidos apenas por abrir a tela.
|--------------------------------------------------------------------------
*/

window.dispatchEvent(new Event('data-updated'));

return true;
    
  } catch (error: any) {
  console.error('ERRO REAL initializeFromCloud:', error);

  alert(
    'Erro real ao carregar Supabase: ' +
    (error?.message || JSON.stringify(error))
  );

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
      filter: `app_id=eq.agendamento_certificacao`,
    },
    async (payload) => {
      const row: any = payload.new || payload.old;

      if (row?.group_id !== groupId) {
        return;
      }

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

  private mergeById<T extends { id: string }>(
  cloudItems: T[] = [],
  localItems: T[] = []
): T[] {
  const map = new Map<string, T>();

  cloudItems.forEach(item => {
    if (item?.id) map.set(String(item.id), item);
  });

  localItems.forEach(item => {
    if (item?.id) map.set(String(item.id), item);
  });

  return Array.from(map.values());
}
  
  private persist(options: { 
  allowScheduleDeletion?: boolean; 
  allowEventDeletion?: boolean;
  immediate?: boolean;
} = {}) {
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

  if (!this.cloudLoaded) {
    alert('Os dados ainda não foram carregados da nuvem. Atualize a página antes de fazer alterações.');
    return;
  }

  const payload = this.buildFullPayload();

  if (!hasRequiredAppStateShape(payload)) {
    alert('Persistência bloqueada: estado obrigatório incompleto. Nenhuma alteração foi salva na nuvem.');
    return;
  }

  const payloadJson = JSON.stringify(payload);

  if (this.lastPersistedPayloadJson === payloadJson) {
    return;
  }

  if (options.immediate) {
  if (this.persistTimer) {
    clearTimeout(this.persistTimer);
    this.persistTimer = null;
  }

  this.persistNow(payload, options);
  return;
}

if (this.persistTimer) {
  clearTimeout(this.persistTimer);
}

this.persistTimer = setTimeout(() => {
  this.persistTimer = null;
  this.persistNow(payload, options);
}, 8000);
}

  private persistNow(
  payload: any,
  options: { 
    allowScheduleDeletion?: boolean; 
    allowEventDeletion?: boolean;
    immediate?: boolean;
  } = {}
) {
  const groupId = this.getActiveGroupId();
  const currentUser = this.getCurrentUser();
  const version = ++this.persistVersion;

  this.persistQueue = this.persistQueue
    .catch(() => undefined)
    .then(async () => {
      if (version !== this.persistVersion) return;

      try {
        const currentCloudState = await loadAppState(groupId);

        if (version !== this.persistVersion) return;

        const cloudWasChangedByAnotherSession =
          !!currentCloudState?.updated_at &&
          !!this.cloudUpdatedAt &&
          currentCloudState.updated_at !== this.cloudUpdatedAt &&
          !options.allowScheduleDeletion &&
          !options.allowEventDeletion;

        if (cloudWasChangedByAnotherSession) {
          alert('Outra máquina atualizou o sistema antes desta alteração. A tela será recarregada para evitar perda de agendamentos.');
          window.location.reload();
          return;
        }

        if (currentCloudState?.data && this.shouldCreateAutoBackup()) {
          await saveAppStateHistory({
            groupId,
            data: {
              ...currentCloudState.data,
              _backupMeta: {
                createdAt: new Date().toISOString(),
                createdBy: currentUser?.fullName || 'SYSTEM',
                reason: 'AUTO_BACKUP_DIARIO'
              }
            },
            createdBy: currentUser?.fullName || 'SYSTEM',
            reason: 'AUTO_BACKUP_DIARIO',
          });

          this.markAutoBackupCreated();
        }

        const cloudData = currentCloudState?.data;

        const mergedPayload = cloudData
          ? {
              ...payload,
              schedules: options.allowScheduleDeletion
                ? payload.schedules
                : this.mergeById(cloudData.schedules || [], payload.schedules || []),
              schedulesTeste: options.allowScheduleDeletion
                ? payload.schedulesTeste
                : this.mergeById(cloudData.schedulesTeste || [], payload.schedulesTeste || []),
              events: options.allowEventDeletion
                ? payload.events
                : this.mergeById(cloudData.events || [], payload.events || [])
            }
          : payload;

        const savedState = await saveAppState(groupId, mergedPayload);

        this.cloudUpdatedAt = savedState?.updated_at || new Date().toISOString();
        this.cloudLoaded = true;
        this.lastPersistedPayloadJson = JSON.stringify(this.buildFullPayload());
      } catch (error) {
        console.error('Erro ao persistir no Supabase:', error);
      }
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
    analystMappings: this.analystMappings.filter(m => m.groupId === groupId),

    baseFixedDates: JSON.parse(
      localStorage.getItem('certitech_base_fixed_dates_v1') || '[]'
    )
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
  schedulingStartOffsetDays: 0,
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
'g_analyst_mapping_v1',
'certitech_base_fixed_dates_v1'
    ];

    keys.forEach(k => localStorage.removeItem(k));

    // 5) persiste novamente local + cloud
    this.persist({
  allowScheduleDeletion: true,
  allowEventDeletion: true
});

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
  public addCqSupportEvent(params: {
  analystId: string;
  dateIso: string;
  shift?: Shift;
  capacityExtra?: number;
  notes?: string;
}) {
  const ctx = this.getContext();
  const currentUser = this.getCurrentUser();

  const event: EventSchedule = {
    id: `evt-cq-${Date.now()}-${Math.random()}`,
    groupId: ctx.groupId,
    title: 'APOIO CQ',
    type: 'CQ_SUPPORT',
    startDatetime: `${params.dateIso}T00:00:00`,
    endDatetime: `${params.dateIso}T23:59:59`,
    involvedUserIds: [params.analystId],
    shift: params.shift || Shift.FULL_DAY,
    color: '#facc15',
    capacityExtra: params.capacityExtra || 6,
    active: true
  };

  this.events.push(event);
  this.persist();

  auditService.logTicket({
    user: currentUser,
    action: 'APOIO_CQ_CRIADO',
    targetType: 'Analista',
    targetValue: params.analystId,
    reason: `Apoio CQ criado para ${params.dateIso}, capacidade extra ${event.capacityExtra}.`,
    screen: 'Agenda',
    groupId: ctx.groupId
  });

  window.dispatchEvent(new Event('data-updated'));

  return event;
}

  public safeNormalize(value: any): string {
  let s = (value === null || value === undefined) ? "" : String(value);

  s = s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

  const aliases: Record<string, string> = {
    "JOINVILE": "JOINVILLE",
    "JOINVILE/SC": "JOINVILLE/SC",
    "CASCAVEL": "CASCAVEL",
    "CASCAVEL/PR": "CASCAVEL/PR",
    "FOZ DO IGUACU": "FOZ DO IGUACU",
    "FOZ DO IGUACU/PR": "FOZ DO IGUACU/PR",
    "SAO JOSE DOS PINHAIS": "SAO JOSE DOS PINHAIS",
    "S JOSE DOS PINHAIS": "SAO JOSE DOS PINHAIS"
  };

  return aliases[s] || s;
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
      id: user.id,
      name: firstName,
      fullName: user.fullName,
      role: user.role,
      groupId: user.groupId,
      managerId: user.managerId
    }));
    window.location.reload();
  }

  setActiveGroup(groupId: string) {
    const raw = localStorage.getItem('certitech_user');

    if (!raw) {
      throw new Error('Usuário não autenticado.');
    }

    const currentUser = JSON.parse(raw);

    const nextUser = {
      ...currentUser,
      groupId,
      group_id: groupId,
    };

    localStorage.setItem('certitech_user', JSON.stringify(nextUser));

    const rawProfile = localStorage.getItem('etn_user_profile');
    if (rawProfile) {
      try {
        const profile = JSON.parse(rawProfile);
        localStorage.setItem(
          'etn_user_profile',
          JSON.stringify({
            ...profile,
            group_id: groupId,
          })
        );
      } catch {
        localStorage.removeItem('etn_user_profile');
      }
    }
  }

  getUsers() { return [...this.users]; }
  getCities() { return [...this.cities]; }
  getEvents() { return this.events.filter(e => e.groupId === this.getContext().groupId); }
  public setEvents(newEvents: EventSchedule[]) {
  console.warn(
    'setEvents(listaInteira) ignorado para evitar perda de eventos em ambiente multiusuário.'
  );

  window.dispatchEvent(new Event('data-updated'));

  return {
    success: false,
    message: 'Atualização em massa de eventos bloqueada. Use updateEventById.'
  };
}

public updateEventById(eventId: string, patch: Partial<EventSchedule>) {
  const ctx = this.getContext();

  const index = this.events.findIndex(
    e => String(e.id) === String(eventId) && e.groupId === ctx.groupId
  );

  if (index === -1) {
    return { success: false, message: 'Evento não encontrado.' };
  }

  this.events[index] = {
    ...this.events[index],
    ...patch,
    id: this.events[index].id,
    groupId: this.events[index].groupId,
    updatedAt: new Date().toISOString()
  } as any;

  this.persist({ immediate: true });
  window.dispatchEvent(new Event('data-updated'));

  return { success: true };
}
  getSchedules() { 
    const pool = this.testModeActive ? this.schedulesTeste : this.schedules;
    return pool.filter(s => s.groupId === this.getContext().groupId); 
  }
  public setSchedules(newSchedules: CertificationSchedule[]) {
  console.warn(
    'setSchedules(listaInteira) ignorado para evitar perda de agendamentos em ambiente multiusuário.'
  );

  window.dispatchEvent(new Event('data-updated'));

  return {
    success: false,
    message: 'Atualização em massa de agendamentos bloqueada. Use updateScheduleById.'
  };
}

public updateScheduleById(scheduleId: string, patch: Partial<CertificationSchedule>) {
  const ctx = this.getContext();
  const pool = this.testModeActive ? this.schedulesTeste : this.schedules;

  const index = pool.findIndex(
    s => String(s.id) === String(scheduleId) && s.groupId === ctx.groupId
  );

  if (index === -1) {
    return { success: false, message: 'Agendamento não encontrado.' };
  }

  pool[index] = {
    ...pool[index],
    ...patch,
    id: pool[index].id,
    groupId: pool[index].groupId,
    updatedAt: new Date().toISOString()
  };

  this.persist({ immediate: true });
  window.dispatchEvent(new Event('data-updated'));

  return { success: true };
}
  getTechnicians() {
  const ctx = this.getContext();

  const activeScheduleByTechId = new Map<string, CertificationSchedule>();

  this.schedules
    .filter(
      s =>
        s.groupId === ctx.groupId &&
        s.status === ScheduleStatus.CONFIRMED &&
        !!s.technicianId &&
        ['auto', 'manual', 'base-fixed'].includes(String(s.availabilitySlotId || ''))
    )
    .forEach(s => {
      activeScheduleByTechId.set(String(s.technicianId), s);
    });

  let changed = false;

  this.technicians = this.technicians.map(t => {
    if (t.groupId !== ctx.groupId) return t;

    const schedule = activeScheduleByTechId.get(String(t.id));

    if (!schedule) return t;

    if (
      t.status_principal === 'AGENDADOS' &&
      t.certificationProcessStatus === CertificationProcessStatus.SCHEDULED &&
      t.scheduledCertificationId === schedule.id
    ) {
      return t;
    }

    changed = true;

    return {
      ...t,
      status_principal: 'AGENDADOS',
      certificationProcessStatus: CertificationProcessStatus.SCHEDULED,
      scheduledCertificationId: schedule.id,
      status_updated_at: new Date().toISOString(),
      status_updated_by: 'SISTEMA - RECONCILIAÇÃO'
    };
  });

 
  return this.technicians.filter(t => t.groupId === ctx.groupId);
}
  getTrainingClasses() { return this.trainingClasses.filter(c => c.groupId === this.getContext().groupId); }
  
  public async getBackupHistory(limit = 50): Promise<AppStateHistoryEntry[]> {
  const groupId = this.getContext().groupId || 'G3';
  const data = await listAppStateHistory(groupId, limit);
  return (data || []) as AppStateHistoryEntry[];
}

  public async restoreHistoryEntry(entryId: string) {
  try {
    const currentUser = this.getCurrentUser();

    const restored = await restoreAppStateFromHistory(
      entryId,
      currentUser?.fullName || 'SYSTEM'
    );

    this.cloudUpdatedAt = restored?.updated_at || new Date().toISOString();

    await this.initializeFromCloud();

    auditService.logTicket({
      user: currentUser,
      action: 'RESTORE_BACKUP_HISTORY',
      targetType: 'Sistema',
      targetValue: this.getContext().groupId,
      reason: `Restauração de histórico executada direto do Supabase. EntryId: ${entryId}`,
      screen: 'Administração',
      groupId: this.getContext().groupId,
    });

    window.dispatchEvent(new Event('data-updated'));

    return {
      success: true,
      message: 'Versão histórica restaurada com sucesso.',
    };
  } catch (error: any) {
    console.error('Erro ao restaurar histórico:', error);

    return {
      success: false,
      message: error?.message || 'Erro ao restaurar histórico.',
    };
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

    this.persist({
  allowScheduleDeletion: true,
  allowEventDeletion: true
});

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
    const remainingTechIds = new Set(
  this.technicians
    .filter(t => t.groupId === ctx.groupId)
    .map(t => String(t.id))
);

this.schedules = this.schedules.filter(s => {
  if (s.groupId !== ctx.groupId) return true;
  if (s.status === ScheduleStatus.CANCELLED) return false;

  const slot = String(s.availabilitySlotId || '').toLowerCase();

  if (
    slot === 'auto' ||
    slot === 'manual' ||
    slot === 'base-fixed'
  ) {
    return remainingTechIds.has(String(s.technicianId));
  }

  return true;
});

    this.persist({ allowScheduleDeletion: true });

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
    this.persist({ allowScheduleDeletion: true });

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
  public deleteRoutingRule(ruleId: string) {
  const ctx = this.getContext();

  this.routingRules = this.routingRules.filter(
    r => !(r.id === ruleId && r.groupId === ctx.groupId)
  );

  this.persist();
  window.dispatchEvent(new Event('data-updated'));
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
  processAutoApprovals() {
  const ctx = this.getContext();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let changed = false;

  const pastConfirmedSchedules = this.schedules.filter(s => {
    if (s.groupId !== ctx.groupId) return false;
    if (s.status !== ScheduleStatus.CONFIRMED) return false;
    if (!s.technicianId || !s.datetime) return false;

    const scheduleDate = new Date(s.datetime);
    scheduleDate.setHours(0, 0, 0, 0);

    return scheduleDate < today;
  });

  const pastScheduleByTechId = new Map<string, CertificationSchedule>();

  pastConfirmedSchedules.forEach(s => {
    pastScheduleByTechId.set(String(s.technicianId), s);
  });

  this.technicians = this.technicians.map(tech => {
    if (tech.groupId !== ctx.groupId) return tech;

    const schedule = pastScheduleByTechId.get(String(tech.id));
    if (!schedule) return tech;

    schedule.status = ScheduleStatus.COMPLETED;

    changed = true;

    return {
      ...tech,
      status_principal: 'APROVADOS',
      certificationProcessStatus: CertificationProcessStatus.CERTIFIED_APPROVED,
      scheduledCertificationId: schedule.id,
      status_updated_at: new Date().toISOString(),
      status_updated_by: 'SISTEMA - LIMPEZA INICIAL'
    };
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
}): { base: IntegrationBase | null; rule: RoutingRule | null; hasCityCoverage: boolean } {
  const cleanCity = (value?: string) => {
  const cityOnly = (value || '')
    .split('/')[0]
    .replace(/\s+/g, ' ')
    .trim();

  return this.safeNormalize(cityOnly);
};

  const cityNorm = cleanCity(params.city);
  const ufNorm = this.safeNormalize(
  params.uf || ((params.city || '').includes('/') ? (params.city || '').split('/')[1] : '')
);
  const companyNorm = this.safeNormalize(params.company || '');

  const isAnyCompany = (company?: string) => {
    const c = this.safeNormalize(company || '');
    return (
      !c ||
      c === 'QUALQUER EMPRESA' ||
      c === 'QUALQUER_EMPRESA' ||
      c === 'TODAS' ||
      c === 'TODAS EMPRESAS'
    );
  };

  const ruleMatchesCompany = (rule: RoutingRule) => {
    const ruleCompany = this.safeNormalize(rule.company || '');
    return isAnyCompany(rule.company) || ruleCompany === companyNorm;
  };

  const cityRules = this.routingRules
    .filter(r => r.active)
    .filter(r => {
      const base = this.integrationBases.find(
  b =>
    this.safeNormalize(b.id) === this.safeNormalize(r.baseId) &&
    b.active
);
      return !!base;
    })
    .filter(r => {
      const coveredCities = (r.coveredCities && r.coveredCities.length > 0
        ? r.coveredCities
        : [r.city]
      ).map(c => cleanCity(c));

      const coveredUfs = (
  r.coveredUfs && r.coveredUfs.length > 0
    ? r.coveredUfs
    : [r.uf]
).map((uf, idx) => {
  if (uf) {
    return this.safeNormalize(uf);
  }

  const rawCity =
    (r.coveredCities && r.coveredCities[idx]) ||
    r.city ||
    '';

  if (rawCity.includes('/')) {
    return this.safeNormalize(rawCity.split('/')[1]);
  }

  return '';
});

      return coveredCities.some((city, index) => {
        const ruleUf = coveredUfs[index] || this.safeNormalize(r.uf || '');
        return city === cityNorm && ruleUf === ufNorm;
      });
    })
    .sort((a, b) => (a.priority || 999) - (b.priority || 999));

  const hasCityCoverage = cityRules.length > 0;

  const analystMatches = (rule: RoutingRule) => {
  if (!params.analystId) return true;
  return !rule.analystId || rule.analystId === params.analystId;
};

const match =
  cityRules.find(r =>
    analystMatches(r) &&
    ruleMatchesCompany(r)
  ) ||
  cityRules.find(r =>
    analystMatches(r) &&
    isAnyCompany(r.company)
  ) ||
  null;

  if (!match) {
    return {
      base: null,
      rule: null,
      hasCityCoverage
    };
  }

  const base =
  this.integrationBases.find(
    b =>
      this.safeNormalize(b.id) === this.safeNormalize(match.baseId) &&
      b.active
  ) || null;

  return {
    base,
    rule: match,
    hasCityCoverage
  };
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

  private splitPresentialLotBySmartCapacity(total: number): number[] {
  if (total <= 0) return [];

  const capacityPerDay = 6;
  const result: number[] = [];

  let remaining = total;

  while (remaining > 0) {
    const dayLoad = Math.min(capacityPerDay, remaining);
    result.push(dayLoad);
    remaining -= dayLoad;
  }

  return result;
}

  public runSmartSchedulingReinforced(
  startDateIso: string,
  options?: {
    classId?: string;
    onlyQueue?: boolean;
  }
): SchedulingSummary {
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
    schedulingStartOffsetDays: 0,
    schedulingWindowDays: 10,
    active: true
  };
  this.groupRules.push(groupRule);
}

const startOffsetDays = Math.max(
  0,
  Number(groupRule.schedulingStartOffsetDays ?? 0)
);

const maxWindowDays = Math.max(
  startOffsetDays,
  Number(groupRule.schedulingWindowDays ?? 10)
);

const windowDaysCount = maxWindowDays - startOffsetDays + 1;

const today = new Date();
today.setHours(0, 0, 0, 0);

const startReq = new Date(startDateIso + 'T00:00:00');
const baseStart = startReq < today ? today.toISOString().split('T')[0] : startDateIso;

const offsetBusinessDays = this.getBusinessDays(baseStart, startOffsetDays + 1);
const effectiveStart = offsetBusinessDays[offsetBusinessDays.length - 1] || baseStart;

const businessDays = this.getBusinessDays(effectiveStart, windowDaysCount);
const businessDaySet = new Set(businessDays);
    
    const onlyQueue = options?.onlyQueue === true;
const targetClassId = options?.classId;

let techniciansPool = this.technicians
  .filter(t => {
    if (t.groupId !== context.groupId) return false;

    if (targetClassId && t.trainingClassId !== targetClassId) {
      return false;
    }

    const statusPrincipal = this.safeNormalize(t.status_principal || '');
    const certStatus = String(t.certificationProcessStatus || '');

    const isQueue =
      statusPrincipal === 'BACKLOG AGUARDANDO' ||
      statusPrincipal === 'FILA' ||
      statusPrincipal === 'FILA CERTIFICACAO' ||
      statusPrincipal === 'FILA CERTIFICAÇÃO';

    if (onlyQueue) {
      return isQueue;
    }

    return (
      isQueue ||
      statusPrincipal === 'PENDENTE_TRATAMENTO' ||
      statusPrincipal === 'PENDENTE_CERTIFICACAO' ||
      statusPrincipal === 'PENDENTE_CERTIFICAÇÃO' ||
      statusPrincipal === 'PENDENTE' ||
      certStatus === CertificationProcessStatus.QUALIFIED_AWAITING
    );
  })
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

      // ============================================================
  // AGENDA COLETIVA POR BASE — PRÉ-PROCESSAMENTO SEGURO
  // Esta camada roda antes das regras normais.
  // Se não houver regra ativa, o fluxo atual segue igual.
  // ============================================================

  type FixedBaseDate = {
    id: string;
    date: string;
    capacity: number;
    active: boolean;
  };

  type FixedBaseRule = {
    id: string;
    baseId: string;
    baseName: string;
    city: string;
    uf: string;
    analystId: string;
    analystName: string;
    defaultCapacity: number;
    notes: string;
    active: boolean;
    dates: FixedBaseDate[];
    createdAt: string;
  };

  const readBaseFixedDateRules = (): FixedBaseRule[] => {
    try {
      const raw = localStorage.getItem('certitech_base_fixed_dates_v1');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const getCollectiveScheduleTime = (
    shift: Shift,
    positionInShift: number
  ) => {
    if (shift === Shift.MORNING) {
      if (positionInShift === 0) return '08:30:00';
      if (positionInShift === 1) return '10:00:00';
      return '11:00:00';
    }

    if (positionInShift === 0) return '13:30:00';
    if (positionInShift === 1) return '15:00:00';
    return '16:00:00';
  };

  const getActiveCollectiveRules = () => {
    return readBaseFixedDateRules()
      .filter(rule => rule.active)
      .map(rule => ({
        ...rule,
        dates: (rule.dates || [])
          .filter(date => date.active)
          .sort((a, b) => a.date.localeCompare(b.date))
      }))
      .filter(rule => rule.dates.length > 0);
  };

  const activeCollectiveRules = getActiveCollectiveRules();

  const collectiveHandledTechIds = new Set<string>();

  if (activeCollectiveRules.length > 0) {
    for (const tech of techniciansPool) {
      const routingMatch = this.resolveBaseForScheduling({
        city: tech.city,
        uf: tech.state,
        company: tech.company
      });

      const baseId = routingMatch.base?.id;

      if (!baseId) continue;

      const collectiveRule = activeCollectiveRules.find(
        rule =>
          String(rule.baseId) === String(baseId) &&
          rule.active
      );

      if (!collectiveRule) continue;

      const analyst = this.users.find(
        u =>
          String(u.id) === String(collectiveRule.analystId) &&
          u.active === true &&
          u.groupId === context.groupId
      );

      if (!analyst) {
        tech.status_principal = 'BACKLOG AGUARDANDO';
        tech.backlog_score_aplicado = true;
        tech.backlog_motivo =
          'AGENDA COLETIVA: ANALISTA RESPONSÁVEL INATIVO OU NÃO LOCALIZADO';

        summary.backlog += 1;
        addReason('AGENDA COLETIVA: ANALISTA RESPONSÁVEL INATIVO OU NÃO LOCALIZADO');
        collectiveHandledTechIds.add(tech.id);
        continue;
      }

      let scheduledByCollective = false;

      for (const fixedDate of collectiveRule.dates) {
        const dateIso = fixedDate.date;

        // Não agenda no passado.
        if (dateIso < effectiveStart) continue;

        const capacity = Number(fixedDate.capacity || collectiveRule.defaultCapacity || 6);

        const existingCollectiveSchedules = this.schedules.filter(
          s =>
            s.status !== ScheduleStatus.CANCELLED &&
            s.type === ExpertiseType.PRESENTIAL &&
            s.datetime.startsWith(dateIso) &&
            String(s.baseId || '') === String(collectiveRule.baseId)
        );

        if (existingCollectiveSchedules.length >= capacity) {
          continue;
        }

        const analystDaySchedules = this.schedules.filter(
          s =>
            s.status !== ScheduleStatus.CANCELLED &&
            s.analystId === collectiveRule.analystId &&
            s.datetime.startsWith(dateIso)
        );

        const hasVirtualOnDay = analystDaySchedules.some(
          s => s.type === ExpertiseType.VIRTUAL
        );

        if (hasVirtualOnDay) {
          continue;
        }

        const hasBlockingEvent = this.events.some(
          e =>
            e.involvedUserIds.includes(collectiveRule.analystId) &&
            e.startDatetime.startsWith(dateIso) &&
            (e as any).type !== 'CQ_SUPPORT'
        );

        if (hasBlockingEvent) {
          continue;
        }

        const usedInMorning = analystDaySchedules.filter(
          s => s.shift === Shift.MORNING
        ).length;

        const usedInAfternoon = analystDaySchedules.filter(
          s => s.shift === Shift.AFTERNOON
        ).length;

        const nextIndex = existingCollectiveSchedules.length;

        const shift =
          nextIndex < Math.ceil(capacity / 2)
            ? Shift.MORNING
            : Shift.AFTERNOON;

        const positionInShift =
          shift === Shift.MORNING ? usedInMorning : usedInAfternoon;

        const scheduleTime = getCollectiveScheduleTime(shift, positionInShift);

const theoreticalTime = getPresentialTheoryTimeByRegion({
  uf: tech.state,
  city: tech.city
});

const practicalTime = scheduleTime;

const newSch = {
  id: `sch-base-fixed-${Date.now()}-${Math.random()}`,
  groupId: tech.groupId,
  title: `CERTIFICAÇÃO DATA FIXA - ${tech.name}`,
  technicianId: tech.id,
  analystId: collectiveRule.analystId,
  trainingClassId: tech.trainingClassId,

  datetime: `${dateIso}T${practicalTime}`,

  theoreticalDatetime: `${dateIso}T${theoreticalTime}`,
  theoreticalTime,

  practicalDatetime: `${dateIso}T${practicalTime}`,
  practicalTime,

  type: ExpertiseType.PRESENTIAL,
  status: ScheduleStatus.CONFIRMED,
  availabilitySlotId: 'base-fixed',
  shift,
  technology: tech.technology || 'GPON',
  baseId: routingMatch.base?.id,
  baseName: routingMatch.base?.name || collectiveRule.baseName,
  baseAddress: routingMatch.base?.address,
  baseNotes: collectiveRule.notes || routingMatch.base?.notes,
  powerAppsBaseId: routingMatch.base?.powerAppsBaseId,
  routingRuleId: routingMatch.rule?.id
};
        
        this.schedules.push(newSch);

        tech.status_principal = 'AGENDADOS';
        tech.certificationProcessStatus = CertificationProcessStatus.SCHEDULED;
        tech.scheduledCertificationId = newSch.id;
        tech.status_updated_at = new Date().toISOString();
        tech.status_updated_by = 'SISTEMA - AGENDA COLETIVA';

        summary.scheduled += 1;
        addReason('AGENDA COLETIVA POR BASE');

        collectiveHandledTechIds.add(tech.id);
        scheduledByCollective = true;
        break;
      }

      if (!scheduledByCollective) {
        tech.status_principal = 'BACKLOG AGUARDANDO';
        tech.backlog_score_aplicado = true;
        tech.backlog_motivo =
          'AGENDA COLETIVA: DATA LOTADA, BLOQUEADA OU SEM VAGA DISPONÍVEL';

        summary.backlog += 1;
        addReason('AGENDA COLETIVA: DATA LOTADA/BLOQUEADA/SEM VAGA');

        collectiveHandledTechIds.add(tech.id);
      }
    }

    techniciansPool = techniciansPool.filter(
      tech => !collectiveHandledTechIds.has(tech.id)
    );
  }

  // ============================================================
  // FIM AGENDA COLETIVA POR BASE
  // Daqui para baixo o fluxo antigo continua igual.
  // ============================================================

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
  const city = this.safeNormalize((tech.city || '').split('/')[0].trim());
  const state = this.safeNormalize(tech.state || '');
  const classId = this.safeNormalize(tech.trainingClassId || 'SEM_TURMA');
  const company = this.safeNormalize(tech.company || '');

  if (targetType === ExpertiseType.PRESENTIAL) {
    const routingMatch = this.resolveBaseForScheduling({
      city: tech.city,
      uf: tech.state,
      company: tech.company
    });

    const baseKey = routingMatch.base?.id || 'SEM_BASE';
    const ruleKey = routingMatch.rule?.id || 'SEM_REGRA';
    const analystKey = routingMatch.rule?.analystId || 'SEM_ANALISTA';

    return `${targetType}__${baseKey}__${ruleKey}__${analystKey}__${company}__${city}__${state}__${classId}`;
  }

  const fusoGroup = getOperationalTimeGroup(
  tech.state,
  tech.city,
  ExpertiseType.VIRTUAL
);

    if (targetType === ExpertiseType.VIRTUAL && fusoGroup === 'AC') {
  return `${targetType}__${fusoGroup}__${city}__${state}__${classId}`;
}

return `${targetType}__${fusoGroup}__${company}__${city}__${state}__${classId}`;

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
      (e as any).type !== 'CQ_SUPPORT' && // 🔥 IGNORA CQ
      (e.shift === Shift.FULL_DAY || e.shift === shift)
  );
};


const isScheduleCompatibleWithTechFuso = (
  schedule: CertificationSchedule,
  incomingTech: Technician,
  targetType: ExpertiseType
): boolean => {
  // Segurança principal: nunca comparar/agrupar schedules de tipo diferente
  if (schedule.type !== targetType) {
    return false;
  }

  const scheduledTech = this.technicians.find(
    t => t.id === schedule.technicianId
  );

  const scheduledGroup = getOperationalTimeGroup(
    scheduledTech?.state,
    scheduledTech?.city,
    targetType
  );

  const incomingGroup = getOperationalTimeGroup(
    incomingTech.state,
    incomingTech.city,
    targetType
  );

  // PRESENCIAL: não separa por fuso no turno.
  // Todos do mesmo analista/dia/turno fazem teórica juntos.
  if (targetType === ExpertiseType.PRESENTIAL) {
    return true;
  }

  // VIRTUAL: AC pode coexistir com DEFAULT, mas nunca com FUSO_1.
  if (incomingGroup === 'AC') {
    return scheduledGroup === 'DEFAULT';
  }

  if (scheduledGroup === 'AC') {
    return incomingGroup === 'DEFAULT';
  }

  // VIRTUAL: FUSO_1 não mistura com DEFAULT nem AC.
  return !hasFusoMinusOneConflict(scheduledGroup, incomingGroup);
};
    
  const getAvailableSlotsForAnalystOnDate = (
  analystId: string,
  dateIso: string,
  targetType: ExpertiseType,
  limitPerShiftToUse: number,
  baseIdToUse?: string,
  incomingTech?: Technician
) => {
  const daySchedules = getDaySchedulesForAnalyst(analystId, dateIso);
  if (targetType === ExpertiseType.PRESENTIAL && baseIdToUse) {
  const sameBaseOtherAnalystOnDay = this.schedules.some(
    s =>
      s.groupId === context.groupId &&
      s.status !== ScheduleStatus.CANCELLED &&
      s.type === ExpertiseType.PRESENTIAL &&
      s.datetime.startsWith(dateIso) &&
      String(s.baseId || '') === String(baseIdToUse) &&
      String(s.analystId) !== String(analystId)
  );

  if (sameBaseOtherAnalystOnDay) {
    return 0;
  }
}

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

  const cqSupportEvents = this.events.filter(
    e =>
      e.involvedUserIds.includes(analystId) &&
      e.startDatetime.startsWith(dateIso) &&
      (e as any).type === 'CQ_SUPPORT' &&
      ((e as any).active ?? true) &&
      (e.shift === Shift.FULL_DAY || e.shift === shift)
  );

  let cqExtraSlots = 0;

  cqSupportEvents.forEach(event => {
    const extra = (event as any).capacityExtra || 6;
    cqExtraSlots += extra / 2;
  });

  // REGRA: evento/treinamento bloqueia o turno inteiro.
  // Só libera vagas extras se for APOIO CQ.
  if (blocked && cqExtraSlots <= 0) {
    continue;
  }

  const shiftSchedules = daySchedules.filter(s => s.shift === shift);

  if (targetType === ExpertiseType.PRESENTIAL && baseIdToUse) {
    const hasDifferentBaseOnShift = shiftSchedules.some(
      s => s.type === ExpertiseType.PRESENTIAL && s.baseId && s.baseId !== baseIdToUse
    );

    if (hasDifferentBaseOnShift) continue;
  }

  const physicalShiftLimit =
  targetType === ExpertiseType.VIRTUAL
    ? 2
    : 3;

const shiftLimitWithCq = blocked
  ? 0
  : physicalShiftLimit;

  if (incomingTech && targetType === ExpertiseType.VIRTUAL) {
    const incomingGroup = getOperationalTimeGroup(
      incomingTech.state,
      incomingTech.city,
      targetType
    );

    const incompatible = shiftSchedules.some(s =>
      !isScheduleCompatibleWithTechFuso(s, incomingTech, targetType)
    );

    // AC pode usar o segundo horário do período junto com fuso 0.
    if (incomingGroup === 'AC') {
      const compatibleCount = shiftSchedules.filter(s =>
        isScheduleCompatibleWithTechFuso(s, incomingTech, targetType)
      ).length;

      totalFreeSlots += Math.max(0, 1 + cqExtraSlots - compatibleCount);
      continue;
    }

    // Fuso -1 não mistura com fuso 0/RS no mesmo período.
    if (incompatible) {
      continue;
    }

    const compatibleCount = shiftSchedules.filter(s =>
      isScheduleCompatibleWithTechFuso(s, incomingTech, targetType)
    ).length;

    totalFreeSlots += Math.max(0, shiftLimitWithCq - compatibleCount);
    continue;
  }

  const shiftCount = shiftSchedules.length;
  const freeSlots = Math.max(0, shiftLimitWithCq - shiftCount);

  totalFreeSlots += freeSlots;
}

return totalFreeSlots;
  };
  

const simulateLotCapacityForAnalyst = (
  analyst: User,
  targetType: ExpertiseType,
  businessDaysToUse: string[],
  limitPerShiftToUse: number,
  lotSize: number,
  baseIdToUse?: string
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
      if (capacity > 0 && plannedDates.length > 0) {
  const lastDate = plannedDates[plannedDates.length - 1];

  const diffDays =
    (new Date(dateIso + 'T00:00:00').getTime() -
      new Date(lastDate + 'T00:00:00').getTime()) /
    (1000 * 60 * 60 * 24);

  if (diffDays > 1) {
    brokeContinuity = true;
    break;
  }
}

      const freeSlots = getAvailableSlotsForAnalystOnDate(
        analyst.id,
        dateIso,
        targetType,
        limitPerShiftToUse,
        baseIdToUse
      );

      if (capacity === 0) {
        if (freeSlots <= 0) continue;

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

      if (freeSlots <= 0) {
  // 🔥 NOVO: só quebra continuidade se NÃO houver CQ
  const hasCqSupport = this.events.some(
    e =>
      e.involvedUserIds.includes(analyst.id) &&
      e.startDatetime.startsWith(dateIso) &&
      (e as any).type === 'CQ_SUPPORT' &&
      ((e as any).active ?? true)
  );

  if (!hasCqSupport) {
    brokeContinuity = true;
    break;
  }

  continue;
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
  lotSize: number,
  incomingTech?: Technician
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
      limitPerShiftToUse,
      undefined,
      incomingTech
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

  
const requiresPresential = routingMatch.hasCityCoverage;
const targetType = requiresPresential ? ExpertiseType.PRESENTIAL : ExpertiseType.VIRTUAL;
const lotKey = getLotKey(tech, targetType);

  if (!lotsMap.has(lotKey)) {
    lotsMap.set(lotKey, []);
  }

  lotsMap.get(lotKey)!.push(tech);
}

const lots = Array.from(lotsMap.entries())
  .map(([lotKey, techs]) => ({
    lotKey,
    techs
  }))
  .sort((a, b) => {
    const aIsPresential = a.lotKey.startsWith(`${ExpertiseType.PRESENTIAL}__`);
    const bIsPresential = b.lotKey.startsWith(`${ExpertiseType.PRESENTIAL}__`);

    if (aIsPresential !== bIsPresential) {
      return aIsPresential ? -1 : 1;
    }

    return b.techs.length - a.techs.length;
  });

    
   for (const lot of lots) {
  const lotTechs = lot.techs;
  const tech = lotTechs[0];

  const routingMatch = this.resolveBaseForScheduling({
    city: tech.city,
    uf: tech.state,
    company: tech.company
  });

  const requiresPresential = routingMatch.hasCityCoverage;
  const targetType = requiresPresential ? ExpertiseType.PRESENTIAL : ExpertiseType.VIRTUAL;

  if (requiresPresential && !routingMatch.base) {
    for (const lotTech of lotTechs) {
      lotTech.status_principal = "BACKLOG AGUARDANDO";
      lotTech.backlog_score_aplicado = true;
      lotTech.backlog_motivo = "CIDADE PRESENCIAL COM BASE ATIVA, MAS SEM REGRA PARA EMPRESA/ANALISTA";
    }

    addReason("CIDADE PRESENCIAL SEM REGRA PARA EMPRESA/ANALISTA");
    summary.backlog += lotTechs.length;
    continue;
  }

    const limitPerShift =
      targetType === ExpertiseType.VIRTUAL
        ? (groupRule.virtualPerShift || 2)
        : (groupRule.presencialPerShift || 3);

    let allowedAnalysts = requiresPresential
  ? analystsPool.filter(a => {
      const analystRoute = this.resolveBaseForScheduling({
        city: tech.city,
        uf: tech.state,
        analystId: a.id,
        company: tech.company
      });

      return !!analystRoute.base && !!analystRoute.rule;
    })
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

const lotRoutingMatch = this.resolveBaseForScheduling({
  city: tech.city,
  uf: tech.state,
  company: tech.company
});

  const canUsePresentialShift = (
  analystId: string,
  dateIso: string,
  shift: Shift,
  tempSchedules: CertificationSchedule[]
) => {
  const allSchedulesMap = new Map<string, CertificationSchedule>();

[...this.schedules, ...tempSchedules].forEach(s => {
  if (
    s.groupId === context.groupId &&
    s.analystId === analystId &&
    s.datetime.startsWith(dateIso) &&
    s.status !== ScheduleStatus.CANCELLED
  ) {
    allSchedulesMap.set(String(s.id), s);
  }
});

const allSchedules = Array.from(allSchedulesMap.values());

  const hasVirtual = allSchedules.some(s => s.type === ExpertiseType.VIRTUAL);

  if (hasVirtual) {
    return false;
  }

  const isBlocked = this.events.some(
    e =>
      e.involvedUserIds.includes(analystId) &&
      e.startDatetime.startsWith(dateIso) &&
      (e as any).type !== 'CQ_SUPPORT' &&
      (e.shift === Shift.FULL_DAY || e.shift === shift)
  );

  if (isBlocked) {
    return false;
  }

  const presentialSchedules = allSchedules.filter(
    s => s.type === ExpertiseType.PRESENTIAL
  );

  const presentialInDay = presentialSchedules.length;

  if (presentialInDay >= 6) {
    return false;
  }

  const presentialInShift = presentialSchedules.filter(
    s => s.shift === shift
  ).length;

  if (presentialInShift >= 3) {
    return false;
  }

  return true;
};
  
const simulations = allowedAnalysts.map((analyst, index) => ({
  analyst,
  orderIndex: index,
  result: simulateLotCapacityForAnalyst(
  analyst,
  targetType,
  businessDays,
  limitPerShift,
  lotSize,
  lotRoutingMatch.base?.id
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

const dailyTargets =
  targetType === ExpertiseType.PRESENTIAL
    ? this.splitPresentialLotBySmartCapacity(lotTechs.length)
    : [];

const isConsecutiveBusinessSequence = (dates: string[]) => {
  const businessIndex = new Map(
    businessDays.map((day, index) => [day, index])
  );

  for (let i = 1; i < dates.length; i++) {
    const prevIndex = businessIndex.get(dates[i - 1]);
    const currIndex = businessIndex.get(dates[i]);

    if (
      prevIndex === undefined ||
      currIndex === undefined ||
      currIndex !== prevIndex + 1
    ) {
      return false;
    }
  }

  return true;
};

if (
  targetType === ExpertiseType.PRESENTIAL &&
  plannedDatesToUse.length > 1 &&
  !isConsecutiveBusinessSequence(plannedDatesToUse)
) {
  for (const lotTech of lotTechs) {
    lotTech.status_principal = "BACKLOG AGUARDANDO";
    lotTech.backlog_score_aplicado = true;
    lotTech.backlog_motivo = "LOTE PRESENCIAL QUEBRARIA CONTINUIDADE REAL ENTRE DIAS";
  }

  addReason("LOTE PRESENCIAL QUEBRARIA CONTINUIDADE REAL ENTRE DIAS");
  summary.backlog += lotTechs.length;
  continue;
}

for (let dateIndex = 0; dateIndex < plannedDatesToUse.length; dateIndex++) {
  const dateIso = plannedDatesToUse[dateIndex];

  const dayTarget =
    targetType === ExpertiseType.PRESENTIAL
      ? (dailyTargets[dateIndex] || 6)
      : Number.POSITIVE_INFINITY;

  const dayStartCount = scheduledEntries.length;

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
    const alreadyScheduledToday = scheduledEntries.length - dayStartCount;

    if (
      targetType === ExpertiseType.PRESENTIAL &&
      alreadyScheduledToday >= dayTarget
    ) {
      break;
    }

    const isBlocked = this.events.some(
      e =>
        e.involvedUserIds.includes(lotOwner.id) &&
        e.startDatetime.startsWith(dateIso) &&
        (e as any).type !== 'CQ_SUPPORT' &&
        (e.shift === Shift.FULL_DAY || e.shift === shift)
    );

    const cqSupportEvents = this.events.filter(
      e =>
        e.involvedUserIds.includes(lotOwner.id) &&
        e.startDatetime.startsWith(dateIso) &&
        (e as any).type === 'CQ_SUPPORT' &&
        ((e as any).active ?? true) &&
        (e.shift === Shift.FULL_DAY || e.shift === shift)
    );

    let cqExtraSlots = 0;

    cqSupportEvents.forEach(event => {
      const extra = (event as any).capacityExtra || 6;
      cqExtraSlots += extra / 2;
    });

    if (isBlocked && cqExtraSlots <= 0) continue;

    const physicalShiftLimit =
  targetType === ExpertiseType.VIRTUAL
    ? 2
    : 3;

const shiftLimitWithCq = isBlocked
  ? 0
  : physicalShiftLimit;

    let shiftSchedules = this.schedules.filter(
      s =>
        s.analystId === lotOwner.id &&
        s.datetime.startsWith(dateIso) &&
        s.shift === shift &&
        s.status !== ScheduleStatus.CANCELLED
    );

    const lotBaseId = lotRoutingMatch.base?.id;

    const hasDifferentBaseOnShift = shiftSchedules.some(
      s =>
        s.type === ExpertiseType.PRESENTIAL &&
        s.baseId &&
        lotBaseId &&
        s.baseId !== lotBaseId
    );

    if (targetType === ExpertiseType.PRESENTIAL && hasDifferentBaseOnShift) {
      continue;
    }

    while (
      shiftSchedules.length < shiftLimitWithCq &&
      scheduledEntries.length < lotTechs.length
    ) {

      if (
  targetType === ExpertiseType.PRESENTIAL &&
  !canUsePresentialShift(
    lotOwner.id,
    dateIso,
    shift,
    scheduledEntries.map(x => x.schedule)
  )
) {
  break;
}
      const alreadyScheduledTodayLoop = scheduledEntries.length - dayStartCount;

      if (
        targetType === ExpertiseType.PRESENTIAL &&
        alreadyScheduledTodayLoop >= dayTarget
      ) {
        break;
      }

      const nextTech = lotTechs[scheduledEntries.length];

      if (!nextTech) {
        break;
      }

      const hasIncompatibleFusoOnShift = shiftSchedules.some(s =>
        !isScheduleCompatibleWithTechFuso(s, nextTech, targetType)
      );

      if (hasIncompatibleFusoOnShift) {
        break;
      }

      const scheduleTime = this.getManualScheduleTime(
        lotOwner.id,
        dateIso,
        shift,
        targetType,
        nextTech
      );

      if (!scheduleTime) {
        break;
      }

      const theoreticalTime =
  targetType === ExpertiseType.PRESENTIAL
    ? getPresentialTheoryTimeByRegion({
  uf: nextTech.state,
  city: nextTech.city
})
      
          : getOperationalStartTime({
              uf: nextTech.state,
              city: nextTech.city,
              type: targetType,
              shift
            });

      const resolvedBase = this.resolveBaseForScheduling({
        city: nextTech.city,
        uf: nextTech.state,
        analystId: lotOwner.id,
        company: nextTech.company
      });

      const newSch = {
        id: `sch-auto-${Date.now()}-${Math.random()}`,
        groupId: nextTech.groupId,
        title: `CERTIFICAÇÃO AUTOMÁTICA - ${nextTech.name}`,
        technicianId: nextTech.id,
        analystId: lotOwner.id,
        trainingClassId: nextTech.trainingClassId,
        datetime: `${dateIso}T${scheduleTime}`,
        theoreticalDatetime: `${dateIso}T${theoreticalTime}`,
        theoreticalTime,
        practicalDatetime: `${dateIso}T${scheduleTime}`,
        practicalTime: scheduleTime,
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


  const getVirtualShiftSchedules = (
    analystId: string,
    dateIso: string,
    shift: Shift,
    tempSchedules: CertificationSchedule[]
  ) => {
    return [...this.schedules, ...tempSchedules].filter(
      s =>
        s.groupId === context.groupId &&
        s.analystId === analystId &&
        s.datetime.startsWith(dateIso) &&
        s.shift === shift &&
        s.type === ExpertiseType.VIRTUAL &&
        s.status !== ScheduleStatus.CANCELLED
    );
  };

  const hasPresentialOnDay = (
    analystId: string,
    dateIso: string,
    tempSchedules: CertificationSchedule[]
  ) => {
    return [...this.schedules, ...tempSchedules].some(
      s =>
        s.groupId === context.groupId &&
        s.analystId === analystId &&
        s.datetime.startsWith(dateIso) &&
        s.type === ExpertiseType.PRESENTIAL &&
        s.status !== ScheduleStatus.CANCELLED
    );
  };

  const isVirtualShiftBlocked = (
  analystId: string,
  dateIso: string,
  shift: Shift
) => {
  return this.events.some(
    e =>
      e.involvedUserIds.includes(analystId) &&
      e.startDatetime.startsWith(dateIso) &&
      (e as any).type !== 'CQ_SUPPORT' &&
      (e.shift === Shift.FULL_DAY || e.shift === shift)
  );
};

const getScheduleTech = (schedule: CertificationSchedule) =>
  (this.technicians || []).find(
    t => String(t.id) === String(schedule.technicianId)
  );

const getScheduleOperationalGroup = (
  schedule: CertificationSchedule
): OperationalTimeGroup => {
  const scheduledTech = getScheduleTech(schedule);

  return getOperationalTimeGroup(
    scheduledTech?.state || '',
    scheduledTech?.city || '',
    ExpertiseType.VIRTUAL
  );
};

const getOperationalDayContext = (
  analystId: string,
  dateIso: string,
  tempSchedules: CertificationSchedule[] = []
) => {
  const allSchedules = [...this.schedules, ...tempSchedules].filter(
    s =>
      s.groupId === context.groupId &&
      s.analystId === analystId &&
      s.datetime.startsWith(dateIso) &&
      s.status !== ScheduleStatus.CANCELLED
  );

  const virtualSchedules = allSchedules.filter(
    s => s.type === ExpertiseType.VIRTUAL
  );

  const presentialSchedules = allSchedules.filter(
    s => s.type === ExpertiseType.PRESENTIAL
  );

  const virtualMorning = virtualSchedules.filter(
    s => s.shift === Shift.MORNING
  ).length;

  const virtualAfternoon = virtualSchedules.filter(
    s => s.shift === Shift.AFTERNOON
  ).length;

  const presentialMorning = presentialSchedules.filter(
    s => s.shift === Shift.MORNING
  ).length;

  const presentialAfternoon = presentialSchedules.filter(
    s => s.shift === Shift.AFTERNOON
  ).length;

  const virtualGroups = virtualSchedules.map(s =>
    getScheduleOperationalGroup(s)
  );

  return {
    hasVirtual: virtualSchedules.length > 0,
    hasPresential: presentialSchedules.length > 0,

    virtualMorning,
    virtualAfternoon,

    presentialMorning,
    presentialAfternoon,

    virtualGroups,

    blockedMorning: isVirtualShiftBlocked(
      analystId,
      dateIso,
      Shift.MORNING
    ),

    blockedAfternoon: isVirtualShiftBlocked(
      analystId,
      dateIso,
      Shift.AFTERNOON
    )
  };
};

  const canUseVirtualShift = (
  analystId: string,
  dateIso: string,
  shift: Shift,
  candidateTech: Technician,
  tempSchedules: CertificationSchedule[]
) => {
  const ctxDay = getOperationalDayContext(
    analystId,
    dateIso,
    tempSchedules
  );

  // PRESENCIAL É PRIORIDADE: se já tem presencial no dia, não entra virtual
  if (ctxDay.hasPresential) return false;

  if (shift === Shift.MORNING && ctxDay.blockedMorning) return false;
  if (shift === Shift.AFTERNOON && ctxDay.blockedAfternoon) return false;

  if (ctxDay.virtualMorning + ctxDay.virtualAfternoon >= 4) return false;
  if (shift === Shift.MORNING && ctxDay.virtualMorning >= 2) return false;
  if (shift === Shift.AFTERNOON && ctxDay.virtualAfternoon >= 2) return false;

  const incomingGroup = getOperationalTimeGroup(
    candidateTech.state,
    candidateTech.city,
    ExpertiseType.VIRTUAL
  );

  const existingDayGroups = Array.from(new Set(ctxDay.virtualGroups));

  // REGRA FORTE: não mistura fuso no mesmo analista/dia
  if (existingDayGroups.length > 0) {
    return existingDayGroups.every(g => g === incomingGroup);
  }

  return true;
};

  const getVirtualPracticalTime = (
    analystId: string,
    dateIso: string,
    shift: Shift,
    candidateTech: Technician,
    tempSchedules: CertificationSchedule[]
  ) => {
    const incomingGroup = getOperationalTimeGroup(
      candidateTech.state,
      candidateTech.city,
      ExpertiseType.VIRTUAL
    );

    if (incomingGroup === 'AC') {
  return shift === Shift.MORNING ? '11:30:00' : '16:30:00';
}

    const theoreticalStart = getOperationalStartTime({
      uf: candidateTech.state,
      city: candidateTech.city,
      type: ExpertiseType.VIRTUAL,
      shift
    });

    const shiftSchedules = getVirtualShiftSchedules(
      analystId,
      dateIso,
      shift,
      tempSchedules
    );

    const nonAcSchedules = shiftSchedules.filter(s => {
      const group = getScheduleOperationalGroup(s);
      return group !== 'AC';
    });

    const position = nonAcSchedules.length + 1;

    const firstPractice = addMinutesToTime(theoreticalStart, 60);

    if (position === 1) return firstPractice;
    return addMinutesToTime(firstPractice, 60);
  };

  let finalSchedules: CertificationSchedule[] = [];

const getUfRegion = (uf?: string) => {
  const state = this.safeNormalize(uf || '');

  if (['PR', 'SC', 'RS'].includes(state)) return 'SUL';
  if (['MT', 'MS', 'GO', 'DF'].includes(state)) return 'CENTRO_OESTE';
  if (['AC', 'AM', 'RO', 'RR', 'PA', 'AP', 'TO'].includes(state)) return 'NORTE';

  return 'OUTROS';
};

const getVirtualAnalystRegionScore = (
  analyst: User,
  candidateTech: Technician
) => {
  const techCity = this.safeNormalize(candidateTech.city || '');
  const techUf = this.safeNormalize(candidateTech.state || '');
  const techRegion = getUfRegion(techUf);

  const analystProfileId = analyst.analystProfileId || analyst.id;

  const assignedCities = this.cities.filter(c =>
    (c.responsibleAnalystIds || []).includes(analystProfileId)
  );

  const hasSameCity = assignedCities.some(c =>
    this.safeNormalize(c.name) === techCity &&
    this.safeNormalize(c.uf) === techUf
  );

  if (hasSameCity) return 0;

  const hasSameUf = assignedCities.some(c =>
    this.safeNormalize(c.uf) === techUf
  );

  if (hasSameUf) return 1;

  const hasSameRegion = assignedCities.some(c =>
    getUfRegion(c.uf) === techRegion
  );

  if (hasSameRegion) return 2;

  return 3;
};

const getVirtualAnalystsToTry = (
  candidateTech: Technician,
  dateIso: string,
  tempSchedules: CertificationSchedule[]
) => {
  const incomingGroup = getOperationalTimeGroup(
    candidateTech.state,
    candidateTech.city,
    ExpertiseType.VIRTUAL
  );

  return [...allowedAnalysts].sort((a, b) => {
    const ctxA = getOperationalDayContext(a.id, dateIso, tempSchedules);
    const ctxB = getOperationalDayContext(b.id, dateIso, tempSchedules);

    const schedulesA = [...this.schedules, ...tempSchedules].filter(
      s =>
        s.groupId === context.groupId &&
        s.analystId === a.id &&
        s.datetime.startsWith(dateIso) &&
        s.status !== ScheduleStatus.CANCELLED
    );

    const schedulesB = [...this.schedules, ...tempSchedules].filter(
      s =>
        s.groupId === context.groupId &&
        s.analystId === b.id &&
        s.datetime.startsWith(dateIso) &&
        s.status !== ScheduleStatus.CANCELLED
    );

    const sameCompanyCityA = schedulesA.some(s => {
      const scheduledTech = getScheduleTech(s);

      return (
        s.type === ExpertiseType.VIRTUAL &&
        this.safeNormalize(scheduledTech?.company || '') === this.safeNormalize(candidateTech.company || '') &&
        this.safeNormalize(scheduledTech?.city || '') === this.safeNormalize(candidateTech.city || '') &&
        this.safeNormalize(scheduledTech?.state || '') === this.safeNormalize(candidateTech.state || '')
      );
    });

    const sameCompanyCityB = schedulesB.some(s => {
      const scheduledTech = getScheduleTech(s);

      return (
        s.type === ExpertiseType.VIRTUAL &&
        this.safeNormalize(scheduledTech?.company || '') === this.safeNormalize(candidateTech.company || '') &&
        this.safeNormalize(scheduledTech?.city || '') === this.safeNormalize(candidateTech.city || '') &&
        this.safeNormalize(scheduledTech?.state || '') === this.safeNormalize(candidateTech.state || '')
      );
    });

    // 1) Maior prioridade: manter empresa + cidade + UF juntas
    if (sameCompanyCityA !== sameCompanyCityB) {
      return sameCompanyCityA ? -1 : 1;
    }

    const sameFusoA =
      ctxA.virtualGroups.length > 0 &&
      ctxA.virtualGroups.every(g => g === incomingGroup);

    const sameFusoB =
      ctxB.virtualGroups.length > 0 &&
      ctxB.virtualGroups.every(g => g === incomingGroup);

    // 2) Depois mantém o mesmo fuso no analista/dia
    if (sameFusoA !== sameFusoB) {
      return sameFusoA ? -1 : 1;
    }

    const regionA = getVirtualAnalystRegionScore(a, candidateTech);
    const regionB = getVirtualAnalystRegionScore(b, candidateTech);

    // 3) Prioriza analista com cidade/UF/região compatível
    if (regionA !== regionB) {
      return regionA - regionB;
    }

    const dayCountA = ctxA.virtualMorning + ctxA.virtualAfternoon;
    const dayCountB = ctxB.virtualMorning + ctxB.virtualAfternoon;

    // 4) Compacta: completa o analista antes de abrir outro
    if (dayCountA !== dayCountB) {
      return dayCountB - dayCountA;
    }

    const metricsA = this.getAnalystDemandMetrics(a.id);
    const metricsB = this.getAnalystDemandMetrics(b.id);

    if (metricsA.demandIndex !== metricsB.demandIndex) {
      return metricsA.demandIndex - metricsB.demandIndex;
    }

    return this.safeNormalize(a.fullName || '').localeCompare(
      this.safeNormalize(b.fullName || '')
    );
  });
};

let allScheduled = true;

const sortedLotTechs = [...lotTechs].sort((a, b) => {
  const companyCityCount = (tech: Technician) => {
    return lotTechs.filter(
      t =>
        this.safeNormalize(t.company) === this.safeNormalize(tech.company) &&
        this.safeNormalize(t.city) === this.safeNormalize(tech.city)
    ).length;
  };

  const countA = companyCityCount(a);
  const countB = companyCityCount(b);

  // PRIORIDADE:
  // grupos maiores primeiro
  if (countA !== countB) {
    return countB - countA;
  }

  // depois ordena nome
  return this.safeNormalize(a.name).localeCompare(
    this.safeNormalize(b.name)
  );
});

for (const nextTech of sortedLotTechs) {
  let scheduledThisTech = false;

  const incomingGroup = getOperationalTimeGroup(
    nextTech.state,
    nextTech.city,
    ExpertiseType.VIRTUAL
  );

  for (const dateIso of businessDays) {
    if (scheduledThisTech) break;

    const analystsToTry = getVirtualAnalystsToTry(
      nextTech,
      dateIso,
      finalSchedules
    );

    for (const analyst of analystsToTry) {
      if (scheduledThisTech) break;

      const ctxDay = getOperationalDayContext(
        analyst.id,
        dateIso,
        finalSchedules
      );

      let shiftsToTry: Shift[];

      // FUSO -1 pequeno: tenta tarde primeiro
      if (
        incomingGroup === 'FUSO_1' &&
        sortedLotTechs.filter(t =>
          this.safeNormalize(t.company || '') === this.safeNormalize(nextTech.company || '') &&
          this.safeNormalize(t.city || '') === this.safeNormalize(nextTech.city || '') &&
          this.safeNormalize(t.state || '') === this.safeNormalize(nextTech.state || '')
        ).length <= 2
      ) {
        shiftsToTry = [Shift.AFTERNOON, Shift.MORNING];
      } else if (ctxDay.virtualMorning >= 2 && ctxDay.virtualAfternoon < 2) {
        shiftsToTry = [Shift.AFTERNOON, Shift.MORNING];
      } else {
        shiftsToTry = [Shift.MORNING, Shift.AFTERNOON];
      }

      for (const shift of shiftsToTry) {
        if (
          !canUseVirtualShift(
            analyst.id,
            dateIso,
            shift,
            nextTech,
            finalSchedules
          )
        ) {
          continue;
        }

        const theoreticalTime = getOperationalStartTime({
          uf: nextTech.state,
          city: nextTech.city,
          type: ExpertiseType.VIRTUAL,
          shift
        });

        const practicalTime = getVirtualPracticalTime(
          analyst.id,
          dateIso,
          shift,
          nextTech,
          finalSchedules
        );

        const newSch: CertificationSchedule = {
          id: `sch-auto-${Date.now()}-${Math.random()}`,
          groupId: nextTech.groupId,
          title: `CERTIFICAÇÃO AUTOMÁTICA - ${nextTech.name}`,
          technicianId: nextTech.id,
          analystId: analyst.id,
          trainingClassId: nextTech.trainingClassId,
          datetime: `${dateIso}T${practicalTime}`,
          theoreticalDatetime: `${dateIso}T${theoreticalTime}`,
          theoreticalTime,
          practicalDatetime: `${dateIso}T${practicalTime}`,
          practicalTime,
          type: ExpertiseType.VIRTUAL,
          status: ScheduleStatus.CONFIRMED,
          availabilitySlotId: 'auto',
          shift,
          technology: nextTech.technology || 'GPON'
        };

        finalSchedules.push(newSch);
        scheduledThisTech = true;
        break;
      }
    }
  }

  if (!scheduledThisTech) {
    allScheduled = false;
    break;
  }
}

const finalOwner = allScheduled ? { id: 'virtual-balanced' } : null;

  if (finalOwner && finalSchedules.length === lotTechs.length) {
    this.schedules.push(...finalSchedules);

    for (const schedule of finalSchedules) {
      const techScheduled = lotTechs.find(
        t => String(t.id) === String(schedule.technicianId)
      );

      if (!techScheduled) continue;

      techScheduled.status_principal = 'AGENDADOS';
      techScheduled.certificationProcessStatus = CertificationProcessStatus.SCHEDULED;
      techScheduled.scheduledCertificationId = schedule.id;
      techScheduled.status_updated_at = new Date().toISOString();
      techScheduled.status_updated_by = 'SISTEMA';
    }

    summary.scheduled += lotTechs.length;
  } else {
    const classLabel = tech.trainingClassId || 'SEM TURMA';
    const companyLabel = tech.company || 'SEM EMPRESA';
    const cityLabel = tech.city || 'SEM CIDADE';
    const stateLabel = tech.state || '';

    for (const lotTech of lotTechs) {
      lotTech.status_principal = 'BACKLOG AGUARDANDO';
      lotTech.backlog_score_aplicado = true;
      lotTech.backlog_motivo =
        'LOTE VIRTUAL SEM VAGA SEGURA RESPEITANDO FUSO, CAPACIDADE E AGENDA EXISTENTE';
    }

    addReason(
      `LOTE VIRTUAL EM BACKLOG: ${companyLabel} / ${cityLabel}${stateLabel ? `-${stateLabel}` : ''} / ${classLabel}. Sem vaga segura respeitando fuso/capacidade.`
    );

    summary.backlog += lotTechs.length;
  }

  continue;
}
  }

  const confirmedScheduleByTechId = new Map<string, CertificationSchedule>();

this.schedules
  .filter(s =>
    s.groupId === context.groupId &&
    s.status === ScheduleStatus.CONFIRMED &&
    !!s.technicianId &&
    ['auto', 'manual', 'base-fixed'].includes(String(s.availabilitySlotId || ''))
  )
  .forEach(s => {
    confirmedScheduleByTechId.set(String(s.technicianId), s);
  });

this.technicians = this.technicians.map(t => {
  if (t.groupId !== context.groupId) return t;

  const schedule = confirmedScheduleByTechId.get(String(t.id));

  if (!schedule) return t;

  return {
    ...t,
    status_principal: 'AGENDADOS',
    certificationProcessStatus: CertificationProcessStatus.SCHEDULED,
    scheduledCertificationId: schedule.id,
    status_updated_at: new Date().toISOString(),
    status_updated_by: 'SISTEMA'
  };
});

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
        sch.status = ScheduleStatus.COMPLETED;
      }
    }

    tech.status_principal = 'APROVADOS';
    tech.certificationProcessStatus = CertificationProcessStatus.CERTIFIED_APPROVED;
    tech.status_updated_at = new Date().toISOString();
    tech.status_updated_by = currentUser.fullName;
    tech.aprovado_manual = true;

    this.persist({
      allowScheduleDeletion: true,
    });

    auditService.logTicket({
      user: currentUser,
      action: 'MARCAR_APROVADO',
      targetType: 'CPF',
      targetValue: tech.cpf,
      reason: `Técnico ${tech.name} (${tech.cpf}) aprovado manualmente na aba AGENDADOS/AGUARDANDO RESULTADO.`,
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
      tech.status_principal = 'CANCELADOS (ANALISTA)';
      tech.status_submotivo = 'ANALISTA INDISPONÍVEL';
      tech.status_observacao = 'CANCELADO POR IMPROVISO NA AGENDA';
      tech.status_updated_at = new Date().toISOString();
      tech.status_updated_by = currentUser.fullName;
      tech.scheduledCertificationId = undefined;
      tech.certificationProcessStatus = CertificationProcessStatus.CANCELLED_BY_ANALYST;
      tech.cancelado_manual = true;
    }
  });

  this.persist({
    allowScheduleDeletion: true,
  });

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
    const routingMatch = tech ? this.resolveBaseForScheduling({
  city: tech.city,
  uf: tech.state,
  company: tech.company,
  analystId
}) : null;
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
    const currentShiftSchedules = daySchedules.filter(s => s.shift === shift);
    const currentCount = currentShiftSchedules.length;

    const incomingGroup = tech
      ? getOperationalTimeGroup(tech.state, tech.city, type)
      : 'DEFAULT';

    if (type === ExpertiseType.VIRTUAL && incomingGroup === 'AC') {
      const acAlreadyInShift = currentShiftSchedules.some(s => {
        const scheduledTech = this.technicians.find(t => t.id === s.technicianId);
        return getOperationalTimeGroup(scheduledTech?.state, scheduledTech?.city, type) === 'AC';
      });

      if (acAlreadyInShift) {
        brokenRules.push('Capacidade AC esgotada para este período. AC usa apenas o segundo horário do período.');
      }
    } else if (currentCount >= limit) {
      brokenRules.push(`Capacidade esgotada para este turno (${currentCount}/${limit}).`);
    }
    if (type === ExpertiseType.PRESENTIAL) {
  if (!routingMatch?.hasCityCoverage) {
    brokenRules.push(`Cidade não possui regra/base presencial ativa (${tech?.city}/${tech?.state}).`);
  } else if (!routingMatch?.base || !routingMatch?.rule) {
    brokenRules.push(`Não existe regra/base presencial válida para esta empresa/analista (${tech?.company || 'sem empresa'}).`);
  }
}

const hasFusoConflict =
  type === ExpertiseType.VIRTUAL &&
  currentShiftSchedules.some(s => {
    if (s.type !== type) return false;

    const scheduledTech = this.technicians.find(t => t.id === s.technicianId);

    const scheduledGroup = getOperationalTimeGroup(
      scheduledTech?.state,
      scheduledTech?.city,
      type
    );

    if (incomingGroup === 'AC') {
      return scheduledGroup === 'AC';
    }

    if (scheduledGroup === 'AC') {
      return false;
    }

    return hasFusoMinusOneConflict(scheduledGroup, incomingGroup);
  });

if (hasFusoConflict) {
  brokenRules.push(
    incomingGroup === 'AC'
      ? 'Este período já possui técnico AC no segundo horário. AC permite apenas 1 técnico por período.'
      : 'Este período já possui técnico de outro fuso operacional. Não é permitido misturar fuso -1 com outros fusos no mesmo período.'
  );
}
    return { canSchedule: brokenRules.length === 0, brokenRules, needsForce: brokenRules.length > 0 };
  }

  private getManualScheduleTime(
  analystId: string,
  dateIso: string,
  shift: Shift,
  type: ExpertiseType,
  tech?: Technician
): string {
  const sameDaySchedules = this.schedules.filter(s =>
    s.analystId === analystId &&
    s.datetime.startsWith(dateIso) &&
    s.type === type &&
    s.status !== ScheduleStatus.CANCELLED
  );

  const sameSlotSchedules = sameDaySchedules.filter(s =>
    s.shift === shift
  );

  const isPresential = type === ExpertiseType.PRESENTIAL;
  const incomingGroup = getOperationalTimeGroup(
    tech?.state,
    tech?.city,
    type
  );

  const compatibleSlotSchedules = isPresential
  ? sameSlotSchedules
  : sameSlotSchedules.filter(s => {
      const scheduledTech = this.technicians.find(t => t.id === s.technicianId);

      const scheduledGroup = getOperationalTimeGroup(
        scheduledTech?.state,
        scheduledTech?.city,
        type
      );

      if (incomingGroup === 'AC') {
        return scheduledGroup === 'AC';
      }

      if (scheduledGroup === 'AC') {
        return false;
      }

      return !hasFusoMinusOneConflict(scheduledGroup, incomingGroup);
    });

  const position = compatibleSlotSchedules.length + 1;

  const theoreticalStart = getOperationalStartTime({
    uf: tech?.state,
    city: tech?.city,
    type,
    shift
  });

  if (isPresential) {
  return getPresentialPracticeTimeByRegion({
    uf: tech?.state,
    city: tech?.city,
    shift,
    position
  });
}

  if (type === ExpertiseType.VIRTUAL) {
  if (incomingGroup === 'AC') {
  if (shift === Shift.MORNING) {
    return '11:30:00';
  }

  if (shift === Shift.AFTERNOON) {
    return '16:30:00';
  }
}

  const firstPracticeTime = addMinutesToTime(theoreticalStart, 60);

  if (shift === Shift.MORNING) {
    if (position === 1) return firstPracticeTime;
    if (position === 2) return addMinutesToTime(firstPracticeTime, 60);
  }

  if (shift === Shift.AFTERNOON) {
    const afternoonStart = getOperationalStartTime({
      uf: tech?.state,
      city: tech?.city,
      type,
      shift: Shift.AFTERNOON
    });

    const firstAfternoonPracticeTime = addMinutesToTime(afternoonStart, 60);

    if (position === 1) return firstAfternoonPracticeTime;
    if (position === 2) return addMinutesToTime(firstAfternoonPracticeTime, 60);
  }
}

  return addMinutesToTime(theoreticalStart, isPresential ? 30 : 60);
}

  public manualScheduleReinforced(params: { techId: string, analystId: string, dateIso: string, shift: Shift, type: ExpertiseType, forced: boolean, brokenRules?: string[] }) {
    const tech = this.technicians.find(t => t.id === params.techId);
    const currentUser = this.getCurrentUser();
    if (tech) {
      const scheduleTime = this.getManualScheduleTime(
    params.analystId,
    params.dateIso,
    params.shift,
    params.type,
    tech
  );
      const theoreticalTime =
        params.type === ExpertiseType.PRESENTIAL
          ? getPresentialTheoryTimeByRegion({
    uf: tech.state,
    city: tech.city
  })
          : getOperationalStartTime({
              uf: tech.state,
              city: tech.city,
              type: params.type,
              shift: params.shift
            });

      const newSch = {
  id: `sch-man-${Date.now()}`,
  groupId: tech.groupId,
  title: `MANUAL ${params.forced ? '(FORÇADO)' : ''} - ${tech.name}`,
  technicianId: tech.id,
  analystId: params.analystId,
  trainingClassId: tech.trainingClassId,
  datetime: `${params.dateIso}T${scheduleTime}`,
  theoreticalDatetime: `${params.dateIso}T${theoreticalTime}`,
  theoreticalTime,
  practicalDatetime: `${params.dateIso}T${scheduleTime}`,
  practicalTime: scheduleTime,
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
      
      this.persist({
  allowScheduleDeletion: true,
});

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
  this.events = this.events.filter(
    e =>
      !(
        e.involvedUserIds.includes(userId) &&
        e.startDatetime.startsWith(dateIso)
      )
  );

  this.persist({
    allowEventDeletion: true
  });

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

  const raw = String(value).trim();

  if (!raw) {
    return { cpf: null, error: "CPF vazio" };
  }

  // remove qualquer coisa que não seja número
  let clean = raw.replace(/\D/g, '');

  // Excel remove zeros à esquerda
  // então completa automaticamente até 11
  if (clean.length <= 11) {
    clean = clean.padStart(11, '0');
  }

  // se mesmo assim ficou inválido
  if (clean.length !== 11) {
    return {
      cpf: null,
      error: `CPF inválido (${clean.length} dígitos)`
    };
  }

  // evita sequência totalmente zerada
  if (clean === '00000000000') {
    return {
      cpf: null,
      error: 'CPF zerado'
    };
  }

  return { cpf: clean };
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
  public updateUser(userId: string, patch: Partial<User>) {
  const index = this.users.findIndex(u => u.id === userId);

  if (index === -1) {
    alert('Analista não encontrado.');
    return;
  }

  this.users[index] = {
    ...this.users[index],
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  this.persist();
  window.dispatchEvent(new Event('data-updated'));
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
  public clearTestSchedules() {
  this.schedulesTeste = [];

  this.persist({
    allowScheduleDeletion: true
  });

  window.dispatchEvent(new Event('data-updated'));
}
  public clearProductionSchedules() {
  const ctx = this.getContext();
  const currentUser = this.getCurrentUser();

  this.schedules = this.schedules.filter(
    s => !(s.groupId === ctx.groupId && s.availabilitySlotId === 'prod-import')
  );

  this.persist({
  allowScheduleDeletion: true
});

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
  classOwnerName?: string;
  externalClassId?: string;
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
      createdBy: currentUser.fullName,
      
      classOwnerName: (params as any).classOwnerName || '',
externalClassId: (params as any).externalClassId || '',
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

if (cleanCpf.length !== 11) {
  errors.push({
    line: index + 2,
    field: 'CPF',
    reason: `CPF não ficou com 11 dígitos após tratamento: ${cleanCpf}`,
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
      console.log('[IMPORT TECNICO]', {
  linha: index + 2,
  nome,
  cpfOriginal: cpfIdx !== -1 ? row[cpfIdx] : null,
  cpfTratado: cleanCpf,
  cidade,
  estado,
  empresaParceiro,
  solicitante,
  importedOutcome,
  status_principal: newTech.status_principal,
  certificationProcessStatus: newTech.certificationProcessStatus,
  trainingClassId: classObj.id,
  requiresCert: classObj.requiresCert
});

this.technicians.push(newTech);
inserted++;

console.log('[IMPORT CONFIRMADO]', {
  totalTechnicians: this.technicians.length,
  tecnicoInserido: this.technicians.find(t => t.cpf === cleanCpf)
});

}); // fecha o rawData.slice(1).forEach

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

        this.persist({
  allowScheduleDeletion: true,
});
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

          this.persist({
  allowScheduleDeletion: true,
});
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

        this.persist({
  allowScheduleDeletion: true,
});
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

        this.persist({
  allowScheduleDeletion: true,
});
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
  public async importarResultadoCertificacaoExcel(file: File) {
  const currentUser = this.getCurrentUser();
  const ctx = this.getContext();

  const normalize = (v: any) =>
    String(v || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toUpperCase();

  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const pendentes = rows.filter(row =>
    normalize(row.ProcessadoNoApp) === 'NAO' &&
    normalize(row.ResultadoIntegracao) === 'AGUARDANDO_APP'
  );

  const resumo = {
    lidas: rows.length,
    pendentes: pendentes.length,
    aprovados: 0,
    reprovados: 0,
    noshow: 0,
    naoLocalizados: 0,
    duplicados: 0,
    erros: [] as string[]
  };

  for (const row of pendentes) {
    const nome = normalize(row.NomeTecnico);
    const status = normalize(row.StatusTecnico);
    const municipio = normalize(row.Município || row.Municipio);
    const uf = normalize(row.UF);
    const empresa = normalize(row.Empresa);

    const candidatos = this.technicians.filter(t => {
  const mesmoGrupo = t.groupId === ctx.groupId;

  const nomeApp = normalize(t.name);
  const nomeExcel = normalize(row['NomeTecnico']);

  const cidadeApp = normalize(t.city);
  const cidadeExcel = normalize(row['Município']);

  const ufApp = normalize(t.state);
  const ufExcel = normalize(row['UF']);

  const empresaApp = normalize(t.company);
  const empresaExcel = normalize(row['Empresa']);

  const nomeOk =
  nomeApp === nomeExcel;

  const empresaOk =
    !empresaExcel ||
    empresaApp === empresaExcel ||
    empresaApp.includes(empresaExcel) ||
    empresaExcel.includes(empresaApp);

  const cidadeOk =
    !cidadeExcel ||
    cidadeApp === cidadeExcel ||
    cidadeApp.includes(cidadeExcel) ||
    cidadeExcel.includes(cidadeApp);

  const ufOk =
    !ufExcel ||
    ufApp === ufExcel;

  const estaAgendado =
  t.status_principal === 'AGENDADOS' ||
  t.status_principal === 'AGUARDANDO_RESULTADO' ||
  t.certificationProcessStatus === CertificationProcessStatus.SCHEDULED ||
  t.certificationProcessStatus === CertificationProcessStatus.AWAITING_RESULT;

  return (
    mesmoGrupo &&
    nomeOk &&
    empresaOk &&
    cidadeOk &&
   ufOk &&
    estaAgendado
  );
});

    if (candidatos.length === 0) {
  resumo.naoLocalizados++;
  resumo.erros.push(`Não localizado / já processado: ${row.NomeTecnico}`);

  console.log('NÃO LOCALIZADO / JÁ PROCESSADO:', {
    nome: row['NomeTecnico'],
    empresa: row['Empresa'],
    cidade: row['Município'],
    uf: row['UF']
  });

  continue;
}

    if (candidatos.length > 1) {
      resumo.duplicados++;
      resumo.erros.push(`Duplicado no app: ${row.NomeTecnico}`);
      continue;
    }

    const tech = candidatos[0];

/*
|--------------------------------------------------------------------------
| AGUARDANDO RESULTADO
|--------------------------------------------------------------------------
| Se existir qualquer retorno do PowerApps/Excel,
| o técnico sai imediatamente de AGENDADOS.
|--------------------------------------------------------------------------
*/

tech.status_principal = 'AGUARDANDO_RESULTADO';
tech.certificationProcessStatus =
  CertificationProcessStatus.AWAITING_RESULT;

tech.status_updated_at = new Date().toISOString();
tech.status_updated_by = currentUser.fullName;

/*
|--------------------------------------------------------------------------
| APROVADO
|--------------------------------------------------------------------------
*/

if (status === 'APROVADO') {
  this.approveScheduledTechnician(tech.id);

  resumo.aprovados++;
  continue;
}

/*
|--------------------------------------------------------------------------
| REPROVADO
|--------------------------------------------------------------------------
*/

if (status === 'REPROVADO') {
  this.reproveScheduledTechnician({
    techId: tech.id,
    outcome: 'REPROVADO_1_CERTIFICACAO',
    observation: 'Resultado recebido via integração Excel.'
  });

  resumo.reprovados++;
  continue;
}

/*
|--------------------------------------------------------------------------
| NOSHOW
|--------------------------------------------------------------------------
*/

if (status === 'NOSHOW' || status === 'NO SHOW') {
  this.reproveScheduledTechnician({
    techId: tech.id,
    outcome: 'NOSHOW',
    observation: 'No-show recebido via integração Excel.'
  });

  resumo.noshow++;
  continue;
}

/*
|--------------------------------------------------------------------------
| RESULTADO AINDA NÃO DEFINIDO / STATUS INVÁLIDO
|--------------------------------------------------------------------------
| Mantém em AGUARDANDO RESULTADO e salva a mudança.
|--------------------------------------------------------------------------
*/

resumo.pendentes++;

if (status) {
  resumo.erros.push(`Status inválido para ${row.NomeTecnico}: ${row.StatusTecnico}`);
}

this.persist({
  allowScheduleDeletion: true,
});

continue;
  }

  auditService.logTicket({
    user: currentUser,
    action: 'IMPORTACAO_RESULTADO_CERTIFICACAO_EXCEL',
    targetType: 'Sistema',
    targetValue: 'Integração Excel',
    reason: `Linhas lidas: ${resumo.lidas}. Pendentes: ${resumo.pendentes}. Aprovados: ${resumo.aprovados}. Reprovados: ${resumo.reprovados}. No-show: ${resumo.noshow}.`,
    screen: 'Integração Excel',
    groupId: ctx.groupId
  });

    // Não persistir novamente aqui.
  // approveScheduledTechnician/reproveScheduledTechnician já persistem com allowScheduleDeletion.
  window.dispatchEvent(new Event('data-updated'));

  return resumo;
}
}
  

export const dataService = new DataService();
