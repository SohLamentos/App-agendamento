
import { 
  mockUsers, mockCities, mockClasses, mockTechnicians, mockEvents
} from './mockData';
import { 
  User, UserRole, Technician, CertificationProcessStatus, ApprovalStatus, 
  TrainingClass, CertificationSchedule, 
  ExpertiseType, Shift, ScheduleStatus, EventSchedule, ParticipationStatus, TrainingStatus,
  AnalystDemandMetrics, SchedulingConfig, Group, GroupRule, CityGroup, CertificationCity, VirtualScoreAdjustment
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

  constructor() {
    const savedGroups = localStorage.getItem('g_groups_v13');
    const savedRules = localStorage.getItem('g_rules_v13');
    const savedCities = localStorage.getItem('g_cities_v13');
    const savedUsers = localStorage.getItem('g_users_v13');
    const savedTechs = localStorage.getItem('certitech_technicians_v13');
    const savedClasses = localStorage.getItem('certitech_classes_v13');
    const savedSchedules = localStorage.getItem('certitech_schedules_v13');
    const savedSchedulesTeste = localStorage.getItem('certitech_schedules_teste_v13');
    const savedEvents = localStorage.getItem('certitech_events_v13');
    const savedConfig = localStorage.getItem('certitech_config_v13');
    const savedTestMode = localStorage.getItem('certitech_test_mode_v13');
    const savedAdjustments = localStorage.getItem('g_score_adjustments_v13');

    this.groups = savedGroups ? JSON.parse(savedGroups) : [{ id: 'G3', name: 'NACIONAL BASE', active: true }];
    this.groupRules = savedRules ? JSON.parse(savedRules) : [{ groupId: 'G3', presencialPerShift: 3, virtualPerShift: 2, schedulingWindowDays: 20, active: true }];
    this.cities = savedCities ? JSON.parse(savedCities) : mockCities.map(c => ({ 
      id: c.id, 
      groupId: 'G3', 
      name: c.name, 
      uf: 'RS', 
      type: c.defaultType, 
      active: true, 
      responsibleAnalystIds: c.responsibleAnalystIds 
    }));
    this.users = savedUsers ? JSON.parse(savedUsers) : mockUsers;
    this.technicians = savedTechs ? JSON.parse(savedTechs) : [];
    this.trainingClasses = savedClasses ? JSON.parse(savedClasses) : [];
    this.schedules = savedSchedules ? JSON.parse(savedSchedules) : [];
    this.schedulesTeste = savedSchedulesTeste ? JSON.parse(savedSchedulesTeste) : [];
    this.events = savedEvents ? JSON.parse(savedEvents) : [];
    this.schedulingConfig = savedConfig ? JSON.parse(savedConfig) : { smartPrioritizationEnabled: true, weightCity: 10, weightPending: 5, weightActive: 2 };
    this.testModeActive = savedTestMode === 'true';
    this.scoreAdjustments = savedAdjustments ? JSON.parse(savedAdjustments) : [];

    this.persist();
  }

  private persist() {
    localStorage.setItem('g_groups_v13', JSON.stringify(this.groups));
    localStorage.setItem('g_rules_v13', JSON.stringify(this.groupRules));
    localStorage.setItem('g_cities_v13', JSON.stringify(this.cities));
    localStorage.setItem('g_users_v13', JSON.stringify(this.users));
    localStorage.setItem('certitech_technicians_v13', JSON.stringify(this.technicians));
    localStorage.setItem('certitech_classes_v13', JSON.stringify(this.trainingClasses));
    localStorage.setItem('certitech_schedules_v13', JSON.stringify(this.schedules));
    localStorage.setItem('certitech_schedules_teste_v13', JSON.stringify(this.schedulesTeste));
    localStorage.setItem('certitech_events_v13', JSON.stringify(this.events));
    localStorage.setItem('certitech_config_v13', JSON.stringify(this.schedulingConfig));
    localStorage.setItem('certitech_test_mode_v13', this.testModeActive ? 'true' : 'false');
    localStorage.setItem('g_score_adjustments_v13', JSON.stringify(this.scoreAdjustments));
  }

  public safeNormalize(value: any): string {
    const s = (value === null || value === undefined) ? "" : String(value);
    return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, ' ').trim().toUpperCase();
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
  getGroups() { return this.groups; }
  getGroupRules() { return this.groupRules; }
  getScoreAdjustments() { return this.scoreAdjustments.filter(a => a.groupId === this.getContext().groupId); }

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

  public saveScoreAdjustment(adj: Omit<VirtualScoreAdjustment, 'id' | 'createdAt' | 'createdBy'>) {
    const user = this.getCurrentUser();
    const newAdj: VirtualScoreAdjustment = {
      ...adj,
      id: `adj-${Date.now()}`,
      createdAt: new Date().toISOString(),
      createdBy: user.fullName
    };
    this.scoreAdjustments.push(newAdj);
    this.persist();

    auditService.logTicket({
      user,
      action: 'AJUSTE_SCORE_VIRTUAL',
      targetType: 'AjusteScore',
      targetValue: adj.analystId,
      after: JSON.stringify(newAdj),
      reason: adj.reason,
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
        action: 'AJUSTE_SCORE_VIRTUAL_REMOCAO',
        targetType: 'AjusteScore',
        targetValue: adj.analystId,
        before: JSON.stringify(adj),
        screen: 'Configuração de Balanceamento',
        groupId: adj.groupId
      });
      window.dispatchEvent(new Event('data-updated'));
    }
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
    const addReason = (r: string) => summary.reasons[r] = (summary.reasons[r] || 0) + 1;
    
    const context = this.getContext();
    const techniciansPool = this.technicians.filter(t => t.groupId === context.groupId && (t.status_principal === "PENDENTE_TRATAMENTO" || t.status_principal === "PENDENTE_CERTIFICAÇÃO"));
    const analystsPool = this.users.filter(u => u.role === UserRole.ANALYST && u.active && u.groupId === context.groupId);
    
    const todayStr = new Date().toISOString().split('T')[0];
    const activeAdjustments = this.scoreAdjustments.filter(a => a.active && todayStr >= a.startDate && todayStr <= a.endDate && a.groupId === context.groupId);

    const businessDays = this.getBusinessDays(startDateIso, 10);

    for (const tech of techniciansPool) {
      let wasScheduled = false;
      const cityConfig = this.cities.find(c => this.safeNormalize(c.name) === this.safeNormalize(tech.city));
      const requiresPresential = cityConfig?.type === ExpertiseType.PRESENTIAL;
      const targetType = requiresPresential ? ExpertiseType.PRESENTIAL : ExpertiseType.VIRTUAL;
      const limitPerShift = targetType === ExpertiseType.VIRTUAL ? 2 : 3;

      let allowedAnalysts = requiresPresential 
        ? analystsPool.filter(a => cityConfig?.responsibleAnalystIds.includes(a.analystProfileId || ''))
        : analystsPool;

      // Ordenação para Virtual: Priorizar analistas com MENOR score (Carga Presencial + Backlog)
      if (!requiresPresential) {
        allowedAnalysts = [...allowedAnalysts].sort((a, b) => {
          const metricsA = this.getAnalystDemandMetrics(a.id);
          const metricsB = this.getAnalystDemandMetrics(b.id);
          
          const adjA = activeAdjustments.find(adj => adj.analystId === a.id)?.penalty || 0;
          const adjB = activeAdjustments.find(adj => adj.analystId === b.id)?.penalty || 0;
          
          const scoreA = metricsA.demandIndex + adjA;
          const scoreB = metricsB.demandIndex + adjB;
          
          return scoreA - scoreB;
        });
      }

      if (requiresPresential && allowedAnalysts.length === 0) {
        tech.status_principal = "BACKLOG AGUARDANDO";
        tech.backlog_score_aplicado = true;
        tech.backlog_motivo = "SEM ANALISTA RESPONSÁVEL (CIDADE PRESENCIAL)";
        addReason(tech.backlog_motivo);
        summary.backlog++;
        continue;
      }

      dayLoop: for (const dateIso of businessDays) {
        for (const analyst of allowedAnalysts) {
          const daySchedules = this.schedules.filter(s => s.analystId === analyst.id && s.datetime.startsWith(dateIso) && s.status !== ScheduleStatus.CANCELLED);
          const hasVirtual = daySchedules.some(s => s.type === ExpertiseType.VIRTUAL);
          const hasPresential = daySchedules.some(s => s.type === ExpertiseType.PRESENTIAL);
          
          if ((targetType === ExpertiseType.VIRTUAL && hasPresential) || (targetType === ExpertiseType.PRESENTIAL && hasVirtual)) continue;

          for (const shift of [Shift.MORNING, Shift.AFTERNOON]) {
            const isBlocked = this.events.some(e => e.involvedUserIds.includes(analyst.id) && e.startDatetime.startsWith(dateIso) && (e.shift === Shift.FULL_DAY || e.shift === shift));
            if (isBlocked) continue;

            const shiftCount = daySchedules.filter(s => s.shift === shift).length;
            if (shiftCount < limitPerShift) {
              const newSch: CertificationSchedule = {
                id: `sch-auto-${Date.now()}-${Math.random()}`,
                groupId: tech.groupId,
                title: `CERTIFICAÇÃO AUTOMÁTICA - ${tech.name}`,
                technicianId: tech.id,
                analystId: analyst.id,
                datetime: `${dateIso}T09:00:00Z`,
                type: targetType,
                status: ScheduleStatus.CONFIRMED,
                availabilitySlotId: 'auto',
                shift,
                technology: tech.technology || 'GPON'
              };
              this.schedules.push(newSch);
              tech.status_principal = "AGENDADOS";
              tech.certificationProcessStatus = CertificationProcessStatus.SCHEDULED;
              tech.scheduledCertificationId = newSch.id;
              tech.status_updated_at = new Date().toISOString();
              tech.status_updated_by = "SISTEMA";
              summary.scheduled++;
              wasScheduled = true;
              break dayLoop;
            }
          }
        }
      }

      if (!wasScheduled) {
        tech.status_principal = "BACKLOG AGUARDANDO";
        tech.backlog_score_aplicado = true;
        tech.backlog_motivo = "SEM VAGA NO PRAZO (10 DIAS)";
        addReason(tech.backlog_motivo);
        summary.backlog++;
      }
    }

    this.persist();
    auditService.logTicket({
      user: this.getCurrentUser(),
      action: 'GERAR_AGENDAMENTO_AUTOMATICO',
      targetType: 'Sistema',
      targetValue: context.groupId,
      reason: `Processamento a partir de ${startDateIso} finalizado: ${summary.scheduled} agendados, ${summary.backlog} backlog.`,
      screen: 'Turmas e Técnicos',
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
      auditService.logTicket({ user: currentUser, action: 'MARCAR_APROVADO', targetType: 'CPF', targetValue: tech.cpf, reason: 'Aprovação manual na aba agendados', screen: 'Turmas e Técnicos', groupId: tech.groupId });
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
    auditService.logTicket({ user: currentUser, action: 'CANCELAMENTO_POR_IMPROVISO', targetType: 'Analista', targetValue: analystId, reason: `Improviso lançado para ${dateIso} (${shift}) afetando ${affectedSchedules.length} agendamentos.`, screen: 'Agenda', groupId: currentUser.groupId });
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
    if (isBlocked) brokenRules.push("O analista possui bloqueio de agenda neste período.");
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

  public manualScheduleReinforced(params: { techId: string, analystId: string, dateIso: string, shift: Shift, type: ExpertiseType, forced: boolean, brokenRules?: string[] }) {
    const tech = this.technicians.find(t => t.id === params.techId);
    const currentUser = this.getCurrentUser();
    if (tech) {
      const newSch: CertificationSchedule = {
        id: `sch-man-${Date.now()}`,
        groupId: tech.groupId,
        title: `MANUAL ${params.forced ? '(FORÇADO)' : ''} - ${tech.name}`,
        technicianId: tech.id,
        analystId: params.analystId,
        datetime: `${params.dateIso}T09:00:00Z`,
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
      auditService.logTicket({ user: currentUser, action: 'AGENDAMENTO_MANUAL', targetType: 'CPF', targetValue: tech.cpf, reason: params.forced ? `Forçado: ${params.brokenRules?.join(' | ')}` : 'Agendamento manual respeitando regras.', forcado: params.forced, regrasBurladas: params.brokenRules, screen: 'Turmas e Técnicos', groupId: tech.groupId });
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
    // Trim, Uppercase, e remove caracteres invisíveis (BOM, ZWSP, etc)
    return s.trim().toUpperCase().replace(/[\u200B-\u200D\uFEFF]/g, "");
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

  public importTechniciansSimple(raw: any[][], requiresCert: boolean): ImportResult {
    const ctx = this.getContext();
    let inserted = 0;
    let updated = 0;
    let ignored = 0;
    let duplicatedInClass = 0;
    let newInOtherClass = 0;
    const errors: ImportError[] = [];

    const headers = (raw[0] || []).map(h => this.normalizeHeaderName(h));
    const cpfIdx = headers.indexOf("CPF");
    const nameIdx = headers.findIndex(h => h === "NOME" || h === "NOME COMPLETO");
    const cityIdx = headers.indexOf("CIDADE");

    raw.slice(1).forEach((row, index) => {
      if (!row || row.length === 0) return;
      
      const name = nameIdx !== -1 ? String(row[nameIdx] || "").trim().toUpperCase() : "";
      const city = cityIdx !== -1 ? String(row[cityIdx] || "").trim().toUpperCase() : "";
      
      const { cpf: cleanCpf, error: cpfError } = this.processCpfValue(cpfIdx !== -1 ? row[cpfIdx] : null);
      
      if (cpfError) {
        errors.push({ line: index + 2, field: 'CPF', reason: cpfError, value: cpfIdx !== -1 ? row[cpfIdx] : null });
        return;
      }
      
      if (!cleanCpf) return;

      const existing = this.technicians.find(t => t.cpf === cleanCpf && t.groupId === ctx.groupId);
      
      if (existing) {
        existing.name = name;
        existing.city = city;
        existing.status_principal = requiresCert ? "PENDENTE_CERTIFICAÇÃO" : "TREINAMENTO SEM CERTIFICAÇÃO";
        existing.generateCertification = requiresCert;
        updated++;
      } else {
        const tech: Technician = { 
          id: `tech-${Date.now()}-${Math.random()}`, 
          groupId: ctx.groupId, 
          name: name, 
          cpf: cleanCpf, 
          city: city, 
          state: 'RS', 
          email: '', phone: '', company: '', externalLogin: '', solicitor: '', certificationType: 'VIRTUAL', trainingClassId: '', participationStatus: ParticipationStatus.ENROLLED, eadExamScore: 0, finalTrainingScore: 0, eadApprovalStatus: ApprovalStatus.PENDING, generalApprovalStatus: ApprovalStatus.PENDING, certificationProcessStatus: CertificationProcessStatus.QUALIFIED_AWAITING, certificationReproofCount: 0, generateCertification: requiresCert, unique_key: cleanCpf, 
          status_principal: requiresCert ? "PENDENTE_CERTIFICAÇÃO" : "TREINAMENTO SEM CERTIFICAÇÃO"
        };
        this.technicians.push(tech);
        inserted++;
      }
    });
    this.persist();
    window.dispatchEvent(new Event('data-updated'));
    return { inserted, updated, ignored, duplicatedInClass, newInOtherClass, errors };
  }

  public createTrainingClass(params: { classNumber: string, subcategory: string, type: 'GPON' | 'HFC' | 'OUTROS', requiresCert: boolean }) {
    const user = this.getCurrentUser();
    // Padrão solicitado: {TIPO} — {SUBCATEGORIA} — TURMA {NUMERO}
    const autoTitle = `${params.type} — ${params.subcategory} — TURMA ${params.classNumber}`.toUpperCase();
    const newClass: TrainingClass = {
      id: `class-${Date.now()}`,
      groupId: user.groupId,
      classNumber: params.classNumber,
      title: autoTitle,
      subcategory: params.subcategory,
      type: params.type,
      requiresCert: params.requiresCert,
      locationId: 'REMOTO',
      clientCompany: 'CLARO',
      startDate: new Date().toISOString(),
      endDate: new Date().toISOString(),
      responsibleAnalystId: user.id,
      status: TrainingStatus.PLANNED,
      createdAt: new Date().toISOString(),
      createdBy: user.fullName
    };
    this.trainingClasses.push(newClass);
    this.persist();
    
    auditService.logTicket({
      user,
      action: 'CRIAR_TURMA',
      targetType: 'Turma',
      targetValue: params.classNumber,
      after: JSON.stringify(newClass),
      screen: 'Turmas e Técnicos',
      groupId: user.groupId
    });

    window.dispatchEvent(new Event('data-updated'));
    return newClass;
  }

  public importTechniciansForClass(classObj: TrainingClass, raw: any[][]): ImportResult {
    const ctx = this.getContext();
    let inserted = 0;
    let updated = 0;
    let ignored = 0;
    let duplicatedInClass = 0;
    let newInOtherClass = 0;
    const errors: ImportError[] = [];

    const headers = (raw[0] || []).map(h => this.normalizeHeaderName(h));
    const cpfIdx = headers.indexOf("CPF");
    const nameIdx = headers.findIndex(h => h === "NOME" || h === "NOME COMPLETO");
    const cityIdx = headers.indexOf("CIDADE");
    
    raw.slice(1).forEach((row, index) => {
      if (!row || row.length === 0) return;

      const name = nameIdx !== -1 ? String(row[nameIdx] || "").trim().toUpperCase() : "";
      const city = cityIdx !== -1 ? String(row[cityIdx] || "").trim().toUpperCase() : "";
      
      const { cpf: cleanCpf, error: cpfError } = this.processCpfValue(cpfIdx !== -1 ? row[cpfIdx] : null);
      
      if (cpfError) {
        errors.push({ line: index + 2, field: 'CPF', reason: cpfError, value: cpfIdx !== -1 ? row[cpfIdx] : null });
        return;
      }

      if (!cleanCpf) return;
      
      const inThisClass = this.technicians.find(t => t.cpf === cleanCpf && t.trainingClassId === classObj.id && t.groupId === ctx.groupId);
      
      if (inThisClass) {
        // Regra: Se CPF já existir na MESMA turma -> classificar como "Duplicado na Turma"
        duplicatedInClass++;
        return;
      }

      // Se CPF existir em outra turma: permitir novo registro vinculado a esta turma
      const inAnotherClass = this.technicians.find(t => t.cpf === cleanCpf && t.groupId === ctx.groupId);
      
      if (inAnotherClass) {
        // NOVO EM OUTRA TURMA (Criamos um novo registro vinculado a esta turma)
        const tech: Technician = { 
          id: `tech-${Date.now()}-${Math.random()}`, 
          groupId: ctx.groupId, 
          name: name, 
          cpf: cleanCpf, 
          city: city, 
          state: 'RS', 
          email: '', phone: '', company: '', externalLogin: '', solicitor: '', certificationType: 'VIRTUAL', trainingClassId: classObj.id, participationStatus: ParticipationStatus.ENROLLED, eadExamScore: 0, finalTrainingScore: 0, eadApprovalStatus: ApprovalStatus.PENDING, generalApprovalStatus: ApprovalStatus.PENDING, certificationProcessStatus: CertificationProcessStatus.QUALIFIED_AWAITING, certificationReproofCount: 0, generateCertification: classObj.requiresCert, unique_key: cleanCpf + "_" + classObj.id, 
          status_principal: classObj.requiresCert ? "PENDENTE_CERTIFICAÇÃO" : "TREINAMENTO SEM CERTIFICAÇÃO",
          technology: classObj.type
        };
        this.technicians.push(tech);
        newInOtherClass++;
      } else {
        // INSERIDO (Registro totalmente novo no sistema)
        const tech: Technician = { 
          id: `tech-${Date.now()}-${Math.random()}`, 
          groupId: ctx.groupId, 
          name: name, 
          cpf: cleanCpf, 
          city: city, 
          state: 'RS', 
          email: '', phone: '', company: '', externalLogin: '', solicitor: '', certificationType: 'VIRTUAL', trainingClassId: classObj.id, participationStatus: ParticipationStatus.ENROLLED, eadExamScore: 0, finalTrainingScore: 0, eadApprovalStatus: ApprovalStatus.PENDING, generalApprovalStatus: ApprovalStatus.PENDING, certificationProcessStatus: CertificationProcessStatus.QUALIFIED_AWAITING, certificationReproofCount: 0, generateCertification: classObj.requiresCert, unique_key: cleanCpf + "_" + classObj.id, 
          status_principal: classObj.requiresCert ? "PENDENTE_CERTIFICAÇÃO" : "TREINAMENTO SEM CERTIFICAÇÃO",
          technology: classObj.type
        };
        this.technicians.push(tech);
        inserted++;
      }
    });
    
    this.persist();
    window.dispatchEvent(new Event('data-updated'));
    return { inserted, updated, ignored, duplicatedInClass, newInOtherClass, errors };
  }

  public getUnconfiguredCities() {
    const configuredNames = new Set(this.cities.map(c => this.safeNormalize(c.name)));
    return mockCities.filter(mc => !configuredNames.has(this.safeNormalize(mc.name)));
  }

  public resetUserPassword(userId: string): boolean {
    const user = this.users.find(u => u.id === userId);
    if (user) { user.passwordHash = btoa('salt_Claro@123_G3'); this.persist(); return true; }
    return false;
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
    if (user) { user.active = active; this.persist(); window.dispatchEvent(new Event('data-updated')); }
  }

  public downloadTemplate() { 
    const headers = [["Nome", "Email", "Cidade", "Estado", "Telefone", "CPF", "Empresa/Parceiro", "Login TOA", "OBS", "Solicitante"]]; 
    const ws = XLSX.utils.aoa_to_sheet(headers); 
    const wb = XLSX.utils.book_new(); 
    XLSX.utils.book_append_sheet(wb, ws, "MODELO"); 
    XLSX.writeFile(wb, "MODELO_IMPORTACAO_TECNICOS_TURMA.xlsx"); 
  }
  
  public downloadTestTemplate() { const headers = [["ANALISTA", "DATA", "TURNO", "TIPO", "TECNOLOGIA", "QUANTIDADE"]]; const ws = XLSX.utils.aoa_to_sheet(headers); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Modelo Teste"); XLSX.writeFile(wb, "modelo_agenda_teste.xlsx"); }
  public importTestSchedules(raw: any[][]): number { let count = 0; const ctx = this.getContext(); raw.slice(1).forEach(row => { if (!row[0] || !row[1]) return; const [analystName, date, shift, type, tech, qty] = row; const analyst = this.users.find(u => u.normalizedLogin === String(analystName).toUpperCase()); if (analyst) { const numQty = parseInt(String(qty)) || 1; for (let i = 0; i < numQty; i++) { this.schedulesTeste.push({ id: `sch-test-${Date.now()}-${Math.random()}`, groupId: ctx.groupId, title: `TESTE - ${analystName}`, technicianId: 'test-tech', analystId: analyst.id, datetime: `${date}T09:00:00Z`, type: String(type).toUpperCase() === 'VIRTUAL' ? ExpertiseType.VIRTUAL : ExpertiseType.PRESENTIAL, status: ScheduleStatus.CONFIRMED, availabilitySlotId: 'test', shift: String(shift).toUpperCase() === 'TARDE' ? Shift.AFTERNOON : Shift.MORNING, technology: String(tech || 'GPON').toUpperCase() }); count++; } } }); this.persist(); window.dispatchEvent(new Event('data-updated')); return count; }
  public clearTestSchedules() { this.schedulesTeste = []; this.persist(); window.dispatchEvent(new Event('data-updated')); }
  public getDetailedIdleAnalysis(startDate: string, endDate: string) { const analysts = this.users.filter(u => u.role === UserRole.ANALYST); const start = new Date(startDate + 'T00:00:00'); const end = new Date(endDate + 'T23:59:59'); let businessDays = 0; let curr = new Date(start); while (curr <= end) { if (curr.getDay() !== 0 && curr.getDay() !== 6) businessDays++; curr.setDate(curr.getDate() + 1); } const totalPossibleHours = businessDays * 6; return analysts.map(analyst => { const analystEvents = this.events.filter(e => { const d = new Date(e.startDatetime.split('T')[0] + 'T12:00:00'); return e.involvedUserIds.includes(analyst.id) && d >= start && d <= end; }); const pool = this.testModeActive ? this.schedulesTeste : this.schedules; const analystSchedules = pool.filter(s => { const d = new Date(s.datetime.split('T')[0] + 'T12:00:00'); return s.analystId === analyst.id && d >= start && d <= end && s.status !== ScheduleStatus.CANCELLED; }); const getHoursFromEvents = (filteredEvents: EventSchedule[]) => { return filteredEvents.reduce((acc, e) => acc + (e.shift === Shift.FULL_DAY ? 6 : 3), 0); }; const trainingHours = getHoursFromEvents(analystEvents.filter(e => e.type === 'Training')); const internalCertHours = getHoursFromEvents(analystEvents.filter(e => e.title.toUpperCase().includes('CERTIFICAÇÃO'))); const offHours = getHoursFromEvents(analystEvents.filter(e => e.type === 'Day Off' || e.title.toUpperCase().includes('FOLGA') || e.title.toUpperCase().includes('FÉRIAS'))); const productiveHours = analystSchedules.reduce((acc, s) => { return acc + (s.type === ExpertiseType.VIRTUAL ? 1.5 : 1.0); }, 0); const nonProductiveBlockedHours = trainingHours + internalCertHours + offHours; const emptyHours = Math.max(0, totalPossibleHours - productiveHours - nonProductiveBlockedHours); const totalIdleHours = trainingHours + internalCertHours + offHours + emptyHours; const idlePercent = totalPossibleHours > 0 ? (totalIdleHours / totalPossibleHours) * 100 : 0; return { id: analyst.id, name: analyst.fullName, totalHours: totalPossibleHours, productiveHours, trainingHours, internalCertHours, offHours, emptyHours, totalIdleHours, idlePercent }; }); }
  public getOperationalReport(f: any) { return { kpis: { requested: 0, realized: 0, noShow: 0, reprovedEad: 0, reprovedVirtual: 0, reprovedPresential: 0, pending: 0 }, rankings: { partners: [], cities: [], states: [] } }; }
  public getQualityReport(f: any) { return { kpis: { noShowPct: 0, reprovedEadPct: 0, reprovedVirtualPct: 0, reprovedPresentialPct: 0 } }; }
  public getCapacityRiskReport() { return { summary: { capacity: 0, demand: 0, balance: 0 }, analysts: [] }; }
  public getBrazilMapData() { return []; }
  public getBacklogForecasting() { return { kpis: { totalEligible: 0, capacityP: 0, capacityV: 0, projectedBacklog: 0, vencimento2d: 0, vencimento5d: 0 }, riskByClass: [], analystPressure: [] }; }
}

export const dataService = new DataService();
