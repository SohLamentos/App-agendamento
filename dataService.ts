
import { 
  mockUsers, mockCities, mockClasses, mockTechnicians, mockEvents
} from './mockData';
import { 
  User, UserRole, Technician, CertificationProcessStatus, ApprovalStatus, 
  TrainingClass, CertificationSchedule, 
  ExpertiseType, Shift, ScheduleStatus, EventSchedule, ParticipationStatus, TrainingStatus,
  AnalystDemandMetrics, SchedulingConfig
} from './types';
import { auditService } from './auditService';

class DataService {
  private users = [...mockUsers];
  private cities = [...mockCities];
  private trainingClasses: TrainingClass[];
  private technicians: Technician[];
  private schedules: CertificationSchedule[];
  private events: EventSchedule[];
  private schedulingConfig: SchedulingConfig;

  constructor() {
    const savedTechs = localStorage.getItem('certitech_technicians_v8');
    const savedSchedules = localStorage.getItem('certitech_schedules_v8');
    const savedEvents = localStorage.getItem('certitech_events_v8');
    const savedClasses = localStorage.getItem('certitech_classes_v8');
    const savedConfig = localStorage.getItem('certitech_scheduling_config');

    this.technicians = savedTechs ? JSON.parse(savedTechs) : [...mockTechnicians];
    this.schedules = savedSchedules ? JSON.parse(savedSchedules) : [];
    this.events = savedEvents ? JSON.parse(savedEvents) : [...mockEvents];
    this.trainingClasses = savedClasses ? JSON.parse(savedClasses) : [...mockClasses];
    this.schedulingConfig = savedConfig ? JSON.parse(savedConfig) : {
      smartPrioritizationEnabled: true,
      weightCity: 10,
      weightPending: 5,
      weightActive: 2
    };
  }

  private persist() {
    localStorage.setItem('certitech_technicians_v8', JSON.stringify(this.technicians));
    localStorage.setItem('certitech_schedules_v8', JSON.stringify(this.schedules));
    localStorage.setItem('certitech_events_v8', JSON.stringify(this.events));
    localStorage.setItem('certitech_classes_v8', JSON.stringify(this.trainingClasses));
    localStorage.setItem('certitech_scheduling_config', JSON.stringify(this.schedulingConfig));
  }

  getUsers() { return [...this.users]; }
  getEvents() { return [...this.events]; }
  getSchedules() { return [...this.schedules]; }
  getTechnicians() { return [...this.technicians]; }
  getTrainingClasses() { return [...this.trainingClasses]; }
  getCities() { return [...this.cities]; }
  getSchedulingConfig() { return { ...this.schedulingConfig }; }

  updateSchedulingConfig(config: SchedulingConfig) {
    const before = JSON.stringify(this.schedulingConfig);
    this.schedulingConfig = config;
    this.persist();
    auditService.logTicket({
      user: this.getCurrentUser(),
      action: 'Alterar Configurações de Agendamento',
      targetType: 'Sistema',
      targetValue: 'SchedulingConfig',
      before,
      after: JSON.stringify(config),
      screen: 'Configurações'
    });
    window.dispatchEvent(new Event('data-updated'));
  }

  getCurrentUser(): User {
    const saved = localStorage.getItem('certitech_user');
    return saved ? JSON.parse(saved) : this.users[0];
  }

  setCurrentUser(user: User) {
    localStorage.setItem('certitech_user', JSON.stringify(user));
    window.location.reload();
  }

