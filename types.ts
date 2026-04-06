
export enum UserRole {
  ADMIN = 'Admin',
  MANAGER = 'Gestor',
  ANALYST = 'Analista'
}

export enum ExpertiseType {
  PRESENTIAL = 'Presencial',
  VIRTUAL = 'Virtual',
  BOTH = 'Ambos'
}

export enum TrainingStatus {
  PLANNED = 'Planejado',
  IN_PROGRESS = 'Em Andamento',
  COMPLETED = 'Concluído',
  CANCELLED = 'Cancelado'
}

export enum ParticipationStatus {
  ENROLLED = 'Inscrito',
  PRESENT = 'Presente',
  NO_SHOW = 'Não Compareceu (No-Show)'
}

export enum ApprovalStatus {
  APPROVED = 'Aprovado',
  REPROVED = 'Reprovado',
  PENDING = 'Pendente'
}

export enum CertificationProcessStatus {
  QUALIFIED_AWAITING = 'Qualificado - Aguardando Agendamento',
  SCHEDULED = 'Agendado',
  BACKLOG_PENDING = 'Backlog - Pendente de Slot',
  CANCELLED_RESCHEDULE = 'Cancelado - Reagendar Posteriormente',
  CERTIFIED_APPROVED = 'Certificado - Aprovado',
  CERTIFIED_REPROVED_1 = 'Certificado - Reprovado (1ª Tentativa)',
  CERTIFIED_REPROVED_2 = 'Certificado - Reprovado (2ª Tentativa)',
  RETRAIN_REQUIRED = 'Bloqueado - Necessita Retreinar (2 Reprovações)',
  NOT_QUALIFIED_EAD = 'Não Qualificado - Reprovado EAD',
  NOT_QUALIFIED_TRAINING = 'Não Qualificado - Reprovado Treinamento',
  NOT_QUALIFIED_NOSHOW = 'Não Qualificado - No-Show',
  NOT_REQUIRED = 'Não Requerido - Decisão Gestão',
  PENDING_NO_SLOT = 'Não Agendado - Sem Slot Disponível',
  TRAINING_NOT_NEEDED = 'Treinamento não Necessário',
  CANCELLED_BY_ANALYST = 'Cancelado - Analista (Improviso)',
  INABILITADO = 'InABILITADO'
}

export enum SlotStatus {
  AVAILABLE = 'Disponível',
  SCHEDULED = 'Agendado',
  BLOCKED = 'Bloqueado'
}

export enum ScheduleStatus {
  PENDING = 'Pendente',
  CONFIRMED = 'Confirmado',
  COMPLETED = 'Concluído',
  CANCELLED = 'Cancelado'
}

export enum Shift {
  MORNING = 'Manhã',
  AFTERNOON = 'Tarde',
  FULL_DAY = 'Dia Todo'
}

export interface Group {
  id: string;
  name: string;
  active: boolean;
}

export interface User {
  id: string;
  fullName: string;
  normalizedLogin: string;
  firstNameLogin: string; 
  email: string;
  role: UserRole;
  groupId: string;
  managerId?: string; 
  passwordHash: string;
  active: boolean;
  analystProfileId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VirtualScoreAdjustment {
  id: string;
  groupId: string;
  analystId: string;
  penalty: number;
  startDate: string;
  endDate: string;
  reason: string;
  active: boolean;
  createdAt: string;
  createdBy: string;
}

export interface GroupRule {
  groupId: string;
  presencialPerShift: number;
  virtualPerShift: number;
  schedulingWindowDays: number;
  rulesJson?: string;
  active: boolean;
}

export interface CityGroup {
  id: string;
  groupId: string;
  name: string;
  uf: string;
  type: ExpertiseType;
  active: boolean;
  responsibleAnalystIds: string[];
}

export interface CertificationCity {
  id: string;
  name: string;
  defaultType: ExpertiseType;
  responsibleAnalystIds: string[];
}

export interface AnalystProfile {
  id: string;
  userId: string;
  expertiseType: ExpertiseType;
  coveredCityIds: string[];
}

export interface AuditTicket {
  ticketId: string;
  timestamp: string;
  userName: string;
  userRole: UserRole;
  groupId: string;
  action: string;
  targetType: 'CPF' | 'Turma' | 'Analista' | 'Lote' | 'Sistema' | 'Grupo' | 'Usuario' | 'Regra' | 'AjusteScore';
  targetValue: string;
  before: string;
  after: string;
  reason: string;
  screen: string;
  subReason?: string;
  categoryReproof?: string;
  forcado?: boolean;
  regrasBurladas?: string[];
}

export interface TrainingClass {
  id: string;
  groupId: string;
  classNumber: string;
  title: string;
  subcategory: string;
  type: 'GPON' | 'HFC' | 'OUTROS';
  requiresCert: boolean;
  locationId: string;
  clientCompany: string;
  startDate: string;
  endDate: string;
  responsibleAnalystId: string;
  status: TrainingStatus;
  observations?: string;
  createdAt: string;
  createdBy: string;
}

export interface Technician {
  id: string;
  groupId: string;
  name: string;
  email: string;
  cpf: string;
  phone: string;
  city: string;
  state: string;
  company: string;
  externalLogin: string;
  solicitor: string;
  certificationType: string;
  trainingClassId: string;
  participationStatus: ParticipationStatus;
  eadExamScore: number;
  finalTrainingScore: number;
  eadApprovalStatus: ApprovalStatus;
  generalApprovalStatus: ApprovalStatus;
  certificationProcessStatus: CertificationProcessStatus;
  certificationReproofCount: number;
  scheduledCertificationId?: string;
  generateCertification: boolean;
  observations?: string;
  withdrawalReason?: string;
  
  unique_key: string; 

  isDispensa?: boolean;
  isBlacklist?: boolean;
  finalGrade?: number;
  isCertificateIssued?: boolean;
  cancelledBy?: 'SISTEMA' | 'ANALISTA' | 'GESTOR' | 'TECNICO';

  status_principal?: string;
  status_submotivo?: string;
  status_observacao?: string;
  categoria_reprovacao?: string;
  status_updated_at?: string;
  status_updated_by?: string;

  backlog_motivo?: string;
  technology?: string;
  backlog_score_aplicado?: boolean;

  // Automação e Auditoria
  aprovado_auto?: boolean;
  aprovado_auto_em?: string;
  aprovado_auto_regra?: string;
  aprovado_manual?: boolean;
  reprovado_manual?: boolean;
  cancelado_manual?: boolean;
}

export interface CertificationSchedule {
  id: string;
  groupId: string;
  title: string;
  technicianId: string;
  analystId: string;
  datetime: string;
  type: ExpertiseType;
  location?: string;
  status: ScheduleStatus;
  meetingLink?: string;
  availabilitySlotId: string;
  shift: Shift;
  forcado?: boolean;
  regrasBurladas?: string[];
  technology?: string; 
}

export interface EventSchedule {
  id: string;
  groupId: string;
  title: string;
  type: 'Training' | 'Meeting' | 'Day Off' | 'Banked Hours' | 'Other';
  startDatetime: string;
  endDatetime: string;
  involvedUserIds: string[];
  locationId?: string;
  shift: Shift;
  color?: string;
}

export interface SchedulingConfig {
  smartPrioritizationEnabled: boolean;
  weightCity: number;
  weightPending: number;
  weightActive: number;
}

export interface AnalystDemandMetrics {
  cityCount: number;
  pendingPresentialCount: number;
  activePresentialCount: number;
  demandIndex: number;
  level: 'BAIXA' | 'MÉDIA' | 'ALTA';
}