  getAnalystDemandMetrics(analystId: string): AnalystDemandMetrics {
    const user = this.users.find(u => u.id === analystId);
    if (!user || !user.analystProfileId) {
      return { cityCount: 0, pendingPresentialCount: 0, activePresentialCount: 0, demandIndex: 0, level: 'BAIXA' };
    }

    const assignedCities = this.cities.filter(c => c.responsibleAnalystIds.includes(user.analystProfileId!));
    const cityNames = assignedCities.map(c => this.normalizeString(c.name));

    const pendingPresential = this.technicians.filter(t => 
      t.generateCertification && 
      [CertificationProcessStatus.QUALIFIED_AWAITING, CertificationProcessStatus.PENDING_NO_SLOT].includes(t.certificationProcessStatus) &&
      cityNames.includes(this.normalizeString(t.city))
    ).length;

    const activePresential = this.schedules.filter(s => 
      s.analystId === analystId && 
      s.type === ExpertiseType.PRESENTIAL && 
      s.status === ScheduleStatus.CONFIRMED
    ).length;

    const index = (assignedCities.length * this.schedulingConfig.weightCity) + 
                  (pendingPresential * this.schedulingConfig.weightPending) + 
                  (activePresential * this.schedulingConfig.weightActive);

    let level: 'BAIXA' | 'MÉDIA' | 'ALTA' = 'BAIXA';
    if (index > 100) level = 'ALTA';
    else if (index > 40) level = 'MÉDIA';

    return {
      cityCount: assignedCities.length,
      pendingPresentialCount: pendingPresential,
      activePresentialCount: activePresential,
      demandIndex: index,
      level
    };
  }

  getDetailedIdleAnalysis(startDate: string, endDate: string) {
    const analysts = this.users.filter(u => u.role === UserRole.ANALYST);
    
    // Normalização local garantindo que o dia seja contado corretamente de 00:00 a 23:59
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T23:59:59');
    
    let businessDays = 0;
    let curr = new Date(start);
    while (curr <= end) {
      if (curr.getDay() !== 0 && curr.getDay() !== 6) businessDays++;
      curr.setDate(curr.getDate() + 1);
    }

    const totalPossibleHours = businessDays * 6;

    return analysts.map(analyst => {
      const analystEvents = this.events.filter(e => {
        const d = new Date(e.startDatetime.split('T')[0] + 'T12:00:00');
        return e.involvedUserIds.includes(analyst.id) && d >= start && d <= end;
      });

      const analystSchedules = this.schedules.filter(s => {
        const d = new Date(s.datetime.split('T')[0] + 'T12:00:00');
        return s.analystId === analyst.id && d >= start && d <= end && s.status !== ScheduleStatus.CANCELLED;
      });

      const getHoursFromEvents = (filteredEvents: EventSchedule[]) => {
        return filteredEvents.reduce((acc, e) => acc + (e.shift === Shift.FULL_DAY ? 6 : 3), 0);
      };

      const trainingHours = getHoursFromEvents(analystEvents.filter(e => e.type === 'Training'));
      const internalCertHours = getHoursFromEvents(analystEvents.filter(e => e.title.toUpperCase().includes('CERTIFICAÇÃO')));
      const offHours = getHoursFromEvents(analystEvents.filter(e => e.type === 'Day Off' || e.title.toUpperCase().includes('FOLGA') || e.title.toUpperCase().includes('FÉRIAS')));

      const productiveHours = analystSchedules.reduce((acc, s) => {
        const duration = s.type === ExpertiseType.VIRTUAL ? 1.5 : 1.0;
        return acc + duration;
      }, 0);

      const nonProductiveBlockedHours = trainingHours + internalCertHours + offHours;
      const emptyHours = Math.max(0, totalPossibleHours - productiveHours - nonProductiveBlockedHours);

      const totalIdleHours = trainingHours + internalCertHours + offHours + emptyHours;
      const idlePercent = totalPossibleHours > 0 ? (totalIdleHours / totalPossibleHours) * 100 : 0;

      return {
        id: analyst.id,
        name: analyst.fullName,
        totalHours: totalPossibleHours,
        productiveHours,
        trainingHours,
        internalCertHours,
        offHours,
        emptyHours,
        totalIdleHours,
        idlePercent
      };
    });
  }

  getManagementReport(startDate: string, endDate: string) {
    return this.getDetailedIdleAnalysis(startDate, endDate);
  }

  getBacklogForecasting() {
    const today = new Date();
    const techPool = this.technicians.filter(t => t.generateCertification && [CertificationProcessStatus.QUALIFIED_AWAITING, CertificationProcessStatus.PENDING_NO_SLOT, CertificationProcessStatus.CANCELLED_RESCHEDULE, CertificationProcessStatus.CERTIFIED_REPROVED_1].includes(t.certificationProcessStatus));
    const analysts = this.users.filter(u => u.role === UserRole.ANALYST);
    let capacityP = 0;
    let capacityV = 0;
    const next10Days = [];
    let d = new Date(today);
    while(next10Days.length < 10) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() !== 0 && d.getDay() !== 6) next10Days.push(new Date(d));
    }
    analysts.forEach(a => {
      next10Days.forEach(day => {
        const dateIso = day.toISOString().split('T')[0];
        [Shift.MORNING, Shift.AFTERNOON].forEach(shift => {
          const blocked = this.events.some(e => e.involvedUserIds.includes(a.id) && e.startDatetime.startsWith(dateIso) && (e.shift === Shift.FULL_DAY || e.shift === shift));
          const scheduled = this.schedules.filter(s => s.analystId === a.id && s.datetime.startsWith(dateIso) && s.shift === shift && s.status !== ScheduleStatus.CANCELLED);
          if (!blocked) {
            capacityV += Math.max(0, 2 - scheduled.length);
            capacityP += Math.max(0, 3 - scheduled.length);
          }
        });
      });
    });
    return {
      kpis: {
        totalEligible: techPool.length,
        capacityP,
        capacityV,
        projectedBacklog: Math.max(0, techPool.length - (capacityP + capacityV)),
        vencimento2d: 0,
        vencimento5d: 0
      },
      riskByClass: [],
      analystPressure: []
    };
  }

  addEvent(event: EventSchedule, reason: string = "") {
    if (!event.id) event.id = `evt-${Date.now()}-${Math.random()}`;
    this.events.push(event);
    this.persist();
    
    auditService.logTicket({
      user: this.getCurrentUser(),
      action: `Inserir Bloqueio – ${event.title}`,
      targetType: 'Analista',
      targetValue: event.involvedUserIds.join(','),
      after: JSON.stringify(event),
      reason,
      screen: 'Agenda'
    });

    window.dispatchEvent(new Event('data-updated'));
  }

  removeEvent(userId: string, dateIso: string, reason: string = "") {
    const before = JSON.stringify(this.events.filter(e => e.involvedUserIds.includes(userId) && e.startDatetime.startsWith(dateIso)));
    this.events = this.events.filter(e => 
      !(e.involvedUserIds.includes(userId) && e.startDatetime.startsWith(dateIso))
    );
    this.persist();

    auditService.logTicket({
      user: this.getCurrentUser(),
      action: 'Remover Evento/Bloqueio',
      targetType: 'Analista',
      targetValue: userId,
      before,
      reason,
      screen: 'Agenda'
    });

    window.dispatchEvent(new Event('data-updated'));
  }

  addEventRange(userId: string, startDate: string, endDate: string, title: string, type: any, reason: string = "") {
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');
    let current = new Date(start);
    const analyst = this.users.find(u => u.id === userId);
    while (current <= end) {
      const dateIso = current.toISOString().split('T')[0];
      this.events = this.events.filter(e => !(e.involvedUserIds.includes(userId) && e.startDatetime.startsWith(dateIso)));
      // Fix missing groupId in EventSchedule range creation
      const evt: EventSchedule = {
        id: `evt-range-${Date.now()}-${Math.random()}`,
        groupId: analyst?.groupId || 'G3',
        title: title.toUpperCase(),
        type: type,
        startDatetime: `${dateIso}T00:00:00Z`,
        endDatetime: `${dateIso}T23:59:59Z`,
        involvedUserIds: [userId],
        shift: Shift.FULL_DAY
      };
      this.events.push(evt);
      current.setDate(current.getDate() + 1);
    }
    this.persist();
    window.dispatchEvent(new Event('data-updated'));
  }

  importTechnicians(data: any[]): number {
    let count = 0;
    data.forEach(item => { count++; });
    this.persist();
    window.dispatchEvent(new Event('data-updated'));
    return count;
  }

  createSchedule(tech: Technician, analyst: User, date: string, shift: Shift, type: ExpertiseType, location: string) {
    // Fix missing groupId in CertificationSchedule creation
    const newSch: CertificationSchedule = { 
      id: `sch-${Date.now()}-${Math.random()}`, 
      groupId: tech.groupId,
      title: `CERTIFICAÇÃO - ${tech.name}`, 
      technicianId: tech.id, 
      analystId: analyst.id, 
      datetime: `${date}T${shift === Shift.MORNING ? '09:00:00' : '14:00:00'}Z`, 
      type, 
      location, 
      status: ScheduleStatus.CONFIRMED, 
      availabilitySlotId: 'slot-auto', 
      shift 
    };
    this.schedules.push(newSch);
    tech.certificationProcessStatus = CertificationProcessStatus.SCHEDULED;
    tech.scheduledCertificationId = newSch.id;
  }

  manualSchedule(techId: string, analystId: string, date: string, shift: Shift, type: ExpertiseType, reason: string = ""): { success: boolean; message?: string } {
    const tech = this.technicians.find(t => t.id === techId);
    const analyst = this.users.find(u => u.id === analystId);
    if (!tech || !analyst) return { success: false, message: 'TÉCNICO OU ANALISTA NÃO LOCALIZADO.' };
    this.createSchedule(tech, analyst, date, shift, type, tech.city);
    this.persist();
    window.dispatchEvent(new Event('data-updated'));
    return { success: true };
  }

  completeCertification(techId: string, approved: boolean, reason: string = "") {
    const tech = this.technicians.find(t => t.id === techId);
    if (tech) {
      if (tech.scheduledCertificationId) {
        const sch = this.schedules.find(s => s.id === tech.scheduledCertificationId);
        if (sch) sch.status = ScheduleStatus.COMPLETED;
      }
      tech.certificationProcessStatus = approved ? CertificationProcessStatus.CERTIFIED_APPROVED : CertificationProcessStatus.CERTIFIED_REPROVED_1;
      this.persist();
      window.dispatchEvent(new Event('data-updated'));
    }
  }

  withdrawScheduling(techId: string, status: CertificationProcessStatus, reason: string) {
    const tech = this.technicians.find(t => t.id === techId);
    if (tech) {
      tech.certificationProcessStatus = status;
      tech.generateCertification = false;
      this.persist();
      window.dispatchEvent(new Event('data-updated'));
    }
  }

  runSmartScheduling(startDate: string, classId?: string) {
    const start = new Date(startDate + 'T00:00:00');
    let techniciansPool = this.technicians.filter(t => t.generateCertification && [CertificationProcessStatus.QUALIFIED_AWAITING, CertificationProcessStatus.PENDING_NO_SLOT].includes(t.certificationProcessStatus));
    const analysts = this.users.filter(u => u.role === UserRole.ANALYST);
    for (let dayOffset = 0; dayOffset < 20; dayOffset++) {
      if (techniciansPool.length === 0) break;
      const dateIso = this.addBusinessDays(start, dayOffset).toISOString().split('T')[0];
      for (const analyst of analysts) {
        for (const shift of [Shift.MORNING, Shift.AFTERNOON]) {
          const isBlocked = this.events.some(e => e.involvedUserIds.includes(analyst.id) && e.startDatetime.startsWith(dateIso) && (e.shift === Shift.FULL_DAY || e.shift === shift));
          if (isBlocked) continue;
          const existing = this.schedules.filter(s => s.analystId === analyst.id && s.datetime.startsWith(dateIso) && s.shift === shift);
          let limit = existing.length > 0 && existing[0].type === ExpertiseType.VIRTUAL ? 2 : 3;
          let available = Math.max(0, limit - existing.length);
          for (let i = 0; i < techniciansPool.length && available > 0; i++) {
             const tech = techniciansPool[i];
             this.createSchedule(tech, analyst, dateIso, shift, ExpertiseType.VIRTUAL, tech.city);
             techniciansPool = techniciansPool.filter(tp => tp.id !== tech.id);
             available--;
          }
        }
      }
    }
    this.persist();
    window.dispatchEvent(new Event('data-updated'));
  }

  private normalizeString(str: string): string {
    return str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase() : "";
  }

  private addBusinessDays(date: Date, days: number): Date {
    const result = new Date(date);
    let count = 0;
    while (count < days) {
      result.setDate(result.getDate() + 1);
      if (result.getDay() !== 0 && result.getDay() !== 6) count++;
    }
    return result;
  }
}

export const dataService = new DataService();
