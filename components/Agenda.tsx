
import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { dataService } from '../services/dataService';
import { User, UserRole, EventSchedule, Shift, ExpertiseType, ScheduleStatus, CertificationSchedule } from '../types';
import { auditService } from '../services/auditService';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core';

import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';

import { CSS } from '@dnd-kit/utilities';

interface AgendaProps {
  user: User;
}

interface Selection {
  userId: string;
  dateIso: string;
  rect: DOMRect;
}

const OUTROS_PALETTE = [
  { id: 'SKY_BLUE', color: '#81D4FA', label: 'Azul Claro' },
  { id: 'LAVENDER', color: '#B39DDB', label: 'Roxo Claro' },
  { id: 'TEAL', color: '#4DB6AC', label: 'Ciano' },
  { id: 'GOLD', color: '#FFF176', label: 'Amarelo' },
  { id: 'PINK', color: '#F48FB1', label: 'Rosa' },
  { id: 'BROWN', color: '#A18879', label: 'Marrom' },
  { id: 'SILVER', color: '#CFD8DC', label: 'Cinza Claro' }
];

const Agenda: React.FC<AgendaProps> = ({ user }) => {
  const analysts = useMemo(() => {
  const regionOrder = ['CO', 'SC', 'PR', 'RS', 'NO'];

  const normalize = (str: string) =>
  (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();

const getRegion = (user: any) => {
  const name = normalize(user.normalizedLogin);

  const map: Record<string, string> = {
    'ANTONYO': 'CO',
    'ENICIO': 'CO',
    'MATHEUS': 'CO',

    'FABIO': 'SC',
    'RITIERRI': 'SC',
    'WILLIAN': 'SC',

    'REGINALDO': 'PR',
    'THIAGO': 'PR',

    'JULIANO': 'RS',
    'RODRIGO': 'RS',
    'ELTON': 'RS',

    'TEMISTOCLES': 'NO',
    'MARCIO': 'NO'
  };

  return map[name] || 'ZZ';
};

  return dataService
    .getUsers()
    .filter(
      u =>
        u.role === UserRole.ANALYST &&
        u.active === true &&
        (user.role === UserRole.ADMIN || u.groupId === user.groupId)
    )
    .sort((a, b) => {
      const regionA = getRegion(a);
      const regionB = getRegion(b);

      const regionDiff =
        regionOrder.indexOf(regionA) - regionOrder.indexOf(regionB);

      if (regionDiff !== 0) return regionDiff;

      return (a.normalizedLogin || '').localeCompare(
        b.normalizedLogin || '',
        'pt-BR'
      );
    });
}, [user]);

  
  const AGENDA_ANALYST_ORDER_KEY = `agenda_analyst_order_${user.groupId || 'GERAL'}`;

const sensors = useSensors(
  useSensor(PointerSensor, {
    activationConstraint: {
      distance: 8
    }
  })
);

const [analystOrder, setAnalystOrder] = useState<string[]>(() => {
  try {
    const saved = localStorage.getItem(AGENDA_ANALYST_ORDER_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
});

  const sortedAnalysts = useMemo(() => {
  if (!analystOrder.length) return analysts;

  const orderMap = new Map(
    analystOrder.map((id, index) => [String(id), index])
  );

  return [...analysts].sort((a, b) => {
    const indexA = orderMap.has(String(a.id))
      ? orderMap.get(String(a.id))!
      : 9999;

    const indexB = orderMap.has(String(b.id))
      ? orderMap.get(String(b.id))!
      : 9999;

    if (indexA !== indexB) return indexA - indexB;

    return (a.normalizedLogin || '').localeCompare(
      b.normalizedLogin || '',
      'pt-BR'
    );
  });
}, [analysts, analystOrder]);

  const [events, setEvents] = useState<EventSchedule[]>(dataService.getEvents());
  const [schedules, setSchedules] = useState(dataService.getSchedules());
  const [isTestMode, setIsTestMode] = useState(dataService.isTestMode());
  const [selection, setSelection] = useState<Selection | null>(null);
  const [movementMode, setMovementMode] = useState(false);
  const [pendingMove, setPendingMove] = useState<{
  itemType: 'SCHEDULE' | 'EVENT';
  scheduleId?: string;
  eventId?: string;
  technicianName: string;
  technicianId?: string;
  fromAnalystId: string;
  fromDateIso: string;
  fromShift: Shift;
  toAnalystId: string;
  toDateIso: string;
} | null>(null);
  const [splitMove, setSplitMove] = useState<{
  sourceAnalystId: string;
  sourceDateIso: string;
  sourceShift: 'MORNING' | 'AFTERNOON';
  sourceTechnology: string;
  sourceModality: string;
  targetAnalystId: string;
  targetDateIso: string;
  targetShift: Shift;
  rect: DOMRect;
} | null>(null);

const [transportingMove, setTransportingMove] = useState<{
  itemType: 'SCHEDULE' | 'EVENT';
  sourceAnalystId: string;
  sourceDateIso: string;
  sourceShift: Shift;
  sourceTechnology?: string;
  sourceModality?: string;
  scheduleId?: string;
  eventId?: string;
  technicianName?: string;
} | null>(null);

const [movedScheduleIds, setMovedScheduleIds] = useState<string[]>([]);

const [technicians, setTechnicians] = useState(dataService.getTechnicians());

const [hoverTooltip, setHoverTooltip] = useState<{
  visible: boolean;
  x: number;
  y: number;
  analystId: string;
  dateIso: string;
  shift: 'MORNING' | 'AFTERNOON';
  technology: string;
  modality: string;
} | null>(null);
  
  const [isImprovisoModal, setIsImprovisoModal] = useState(false);
const [improvisoShift, setImprovisoShift] = useState<Shift>(Shift.MORNING);
const [impactCount, setImpactCount] = useState(0);
const [improvisoReason, setImprovisoReason] = useState('');

  const [isOutrosModalOpen, setIsOutrosModalOpen] = useState(false);
  
  
  // Default Silver

  const [isRangeModalOpen, setIsRangeModalOpen] = useState(false);
  const [rangeAnalystId, setRangeAnalystId] = useState('');
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [rangeTitle, setRangeTitle] = useState('FÉRIAS');

  const TRAINING_OPTIONS = [
  'INST HFC',
  'INST GPON',
  'GPON VETERANO',
  'NR',
  'AT',
  'MDU HFC',
  'REDE EXTERNA',
    'HFC PARA GPON',
  
] as const;

const LESSON_OPTIONS = ['1','2','3','4','5','6','7','8','9'];


const OTHER_REASON_OPTIONS = ['FOLGA', 'ADM', 'MÉDICO', 'OUTROS'] as const;
  
const STANDARD_EVENT_COLORS = {
  TRAINING: {
    'INST GPON': '#1D4ED8',       // azul forte
    'INST HFC': '#0F766E',        // verde petróleo
    'AT': '#7C3AED',              // roxo
    'GPON VETERANO': '#C2410C',   // laranja queimado
    'MDU HFC': '#BE185D',         // rosa escuro
    'REDE EXTERNA': '#15803D',    // verde
    'NR': '#334155',               // azul acinzentado
    'HFC PARA GPON': '#9333EA',
  },
  OTHER: {
    'FOLGA': '#6B7280',           // cinza
    'ADM': '#B91C1C',             // vermelho
    'MÉDICO': '#0891B2',          // ciano
    'OUTROS': '#A16207'           // mostarda escura
  }
} as const;
  
const [isTrainingModalOpen, setIsTrainingModalOpen] = useState(false);
const [trainingType, setTrainingType] = useState<(typeof TRAINING_OPTIONS)[number]>('INST HFC');
const [trainingLesson, setTrainingLesson] = useState('');
const [trainingShift, setTrainingShift] = useState<Shift>(Shift.MORNING);

const [isVacationModalOpen, setIsVacationModalOpen] = useState(false);
const [vacationEndDate, setVacationEndDate] = useState('');

const [isHolidayModalOpen, setIsHolidayModalOpen] = useState(false);
const [holidayTarget, setHolidayTarget] = useState<'ONE' | 'ALL'>('ONE');

const [otherReasonType, setOtherReasonType] = useState<(typeof OTHER_REASON_OPTIONS)[number]>('FOLGA');
const [otherReasonText, setOtherReasonText] = useState('');
const [otherReasonShift, setOtherReasonShift] = useState<Shift>(Shift.MORNING);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const productionAgendaInputRef = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  useEffect(() => {

    const handleUpdate = () => {
  setEvents(dataService.getEvents());
  setSchedules(dataService.getSchedules());
  setTechnicians(dataService.getTechnicians());
  setIsTestMode(dataService.isTestMode());
  setHoverTooltip(null);
};
    
    window.addEventListener('data-updated', handleUpdate);
    return () => window.removeEventListener('data-updated', handleUpdate);
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
    
  }, [toast]);

  // Função auxiliar para garantir o cálculo da Segunda-Feira (ISO)
  const getMonday = (date: Date) => {
    const d = new Date(date);
    d.setHours(12, 0, 0, 0); // Evita problemas de fuso horário ao converter para ISO
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); 
    return new Date(d.setDate(diff));
  };

  const [currentMonday, setCurrentMonday] = useState(() => getMonday(new Date()));

  const weekDates = useMemo(() => {
    const dates = [];
    const days = ['SEG', 'TER', 'QUA', 'QUI', 'SEX'];
    for (let i = 0; i < 5; i++) {
      const d = new Date(currentMonday);
      d.setDate(currentMonday.getDate() + i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const iso = `${year}-${month}-${day}`;
      const formatted = `${day}/${month} - ${days[i]}`;
      dates.push({ iso, formatted });
    }
    return dates;
  }, [currentMonday]);

  const navigateWeek = (dir: number) => {
    const d = new Date(currentMonday);
    d.setDate(currentMonday.getDate() + (dir * 7));
    setCurrentMonday(d);
    setSelection(null);
  };

  const COLORS = {
  VIRTUAL: '#00A86B',
  PRESENTIAL: '#1E88E5',
  FERIAS: '#C62828',
  FOLGA: '#757575',
  BLOQUEIO: '#FB8C00',
  IMPREVISTO: '#6A1B9A',
  OUTROS: '#455A64',
  FERIADO: '#000000',
  CQ_SUPPORT: '#4F46E5'
};
  const getCellContent = (userId: string, dateIso: string) => {
    const dayBlocks = events.filter(e => e.involvedUserIds.includes(userId) && e.startDatetime.startsWith(dateIso));
    const daySchs = schedules.filter((s: any) => {
  if (s.analystId !== userId) return false;
  if (!s.datetime?.startsWith(dateIso)) return false;
  if (s.status === ScheduleStatus.CANCELLED) return false;
  if (s.status === 'CANCELLED') return false;
  if (s.status === 'CANCELADO') return false;
  if (s.status === 'CANCELADOS (ANALISTA)') return false;

  const scheduleId = String(s?.id ?? '');
  const technicianId = String(s?.technicianId ?? '');

  const matchedTech = technicians.find((t: any) => {
    const tId = String(t?.id ?? '');
    const scheduledCertificationId = String(t?.scheduledCertificationId ?? '');
    const certificationScheduleId = String(t?.certificationScheduleId ?? '');

    

    return (
      (technicianId && tId === technicianId) ||
      (scheduleId && scheduledCertificationId === scheduleId) ||
      (scheduleId && certificationScheduleId === scheduleId)
    );
  });

  if (!matchedTech) return true;

  const currentScheduleId = String(
    matchedTech?.scheduledCertificationId ||
    matchedTech?.certificationScheduleId ||
    ''
  );

  if (currentScheduleId && currentScheduleId !== scheduleId) {
    return false;
  }

  return true;
});

    const startEventDrag = (
  e: React.DragEvent<HTMLDivElement>,
  event: EventSchedule
) => {
  if (!movementMode) return;

  e.dataTransfer.setData('itemType', 'EVENT');
  e.dataTransfer.setData('eventId', String(event.id || ''));
  e.dataTransfer.setData('technicianName', event.title || 'EVENTO');
  e.dataTransfer.setData('fromAnalystId', userId);
  e.dataTransfer.setData('fromDateIso', dateIso);
  e.dataTransfer.setData('fromShift', String(event.shift));

  setHoverTooltip(null);

  setTransportingMove({
    itemType: 'EVENT',
    sourceAnalystId: userId,
    sourceDateIso: dateIso,
    sourceShift: event.shift,
    eventId: String(event.id || ''),
    technicianName: event.title || 'EVENTO'
  });
};

   const renderCard = (
  title: string,
  color: string,
  mouseHandlers?: {
    onMouseEnter?: (e: React.MouseEvent<HTMLDivElement>) => void;
    onMouseMove?: (e: React.MouseEvent<HTMLDivElement>) => void;
    onMouseLeave?: () => void;
  }
) => (
  <div
    className="w-full h-full flex items-center justify-center font-black text-[12px] uppercase text-white text-center leading-tight px-1 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)] animate-in fade-in duration-300"
    style={{ backgroundColor: color }}
    onMouseEnter={mouseHandlers?.onMouseEnter}
    onMouseMove={mouseHandlers?.onMouseMove}
    onMouseLeave={mouseHandlers?.onMouseLeave}
  >
    <span className="truncate">{title}</span>
  </div>
);

    const formatScheduleTitle = (schs: CertificationSchedule[]) => {
      if (schs.length === 0) return null;
      const first = schs[0];
      const qty = schs.length;
      const period = first.shift === Shift.MORNING ? 'MANHÃ' : first.shift === Shift.AFTERNOON ? 'TARDE' : 'DIA';
      const tech = first.technology || 'GPON';
      
      return `${qty} ${period} ${tech}`;
    };

    const fullDayBlock = dayBlocks.find(b => b.shift === Shift.FULL_DAY);
    if (fullDayBlock) {
      const title = fullDayBlock.title.toUpperCase();
      let color = COLORS.BLOQUEIO;
      if (title.includes('FÉRIAS')) color = COLORS.FERIAS;
        else if (title.includes('CQ_SUPPORT')) color = COLORS.CQ_SUPPORT;
else if (title.includes('FOLGA')) color = COLORS.FOLGA;
else if (title.includes('IMPREVISTO')) color = COLORS.IMPREVISTO;
else if (title.includes('OUTROS')) {
  color = fullDayBlock.color || COLORS.OUTROS;
}
else if (title.includes('FERIADO')) color = COLORS.FERIADO;
else if (title.includes('ETN ') || title.includes('TREINAMENTO')) {
  color = fullDayBlock.color || COLORS.OUTROS;
}

      const displayTitle =
  title === 'CQ_SUPPORT'
    ? 'APOIO CQ'
    : title
        .replace('OUTROS - ', '')
        .replace('IMPREVISTO - ', '');

return (
  <div
    draggable={movementMode}
    onDragStart={(e) => startEventDrag(e, fullDayBlock)}
    className="w-full h-full"
  >
    {renderCard(displayTitle, color)}
  </div>
);
    }

    const morningBlock = dayBlocks.find(b => b.shift === Shift.MORNING);
    const afternoonBlock = dayBlocks.find(b => b.shift === Shift.AFTERNOON);
    
    const morningSchs = daySchs.filter(s => s.shift === Shift.MORNING);
    const afternoonSchs = daySchs.filter(s => s.shift === Shift.AFTERNOON);

    return (
  <div className="flex flex-col h-full w-full overflow-hidden">
    <div className="flex-1 flex overflow-hidden border-b border-white/20">
      {morningBlock
  ? (
    <div
      draggable={movementMode}
      onDragStart={(e) => startEventDrag(e, morningBlock)}
      className="w-full h-full"
    >
      {renderCard(
        morningBlock.title
          .replace('OUTROS - ', '')
          .replace('IMPREVISTO - ', ''),
        morningBlock.color || (
          morningBlock.title.includes('FÉRIAS') ? COLORS.FERIAS :
          morningBlock.title.includes('FOLGA') ? COLORS.FOLGA :
          morningBlock.title.includes('IMPREVISTO') ? COLORS.IMPREVISTO :
          morningBlock.title.includes('OUTROS') ? COLORS.OUTROS :
          (morningBlock.title.includes('ETN ') || morningBlock.title.includes('TREINAMENTO')) ? COLORS.OUTROS :
          COLORS.BLOQUEIO
        )
      )}
    </div>
  )
                : morningSchs.length > 0
          ? (
            <div
              draggable={movementMode}
              onDragStart={(e) => {
                if (!movementMode) return;

                const firstSchedule = morningSchs[0];

                e.dataTransfer.setData('itemType', 'SCHEDULE');

                e.dataTransfer.setData('scheduleId', firstSchedule.id);
                e.dataTransfer.setData('technicianName', 'LOTE / BLOCO');
                e.dataTransfer.setData('fromAnalystId', userId);
                e.dataTransfer.setData('fromDateIso', dateIso);
                e.dataTransfer.setData('fromShift', String(firstSchedule.shift));
                e.dataTransfer.setData('fromTechnology', firstSchedule.technology || 'GPON');
e.dataTransfer.setData(
  'fromModality',
  firstSchedule.type === ExpertiseType.VIRTUAL ? 'VIRTUAL' : 'PRESENCIAL'
);

                setHoverTooltip(null);
startScheduleTransport(userId, dateIso, firstSchedule);
              }}
              className="w-full h-full"
            >
              {renderCard(
                formatScheduleTitle(morningSchs)!,
                morningSchs[0].type === ExpertiseType.VIRTUAL ? COLORS.VIRTUAL : COLORS.PRESENTIAL,
                {
                  onMouseEnter: (e) =>
                    openAgendaTooltip(e, {
                      analystId: userId,
                      dateIso,
                      shift: 'MORNING',
                      technology: morningSchs[0].technology || 'GPON',
                      modality:
                        morningSchs[0].type === ExpertiseType.VIRTUAL ? 'VIRTUAL' : 'PRESENTIAL',
                    }),
                  onMouseMove: moveAgendaTooltip,
                  onMouseLeave: closeAgendaTooltip,
                }
              )}
            </div>
          )
          : null}
    </div>
            
            

        <div className="flex-1 flex overflow-hidden">
      {afternoonBlock
  ? (
    <div
      draggable={movementMode}
      onDragStart={(e) => startEventDrag(e, afternoonBlock)}
      className="w-full h-full"
    >
      {renderCard(
        afternoonBlock.title
          .replace('OUTROS - ', '')
          .replace('IMPREVISTO - ', ''),
        afternoonBlock.color || (
          afternoonBlock.title.includes('FÉRIAS') ? COLORS.FERIAS :
          afternoonBlock.title.includes('FOLGA') ? COLORS.FOLGA :
          afternoonBlock.title.includes('IMPREVISTO') ? COLORS.IMPREVISTO :
          afternoonBlock.title.includes('OUTROS') ? COLORS.OUTROS :
          (afternoonBlock.title.includes('ETN ') || afternoonBlock.title.includes('TREINAMENTO')) ? COLORS.OUTROS :
          COLORS.BLOQUEIO
        )
      )}
    </div>
  )
        : afternoonSchs.length > 0
          ? (
            <div
              draggable={movementMode}
              onDragStart={(e) => {
                if (!movementMode) return;

                const firstSchedule = afternoonSchs[0];

                e.dataTransfer.setData('itemType', 'SCHEDULE');

                e.dataTransfer.setData('scheduleId', firstSchedule.id);
                e.dataTransfer.setData('technicianName', 'LOTE / BLOCO');
                e.dataTransfer.setData('fromAnalystId', userId);
                e.dataTransfer.setData('fromDateIso', dateIso);
                e.dataTransfer.setData('fromShift', String(firstSchedule.shift));
                e.dataTransfer.setData('fromTechnology', firstSchedule.technology || 'GPON');
e.dataTransfer.setData(
  'fromModality',
  firstSchedule.type === ExpertiseType.VIRTUAL ? 'VIRTUAL' : 'PRESENCIAL'
);

                setHoverTooltip(null);
startScheduleTransport(userId, dateIso, firstSchedule);
              }}
              className="w-full h-full"
            >
              {renderCard(
                formatScheduleTitle(afternoonSchs)!,
                afternoonSchs[0].type === ExpertiseType.VIRTUAL ? COLORS.VIRTUAL : COLORS.PRESENTIAL,
                {
                  onMouseEnter: (e) =>
                    openAgendaTooltip(e, {
                      analystId: userId,
                      dateIso,
                      shift: 'AFTERNOON',
                      technology: afternoonSchs[0].technology || 'GPON',
                      modality:
                        afternoonSchs[0].type === ExpertiseType.VIRTUAL ? 'VIRTUAL' : 'PRESENTIAL',
                    }),
                  onMouseMove: moveAgendaTooltip,
                  onMouseLeave: closeAgendaTooltip,
                }
              )}
            </div>
          )
          : null}
    </div>
  </div>
);
};
      

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][];
        const inserted = dataService.importTestSchedules(rawData);
        setToast({message: `${inserted} agendamentos de teste importados!`, type: 'success'});
      } catch (err: any) {
        setToast({message: 'Falha ao importar: ' + err.message, type: 'error'});
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const exportSharePointAgenda = () => {
  const rows = schedules
    .filter((s: any) =>
      s.status !== ScheduleStatus.CANCELLED &&
      s.status !== 'CANCELLED' &&
      s.status !== 'CANCELADO' &&
      s.status !== 'CANCELADOS (ANALISTA)'
    )
    .map((s: any) => {
      const analyst = analysts.find(a => String(a.id) === String(s.analystId));

      const tech = technicians.find((t: any) =>
        String(t.id) === String(s.technicianId) ||
        String(t.scheduledCertificationId) === String(s.id) ||
        String(t.certificationScheduleId) === String(s.id)
      );

      const dateIso = String(s.datetime || '').split('T')[0];
      const time = String(s.datetime || '').split('T')[1]?.replace('Z', '').slice(0, 5) || '';

      const tipo =
        s.type === ExpertiseType.VIRTUAL
          ? 'VIRTUAL'
          : 'PRESENCIAL';

      return {
        STATUS: 'AGENDADO',
        ANALISTA: analyst?.normalizedLogin || s.analystName || s.analystId || '',
        DATA: formatDateBR(dateIso),
        'PROVA TEÓRICA': time,
        'PROVA PRÁTICA': '',
        TÉCNICO: tech?.name || tech?.fullName || s.technicianName || '',
        EMPRESA: tech?.companyPartner || tech?.company || s.company || '',
        CIDADE: `${tech?.city || s.city || ''}${tech?.state || s.state ? ' / ' + (tech?.state || s.state) : ''}`,
        TIPO: tipo,
        OBSERVAÇÃO: ''
      };
    });

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, 'SHAREPOINT_RAW');

  XLSX.writeFile(workbook, `Agenda_SharePoint_${new Date().toISOString().slice(0, 10)}.xlsx`);
};

  const handleImportProductionAgenda = (rawData: any[][]) => {
  const inserted = dataService.importProductionSchedules(rawData);
  setToast({
    message: `${inserted} agendamentos de produção importados!`,
    type: 'success'
  });
};

  const checkImprovisoShift = (shift: Shift) => {
    if (!selection) return;
    const count = dataService.getSchedulesImpactedByImproviso(selection.userId, selection.dateIso, shift).length;
    setImpactCount(count);
    setImprovisoShift(shift);
  };

  const buildTrainingTitle = (type: string, lesson?: string) => {
  const baseMap: Record<string, string> = {
    'INST HFC': 'ETN INST HFC',
    'INST GPON': 'ETN INST GPON',
    'GPON VETERANO': 'ETN GPON VETERANO',
    'NR': 'ETN NR',
    'AT': 'ETN AT',
        'MDU HFC': 'ETN MDU HFC',
    'REDE EXTERNA': 'ETN REDE EXTERNA',
    'HFC PARA GPON': 'ETN HFC PARA GPON',

  };

  const base = baseMap[type] || 'ETN TREINAMENTO';
  return lesson?.trim() ? `${base} - AULA ${lesson}` : base;
};

  const formatDateBR = (dateIso?: string) => {
  if (!dateIso) return '';

  const [year, month, day] = dateIso.split('-');
  if (!year || !month || !day) return dateIso;

  return `${day}/${month}/${year}`;
};

    
const closeQuickActionStack = () => {
  setSelection(null);
  setIsTrainingModalOpen(false);
  setIsVacationModalOpen(false);
  setIsHolidayModalOpen(false);
  setIsOutrosModalOpen(false);
  setIsImprovisoModal(false);
};

const saveTrainingEvent = () => {
  if (!selection) return;

  const analyst = analysts.find(a => a.id === selection.userId);
  const title = buildTrainingTitle(trainingType, trainingLesson || undefined);

  const dayEvents = events.filter(
    e =>
      e.involvedUserIds.includes(selection.userId) &&
      e.startDatetime.startsWith(selection.dateIso)
  );

  const hasFullDay = dayEvents.some(e => e.shift === Shift.FULL_DAY);

  if (hasFullDay && trainingShift !== Shift.FULL_DAY) {
    dataService.removeEvent(selection.userId, selection.dateIso);
  }

  if (trainingShift === Shift.FULL_DAY) {
    dataService.removeEvent(selection.userId, selection.dateIso);
  } else {
    const conflictingEvent = dayEvents.find(e => e.shift === trainingShift);

    if (conflictingEvent) {
      dataService.removeEvent(selection.userId, selection.dateIso);

      dayEvents
        .filter(e => e.id !== conflictingEvent.id && e.shift !== Shift.FULL_DAY)
        .forEach(e => {
          dataService.addEvent({
            ...e,
            id: `${e.id}-restored-${Date.now()}-${Math.random()}`
          });
        });
    }
  }

  dataService.addEvent({
    id: `evt-training-${Date.now()}`,
    groupId: analyst?.groupId || user.groupId,
    title,
    type: 'Other',
    startDatetime: `${selection.dateIso}T00:00:00Z`,
    endDatetime: `${selection.dateIso}T23:59:59Z`,
    involvedUserIds: [selection.userId],
    shift: trainingShift,
    color: STANDARD_EVENT_COLORS.TRAINING[trainingType] || '#111827'
  });

  auditService.logTicket({
    user,
    action: 'LANCAR_TREINAMENTO',
    targetType: 'Analista',
    targetValue: analyst?.normalizedLogin || selection.userId,
    reason: `Treinamento ${title} lançado em ${formatDateBR(selection.dateIso)} (${trainingShift}).`,
    screen: 'Agenda',
    groupId: user.groupId
  });

  setToast({ message: 'Treinamento lançado com sucesso.', type: 'success' });
  closeQuickActionStack();
};

const saveVacationRange = () => {
  if (!selection || !vacationEndDate) return;

  dataService.addEventRange(
    selection.userId,
    selection.dateIso,
    vacationEndDate,
    'FÉRIAS',
    'Other'
  );

  auditService.logTicket({
    user,
    action: 'LANCAR_FERIAS',
    targetType: 'Analista',
    targetValue: selection.userId,
    reason: `Férias lançadas de ${formatDateBR(selection.dateIso)} até ${formatDateBR(vacationEndDate)}.`,
    screen: 'Agenda',
    groupId: user.groupId
  });

  setToast({ message: 'Férias lançadas com sucesso.', type: 'success' });
  closeQuickActionStack();
};

const saveOtherReasonEvent = () => {
  if (!selection) return;

  const analyst = analysts.find(a => a.id === selection.userId);

  const finalTitle =
    otherReasonType === 'OUTROS'
      ? `OUTROS - ${(otherReasonText || '').trim() || 'OUTROS'}`
      : `OUTROS - ${otherReasonType}`;

  const dayEvents = events.filter(
    e =>
      e.involvedUserIds.includes(selection.userId) &&
      e.startDatetime.startsWith(selection.dateIso)
  );

  const hasFullDay = dayEvents.some(e => e.shift === Shift.FULL_DAY);

  if (hasFullDay && otherReasonShift !== Shift.FULL_DAY) {
    dataService.removeEvent(selection.userId, selection.dateIso);
  }

  if (otherReasonShift === Shift.FULL_DAY) {
    dataService.removeEvent(selection.userId, selection.dateIso);
  } else {
    const conflictingEvent = dayEvents.find(e => e.shift === otherReasonShift);

    if (conflictingEvent) {
      dataService.removeEvent(selection.userId, selection.dateIso);

      dayEvents
        .filter(e => e.id !== conflictingEvent.id && e.shift !== Shift.FULL_DAY)
        .forEach(e => {
          dataService.addEvent({
            ...e,
            id: `${e.id}-restored-${Date.now()}-${Math.random()}`
          });
        });
    }
  }

  dataService.addEvent({
    id: `evt-other-${Date.now()}`,
    groupId: analyst?.groupId || user.groupId,
    title: finalTitle,
    type: 'Other',
    startDatetime: `${selection.dateIso}T00:00:00Z`,
    endDatetime: `${selection.dateIso}T23:59:59Z`,
    involvedUserIds: [selection.userId],
    shift: otherReasonShift,
    color:
      otherReasonType === 'OUTROS'
        ? STANDARD_EVENT_COLORS.OTHER.OUTROS
        : STANDARD_EVENT_COLORS.OTHER[otherReasonType] || STANDARD_EVENT_COLORS.OTHER.OUTROS
  });

  auditService.logTicket({
    user,
    action: 'LANCAR_OUTROS',
    targetType: 'Analista',
    targetValue: analyst?.normalizedLogin || selection.userId,
    reason: `${finalTitle} lançado em ${formatDateBR(selection.dateIso)} (${otherReasonShift}).`,
    screen: 'Agenda',
    groupId: user.groupId
  });

  setToast({ message: 'Motivo lançado com sucesso.', type: 'success' });
  closeQuickActionStack();
};

const saveHolidayEvent = () => {
  if (!selection) return;

  const targetIds =
    holidayTarget === 'ALL'
      ? analysts.map(a => a.id)
      : [selection.userId];

  targetIds.forEach((analystId) => {
    const analyst = analysts.find(a => a.id === analystId);

    dataService.removeEvent(analystId, selection.dateIso);

    dataService.addEvent({
      id: `evt-holiday-${Date.now()}-${Math.random()}`,
      groupId: analyst?.groupId || user.groupId,
      title: 'FERIADO',
      type: 'Other',
      startDatetime: `${selection.dateIso}T00:00:00Z`,
      endDatetime: `${selection.dateIso}T23:59:59Z`,
      involvedUserIds: [analystId],
      shift: Shift.FULL_DAY,
      color: '#000000'
    });

    auditService.logTicket({
      user,
      action: 'LANCAR_FERIADO',
      targetType: 'Analista',
      targetValue: analyst?.normalizedLogin || analystId,
      reason: `Feriado lançado em ${formatDateBR(selection.dateIso)}${holidayTarget === 'ALL' ? ' para todos os analistas' : ''}.`,
      screen: 'Agenda',
      groupId: user.groupId
    });
  });

  setToast({ message: 'Feriado lançado com sucesso.', type: 'success' });
  closeQuickActionStack();
};

const setStatus = (title: string | null, shift: Shift = Shift.FULL_DAY, color?: string) => {
  if (!selection) return;

  const analyst = analysts.find(a => a.id === selection.userId);

  const existingFullDayBlock = events.find(
    e =>
      e.involvedUserIds.includes(selection.userId) &&
      e.startDatetime.startsWith(selection.dateIso) &&
      e.shift === Shift.FULL_DAY
  );

  if (title === 'IMPREVISTO' && !isImprovisoModal) {
    checkImprovisoShift(Shift.FULL_DAY);
    setImprovisoReason('');
    setIsImprovisoModal(true);
    return;
  }

  if (title === 'OUTROS' && !isOutrosModalOpen) {
    setOtherReasonType('FOLGA');
    setOtherReasonText('');
    setOtherReasonShift(Shift.MORNING);
    setIsOutrosModalOpen(true);
    return;
  }

  if (
    title === 'IMPREVISTO' &&
    existingFullDayBlock &&
    shift !== Shift.FULL_DAY &&
    (
      existingFullDayBlock.title.toUpperCase().includes('FERIADO') ||
      existingFullDayBlock.title.toUpperCase().includes('OUTROS')
    )
  ) {
    dataService.removeEvent(selection.userId, selection.dateIso);

    const oppositeShift =
      shift === Shift.MORNING ? Shift.AFTERNOON : Shift.MORNING;

    dataService.addEvent({
      id: `evt-split-${Date.now()}`,
      groupId: existingFullDayBlock.groupId,
      title: existingFullDayBlock.title,
      type: existingFullDayBlock.type,
      startDatetime: existingFullDayBlock.startDatetime,
      endDatetime: existingFullDayBlock.endDatetime,
      involvedUserIds: existingFullDayBlock.involvedUserIds,
      shift: oppositeShift,
      color: existingFullDayBlock.color,
    });
  } else if (shift === Shift.FULL_DAY) {
    dataService.removeEvent(selection.userId, selection.dateIso);
  }

  if (title === 'IMPREVISTO' && isImprovisoModal) {
    dataService.applyImprovisoCancellation(selection.userId, selection.dateIso, shift);

    auditService.logTicket({
      user,
      action: 'LANCAR_IMPROVISO',
      targetType: 'Analista',
      targetValue: analyst?.normalizedLogin || selection.userId,
      reason: `Imprevisto lançado em ${formatDateBR(selection.dateIso)} (${shift})${improvisoReason ? ` - ${improvisoReason}` : ''}.`,
      screen: 'Agenda',
      groupId: user.groupId
    });
  }

  if (title) {
    const finalTitle =
      title === 'OUTROS'
        ? (
            otherReasonType === 'OUTROS'
              ? ((otherReasonText || '').trim() ? `OUTROS - ${otherReasonText.trim()}` : 'OUTROS')
              : `OUTROS - ${otherReasonType}`
          )
        : title === 'IMPREVISTO'
          ? ((improvisoReason || '').trim() ? `IMPREVISTO - ${improvisoReason.trim()}` : 'IMPREVISTO')
          : title;
    if (title === 'CQ_SUPPORT') {
  dataService.addCqSupportEvent({
    analystId: selection.userId,
    dateIso: selection.dateIso,
    shift: Shift.FULL_DAY,
    capacityExtra: 6,
    notes: 'Apoio CQ lançado pela agenda'
  });

  setToast({ message: 'Apoio CQ lançado com sucesso (+6 vagas).', type: 'success' });
  setSelection(null);
  return;
}

    dataService.addEvent({
      id: `evt-${Date.now()}`,
      groupId: analyst?.groupId || user.groupId || 'G3',
      title: finalTitle,
      type: 'Other',
      startDatetime: `${selection.dateIso}T00:00:00Z`,
      endDatetime: `${selection.dateIso}T23:59:59Z`,
      involvedUserIds: [selection.userId],
      shift,
      color: title === 'OUTROS' ? color : undefined
    });

    if (title === 'IMPREVISTO') {
      setToast({
        message: `Imprevisto lançado e ${impactCount} técnicos cancelados.`,
        type: 'success'
      });
    }
  } else if (title === null) {
    dataService.removeEvent(selection.userId, selection.dateIso);

    auditService.logTicket({
      user,
      action: 'LIMPAR_CELULA',
      targetType: 'Analista',
      targetValue: analyst?.normalizedLogin || selection.userId,
      reason: `Agenda limpa em ${formatDateBR(selection.dateIso)}.`,
      screen: 'Agenda',
      groupId: user.groupId
    });
  }

  setSelection(null);
  setIsImprovisoModal(false);
  setImprovisoReason('');
  setIsOutrosModalOpen(false);
};

  const getVisualScheduleTime = (
  modality: string,
  shift: 'MORNING' | 'AFTERNOON',
  position: number
) => {
  const isPresential = modality.toUpperCase().includes('PRES');

  if (isPresential) {
    if (shift === 'MORNING') {
      if (position === 1) return '09:00';
      if (position === 2) return '10:00';
      if (position === 3) return '11:00';
    }

    if (shift === 'AFTERNOON') {
      if (position === 1) return '14:00';
      if (position === 2) return '15:00';
      if (position === 3) return '16:00';
    }
  } else {
    if (shift === 'MORNING') {
      if (position === 1) return '09:30';
      if (position === 2) return '10:30';
    }

    if (shift === 'AFTERNOON') {
      if (position === 1) return '14:30';
      if (position === 2) return '15:30';
    }
  }

  return 'N/D';
};

const buildAgendaTooltipData = (
  analystId: string,
  dateIso: string,
  shift: 'MORNING' | 'AFTERNOON',
  technology: string,
  modality: string
) => {

const sameDaySchedules = schedules.filter((s: any) => {
  if (!s?.datetime) return false;
  if (s.status === ScheduleStatus.CANCELLED) return false;
  if (s.status === 'CANCELLED') return false;
  if (s.status === 'CANCELADO') return false;
  if (s.status === 'CANCELADOS (ANALISTA)') return false;

  return s.datetime.split('T')[0] === dateIso;
});

const sameAnalystSchedules = sameDaySchedules.filter((s: any) => {
  return String(s?.analystId ?? '') === String(analystId ?? '');
});

const normalizeShiftText = (value: any) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();

let relatedSchedules = sameAnalystSchedules.filter((s: any) => {
  const scheduleShift = normalizeShiftText(s?.shift);
  const targetShift = normalizeShiftText(shift);

  const matchesShift =
    targetShift === 'MORNING'
      ? (
          scheduleShift === 'MORNING' ||
          scheduleShift === 'MANHA' ||
          scheduleShift.includes('MORNING') ||
          scheduleShift.includes('MANHA')
        )
      : (
          scheduleShift === 'AFTERNOON' ||
          scheduleShift === 'TARDE' ||
          scheduleShift.includes('AFTERNOON') ||
          scheduleShift.includes('TARDE')
        );

  if (!matchesShift) return false;

  const scheduleTechnology = String(
  s?.technology || ''
).toUpperCase().trim();

const targetTechnology = String(
  technology || ''
).toUpperCase().trim();

// Só valida tecnologia se ambos existirem
if (
  scheduleTechnology &&
  targetTechnology &&
  scheduleTechnology !== targetTechnology
) {
  return false;
}

const scheduleModality =
  s?.type === ExpertiseType.VIRTUAL
    ? 'VIRTUAL'
    : 'PRESENCIAL';

const targetModality = String(modality || '')
  .toUpperCase()
  .trim()
  .replace('PRESENTIAL', 'PRESENCIAL');

// Só valida modalidade se existir
if (
  targetModality &&
  scheduleModality !== targetModality
) {
  return false;
}

  return true;
});

  relatedSchedules = relatedSchedules.sort((a: any, b: any) => {
  const dateDiff =
    new Date(a?.datetime ?? '').getTime() - new Date(b?.datetime ?? '').getTime();

  if (dateDiff !== 0) return dateDiff;
  return String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
});
if (!relatedSchedules.length) {
  return [];
}

relatedSchedules = relatedSchedules.filter((schedule: any) => {
  const scheduleId = String(schedule?.id ?? '');
  const technicianId = String(schedule?.technicianId ?? '');

  const matchedTech = technicians.find((t: any) => {
    const tId = String(t?.id ?? '');
    const scheduledCertificationId = String(t?.scheduledCertificationId ?? '');
    const certificationScheduleId = String(t?.certificationScheduleId ?? '');

    return (
      (technicianId && tId === technicianId) ||
      (scheduleId && scheduledCertificationId === scheduleId) ||
      (scheduleId && certificationScheduleId === scheduleId)
    );
  });

  if (!matchedTech) return true;

  const currentScheduleId = String(
    matchedTech?.scheduledCertificationId ||
    matchedTech?.certificationScheduleId ||
    ''
  );

  if (currentScheduleId && currentScheduleId !== scheduleId) {
    return false;
  }

  return true;
});

const items = relatedSchedules.map((schedule: any, index: number) => {
  const scheduleId = String(schedule?.id ?? '');
  const technicianId = String(
    schedule?.technicianId ??
    schedule?.techId ??
    schedule?.userId ??
    schedule?.technician?.id ??
    ''
  );

  const scheduleCpf = String(
    schedule?.cpf ??
    schedule?.technicianCpf ??
    schedule?.user?.cpf ??
    schedule?.technician?.cpf ??
    ''
  ).replace(/\D/g, '');

  const scheduleUniqueKey = String(
    schedule?.unique_key ??
    schedule?.uniqueKey ??
    schedule?.technicianUniqueKey ??
    schedule?.technician?.unique_key ??
    schedule?.technician?.uniqueKey ??
    ''
  );

  const matchedTech = technicians.find((t: any) => {
    const tId = String(t?.id ?? '');
    const scheduledCertificationId = String(t?.scheduledCertificationId ?? '');
    const certificationScheduleId = String(t?.certificationScheduleId ?? '');
    const currentScheduleId = String(t?.scheduleId ?? '');
    const currentTechId = String(t?.technicianId ?? '');
    const techCpf = String(t?.cpf ?? '').replace(/\D/g, '');
    const techUniqueKey = String(t?.unique_key ?? t?.uniqueKey ?? '');

    return (
      (scheduleId && scheduledCertificationId === scheduleId) ||
      (scheduleId && certificationScheduleId === scheduleId) ||
      (scheduleId && currentScheduleId === scheduleId) ||
      (technicianId && tId === technicianId) ||
      (technicianId && currentTechId === technicianId) ||
      (scheduleCpf && techCpf === scheduleCpf) ||
      (scheduleUniqueKey && techUniqueKey === scheduleUniqueKey)
    );
  });

  const technicianName =
    matchedTech?.name ||
    matchedTech?.fullName ||
    schedule?.technicianName ||
    schedule?.techName ||
    schedule?.name ||
    schedule?.user?.name ||
    schedule?.technician?.name ||
    'N/D';

  const technicianCity =
  matchedTech?.city ||
  schedule?.city ||
  schedule?.user?.city ||
  schedule?.technician?.city ||
  'N/D';

const technicianState =
  matchedTech?.state ||
  schedule?.state ||
  schedule?.user?.state ||
  schedule?.technician?.state ||
  '';

const technicianPartner =
  matchedTech?.companyPartner ||
  matchedTech?.company ||
  matchedTech?.empresaParceiro ||
  matchedTech?.partner ||
  schedule?.companyPartner ||
  schedule?.company ||
  schedule?.empresaParceiro ||
  schedule?.partner ||
  schedule?.user?.company ||
  schedule?.technician?.company ||
  'N/D';

return {
  scheduleId,
  technicianId,
  time: getVisualScheduleTime(modality, shift, index + 1),
  technician: technicianName,
  city: `${technicianCity}${technicianState ? ' / ' + technicianState : ''}`,
  partner: technicianPartner,
};
});

return items;
  
};

const openAgendaTooltip = (
  e: React.MouseEvent,
  params: {
    analystId: string;
    dateIso: string;
    shift: 'MORNING' | 'AFTERNOON';
    technology: string;
    modality: string;
  }
) => {
  const tooltipWidth = 340;
  const tooltipHeight = 360;
  const offset = 16;

  let x = e.clientX + offset;
  let y = e.clientY + offset;

  if (x + tooltipWidth > window.innerWidth - 20) {
    x = e.clientX - tooltipWidth - offset;
  }

  if (y + tooltipHeight > window.innerHeight - 20) {
    y = e.clientY - tooltipHeight - offset;
  }

  if (x < 12) x = 12;
  if (y < 12) y = 12;

  setHoverTooltip({
    visible: true,
    x,
    y,
    analystId: params.analystId,
    dateIso: params.dateIso,
    shift: params.shift,
    technology: params.technology,
    modality: params.modality.toUpperCase().includes('PRES') ? 'PRESENCIAL' : 'VIRTUAL'
  });
};

const moveAgendaTooltip = (e: React.MouseEvent) => {
  const tooltipWidth = 340;
  const tooltipHeight = 360;
  const offset = 16;

  let x = e.clientX + offset;
  let y = e.clientY + offset;

  if (x + tooltipWidth > window.innerWidth - 20) {
    x = e.clientX - tooltipWidth - offset;
  }

  if (y + tooltipHeight > window.innerHeight - 20) {
    y = e.clientY - tooltipHeight - offset;
  }

  if (x < 12) x = 12;
  if (y < 12) y = 12;

  setHoverTooltip((prev) => {
    if (!prev) return prev;

    return {
      ...prev,
      x,
      y
    };
  });
};

const closeAgendaTooltip = () => {
  setHoverTooltip(null);
};
  const getTargetShiftFromCell = (
  e: React.MouseEvent<HTMLTableCellElement> | React.DragEvent<HTMLTableCellElement>
): Shift => {
  const rect = e.currentTarget.getBoundingClientRect();
  const relativeY = e.clientY - rect.top;

  return relativeY <= rect.height / 2 ? Shift.MORNING : Shift.AFTERNOON;
};

const startScheduleTransport = (
  sourceAnalystId: string,
  sourceDateIso: string,
  firstSchedule: CertificationSchedule
) => {
  setTransportingMove({
    itemType: 'SCHEDULE',
    sourceAnalystId,
    sourceDateIso,
    sourceShift: firstSchedule.shift,
    sourceTechnology: firstSchedule.technology || 'GPON',
    sourceModality:
      firstSchedule.type === ExpertiseType.VIRTUAL
        ? 'VIRTUAL'
        : 'PRESENCIAL',
    scheduleId: firstSchedule.id,
    technicianName: 'LOTE / BLOCO'
  });
};
  
  const getLiveTooltipItems = () => {
  if (!hoverTooltip) return [];

  return buildAgendaTooltipData(
    hoverTooltip.analystId,
    hoverTooltip.dateIso,
    hoverTooltip.shift,
    hoverTooltip.technology,
    hoverTooltip.modality
  );
};
  const validateMovementTarget = (
  analystId: string,
  dateIso: string
) => {
  const daySchedules = schedules.filter(
    s =>
      s.analystId === analystId &&
      s.datetime.startsWith(dateIso) &&
      s.status !== ScheduleStatus.CANCELLED
  );

  const hasVirtual = daySchedules.some(
    s => s.type === ExpertiseType.VIRTUAL
  );

  const hasPresential = daySchedules.some(
    s => s.type === ExpertiseType.PRESENTIAL
  );

  const blocked = events.some(
    e =>
      e.involvedUserIds.includes(analystId) &&
      e.startDatetime.startsWith(dateIso)
  );

  return {
    blocked,
    hasVirtual,
    hasPresential
  };
};
  const confirmPendingMove = () => {
  if (!pendingMove) return;

  if (pendingMove.itemType === 'EVENT') {
    const event = events.find(
      (e: any) => String(e.id) === String(pendingMove.eventId)
    );

    if (!event) {
      setToast({
        message: 'Evento não encontrado para movimentação.',
        type: 'error'
      });
      setPendingMove(null);
      return;
    }

    const result = dataService.updateEventById(String(pendingMove.eventId), {
  involvedUserIds: [pendingMove.toAnalystId],
  startDatetime: `${pendingMove.toDateIso}T00:00:00Z`,
  endDatetime: `${pendingMove.toDateIso}T23:59:59Z`,
  shift: event.shift || pendingMove.fromShift
});

if (!result.success) {
  setToast({
    message: result.message || 'Erro ao movimentar evento.',
    type: 'error'
  });
  return;
}

setEvents(dataService.getEvents());
setHoverTooltip(null);
setPendingMove(null);
setTransportingMove(null);

setToast({
  message: 'Evento movimentado com sucesso.',
  type: 'success'
});

return;
  }

  const schedule = schedules.find((s: any) =>
    pendingMove.technicianId
      ? String(s.technicianId) === String(pendingMove.technicianId)
      : String(s.id) === String(pendingMove.scheduleId)
  );

  if (!schedule) {
    setToast({
      message: 'Agendamento não encontrado para movimentação.',
      type: 'error'
    });
    setPendingMove(null);
    return;
  }

  const targetDate = pendingMove.toDateIso;
  const rawTime = String(schedule.datetime || '').split('T')[1] || '09:00:00';
const originalTime = rawTime.replace('Z', '');

  const result = dataService.updateScheduleById(schedule.id, {
    analystId: pendingMove.toAnalystId,
    datetime: `${targetDate}T${originalTime}`
  });

  if (!result.success) {
    setToast({
      message: result.message || 'Erro ao movimentar agendamento.',
      type: 'error'
    });
    return;
  }

  setSchedules(dataService.getSchedules());
  setHoverTooltip(null);
  setPendingMove(null);

  setToast({
    message: 'Movimentação salva com sucesso.',
    type: 'success'
  });
};
  const moveOneScheduleNow = (scheduleId: string) => {
  if (!splitMove) return;

  const schedule = schedules.find((s: any) => String(s.id) === String(scheduleId));

  if (!schedule) {
    setToast({
      message: 'Agendamento não encontrado.',
      type: 'error'
    });
    return;
  }

  const modality =
  schedule.type === ExpertiseType.VIRTUAL
    ? 'VIRTUAL'
    : 'PRESENCIAL';

const targetTime =
  modality === 'VIRTUAL'
    ? splitMove.targetShift === Shift.MORNING
      ? '09:30:00'
      : '14:30:00'
    : splitMove.targetShift === Shift.MORNING
      ? '09:00:00'
      : '14:00:00';

  const result = dataService.updateScheduleById(scheduleId, {
    analystId: splitMove.targetAnalystId,
    datetime: `${splitMove.targetDateIso}T${targetTime}`,
shift: splitMove.targetShift
  });

  if (!result.success) {
    setToast({
      message: result.message || 'Erro ao movimentar técnico.',
      type: 'error'
    });
    return;
  }

  setSchedules(dataService.getSchedules());
  setMovedScheduleIds(prev => [...prev, String(scheduleId)]);
  setSplitMove(prev => prev ? { ...prev } : null);
setTransportingMove(null);
setHoverTooltip(null);
  setToast({
    message: 'Técnico movimentado.',
    type: 'success'
  });
};

  const handleAnalystDragEnd = (event: any) => {
  const { active, over } = event;

  if (!over || active.id === over.id) return;

  const currentIds = sortedAnalysts.map(a => String(a.id));

  const oldIndex = currentIds.indexOf(String(active.id));
  const newIndex = currentIds.indexOf(String(over.id));

  if (oldIndex === -1 || newIndex === -1) return;

  const newOrder = arrayMove(currentIds, oldIndex, newIndex);

  setAnalystOrder(newOrder);

  localStorage.setItem(
    AGENDA_ANALYST_ORDER_KEY,
    JSON.stringify(newOrder)
  );

  setToast({
    message: 'Ordem dos analistas salva.',
    type: 'success'
  });
};

return (


    <div className="flex flex-col gap-1 h-full relative -mt-10">
       {toast && (
        <div className={`fixed top-10 right-10 z-[300] px-8 py-4 rounded-2xl shadow-2xl font-black text-xs uppercase tracking-widest animate-in slide-in-from-right-10 duration-300 ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
          {toast.message}
        </div>
      )}

      <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx,.xls" onChange={handleFileUpload} />
      <input
  type="file"
  ref={productionAgendaInputRef}
  className="hidden"
  accept=".xlsx,.xls"
  onChange={(e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][];

        handleImportProductionAgenda(rawData);
      } catch (err: any) {
        setToast({
          message: 'Falha ao importar agenda de produção: ' + err.message,
          type: 'error'
        });
      } finally {
        if (productionAgendaInputRef.current) productionAgendaInputRef.current.value = "";
      }
    };

    reader.readAsArrayBuffer(file);
  }}
/>

 <div className="flex flex-col md:flex-row justify-between items-center bg-white px-2 py-1 rounded-[12px] border border-slate-200 shadow-sm gap-1">
  <div className="flex items-center space-x-4">
    <div className="flex bg-slate-50 border-2 border-slate-100 rounded-2xl overflow-hidden shadow-sm">
      <button onClick={() => navigateWeek(-1)} className="p-2 hover:bg-slate-200 border-r border-slate-100">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <div className="px-6 py-2 text-[10px] font-black text-slate-900 uppercase min-w-[220px] text-center tracking-widest">
        {weekDates[0].iso.split('-').reverse().slice(0,2).join('/')} — {weekDates[4].iso.split('-').reverse().slice(0,2).join('/')}
      </div>

      <button onClick={() => navigateWeek(1)} className="p-2 hover:bg-slate-200 border-l border-slate-100">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>

    {user.role === UserRole.ADMIN && (
      <>
        <div className="flex items-center gap-3 bg-amber-50 px-4 py-2.5 rounded-2xl border-2 border-amber-100">
          <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">
            MODO TESTE
          </span>
          <button
            onClick={() => dataService.setTestMode(!isTestMode)}
            className={`w-12 h-6 rounded-full relative transition-all ${isTestMode ? 'bg-amber-500' : 'bg-slate-300'}`}
          >
            <div
              className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${isTestMode ? 'left-7' : 'left-1'}`}
            ></div>
          </button>
        </div>

        {isTestMode && (
          <>
            <button
              onClick={() => dataService.downloadTestTemplate()}
              className="bg-slate-900 text-white px-5 py-1 rounded-2xl text-[9px] font-black uppercase tracking-widest shadow-md"
            >
              Modelo Teste
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="bg-amber-600 text-white px-5 py-1 rounded-2xl text-[9px] font-black uppercase tracking-widest shadow-md"
            >
              Importar Teste
            </button>

            <button
              onClick={() => {
                if (confirm("Limpar toda a agenda de teste?")) {
                  dataService.clearTestSchedules();
                  setToast({ message: 'Agenda de teste removida!', type: 'success' });
                }
              }}
              className="bg-rose-600 text-white px-5 py-1 rounded-2xl text-[9px] font-black uppercase tracking-widest shadow-md"
            >
              Limpar Teste
            </button>
          </>
        )}

        <button
          onClick={() => dataService.downloadTestTemplate()}
          className="bg-slate-900 text-white px-5 py-1 rounded-2xl text-[9px] font-black uppercase tracking-widest shadow-md"
        >
          Modelo Produção
        </button>

        <button
          onClick={() => productionAgendaInputRef.current?.click()}
          className="bg-claro-red text-white px-5 py-1 rounded-2xl text-[9px] font-black uppercase tracking-widest shadow-md"
        >
          Importar Produção
        </button>

        <button
          onClick={() => {
            if (confirm("Limpar toda a agenda importada em produção?")) {
              dataService.clearProductionSchedules();
              setToast({ message: 'Agenda importada em produção removida!', type: 'success' });
            }
          }}
          className="bg-rose-600 text-white px-5 py-1 rounded-2xl text-[9px] font-black uppercase tracking-widest shadow-md"
        >
          Limpar Produção
        </button>
          </>
    )}
  </div>

  {!isTestMode && (
  <div className="flex gap-3">
    <button
      onClick={() => {
        setMovementMode(prev => !prev);
        setSelection(null);
        setHoverTooltip(null);
      }}
      className={`px-4 py-1.5 rounded-2xl text-[9px] font-black uppercase shadow-lg tracking-widest ${
        movementMode
          ? 'bg-emerald-600 text-white'
          : 'bg-slate-900 text-white'
      }`}
    >
      {movementMode ? 'Movimentação Ativa' : 'Modo Movimentação'}
    </button>

    <button
      onClick={() => setIsRangeModalOpen(true)}
      className="bg-claro-red text-white px-6 py-1 rounded-2xl text-[10px] font-black uppercase shadow-lg tracking-widest"
    >
      Bloqueio Lote
    </button>
  </div>    

)}
</div>

<div className={`bg-white border-2 rounded-[40px] shadow-sm overflow-y-auto overflow-x-auto flex-1 relative no-scrollbar transition-colors max-h-[calc(100vh-105px)] ${isTestMode ? 'border-amber-400 bg-amber-50/20' : 'border-slate-200'}`}>      
  {isTestMode && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[50] bg-amber-500 text-white px-6 py-2 rounded-full font-black text-[10px] uppercase tracking-[0.3em] shadow-xl">Visualizando Ambiente de Teste</div>
        )}

  {movementMode && (
  <div className="sticky top-0 z-[60] bg-emerald-600 text-white px-6 py-1 text-[10px] font-black uppercase tracking-widest shadow-lg">
    Modo movimentação ativo — próximo passo: arrastar técnicos entre células com validação.
  </div>
)}

{transportingMove && (
  <div className="sticky top-0 z-[70] bg-slate-900 text-white px-6 py-1 flex items-center justify-between shadow-xl border-t border-white/10">
    <div className="flex flex-col">
      <span className="text-[9px] font-black uppercase tracking-[0.25em] text-emerald-300">
        Item em transporte
      </span>

      <span className="text-[12px] font-black uppercase">
        {transportingMove.technicianName || 'LOTE / EVENTO'}
      </span>

      <span className="text-[10px] font-bold uppercase text-white/70">
        Origem: {analysts.find(a => a.id === transportingMove.sourceAnalystId)?.normalizedLogin || transportingMove.sourceAnalystId} — {formatDateBR(transportingMove.sourceDateIso)}
      </span>
    </div>

    <button
      onClick={() => setTransportingMove(null)}
      className="rounded-xl bg-rose-600 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-rose-500"
    >
      Cancelar transporte
    </button>
  </div>
)}
  
        <DndContext
  sensors={sensors}
  collisionDetection={closestCenter}
  onDragEnd={handleAnalystDragEnd}
>
  <SortableContext
    items={sortedAnalysts.map(a => String(a.id))}
    strategy={verticalListSortingStrategy}
  >

<table className="w-full border-collapse table-fixed min-w-[1400px]">
          <thead>
  <tr className="bg-slate-900 text-white shadow-xl">
    <th className="w-72 p-4 text-left font-black text-[11px] border-r-2 border-white/20 sticky left-0 top-0 z-40 bg-slate-900 uppercase tracking-widest">
      Equipe Analistas
    </th>

    {weekDates.map((d, idx) => (
      <th
        key={idx}
        className="p-4 text-center font-black text-[11px] border-r border-white/10 uppercase tracking-widest bg-slate-900 sticky top-0 z-30"
      >
        {d.formatted}
      </th>
    ))}
  </tr>
</thead>
          <tbody>
            {sortedAnalysts.map((analyst, aIdx) => {

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition
  } = useSortable({
    id: String(analyst.id)
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  return (
              <React.Fragment key={analyst.id}>
                <tr
  ref={setNodeRef}
  style={style}
  {...attributes}
  {...listeners}
  className={`${aIdx % 2 === 0 ? 'bg-white' : 'bg-[#f5f7fa]'} border-b border-slate-900/10 h-9 transition-colors cursor-grab active:cursor-grabbing`}
>
                  <td className="p-0 border-r-2 border-slate-300 sticky left-0 z-20 bg-inherit shadow-md h-9">
                    <div className="flex items-center px-2 py-1 h-full">
                      <span className={`w-1.5 h-8 mr-4 rounded-full ${aIdx % 2 === 0 ? 'bg-claro-red' : 'bg-slate-900'}`}></span>
                      <p className="font-black text-[11px] uppercase truncate">{analyst.normalizedLogin}</p>
                    </div>
                  </td>
                  {weekDates.map((date, idx) => (
                    <td 
                      key={idx} 
  onClick={(e) => {
  if (movementMode) {

    if (transportingMove?.itemType === 'SCHEDULE') {
      setSplitMove({
        sourceAnalystId: transportingMove.sourceAnalystId,
        sourceDateIso: transportingMove.sourceDateIso,
        sourceShift:
          transportingMove.sourceShift === Shift.MORNING
            ? 'MORNING'
            : 'AFTERNOON',
        sourceTechnology: transportingMove.sourceTechnology || 'GPON',
        sourceModality: transportingMove.sourceModality || 'VIRTUAL',
        targetAnalystId: analyst.id,
        targetDateIso: date.iso,
targetShift: getTargetShiftFromCell(e),
rect: e.currentTarget.getBoundingClientRect()
      });

      return;
    }

    if (transportingMove?.itemType === 'EVENT') {
      setPendingMove({
        itemType: 'EVENT',
        eventId: transportingMove.eventId,
        technicianName: transportingMove.technicianName || 'EVENTO',
        fromAnalystId: transportingMove.sourceAnalystId,
        fromDateIso: transportingMove.sourceDateIso,
        fromShift: transportingMove.sourceShift,
        toAnalystId: analyst.id,
        toDateIso: date.iso
      });

      return;
    }

    return;
  }

  setSelection({
    userId: analyst.id,
    dateIso: date.iso,
    rect: e.currentTarget.getBoundingClientRect()
  });
}}
                      onDragOver={(e) => {
  if (!movementMode) return;
  e.preventDefault();
}}

onDrop={(e) => {
  if (!movementMode) return;

  e.preventDefault();

  const itemType = (e.dataTransfer.getData('itemType') || 'SCHEDULE') as 'SCHEDULE' | 'EVENT';

  const scheduleId = String(
    e.dataTransfer.getData('scheduleId') || ''
  ).trim();

  const eventId = String(
    e.dataTransfer.getData('eventId') || ''
  ).trim();

  const technicianName =
    e.dataTransfer.getData('technicianName') ||
    (itemType === 'EVENT' ? 'EVENTO' : 'LOTE / BLOCO');

  const fromAnalystId = e.dataTransfer.getData('fromAnalystId');
  const fromDateIso = e.dataTransfer.getData('fromDateIso');
  const fromShift = e.dataTransfer.getData('fromShift') as Shift;

  if (itemType === 'SCHEDULE' && !scheduleId) return;
if (itemType === 'EVENT' && !eventId) return;

const fromTechnology = e.dataTransfer.getData('fromTechnology') || 'GPON';
const fromModality = e.dataTransfer.getData('fromModality') || 'VIRTUAL';

if (itemType === 'SCHEDULE') {
  setSplitMove({
    sourceAnalystId: fromAnalystId,
    sourceDateIso: fromDateIso,
    sourceShift: fromShift === Shift.MORNING ? 'MORNING' : 'AFTERNOON',
    sourceTechnology: fromTechnology,
    sourceModality: fromModality,
    targetAnalystId: analyst.id,
    targetDateIso: date.iso,
targetShift: getTargetShiftFromCell(e),
rect: e.currentTarget.getBoundingClientRect()
  });

  setHoverTooltip(null);
  return;
}

setPendingMove({
  itemType,
  scheduleId: scheduleId || undefined,
  eventId: eventId || undefined,
  technicianName,
  fromAnalystId,
  fromDateIso,
  fromShift,
  toAnalystId: analyst.id,
  toDateIso: date.iso
});
}}
                      
                      
                      className={`p-0 border-r overflow-hidden relative group h-12 transition-all ${
  movementMode
    ? (() => {
        const validation = validateMovementTarget(
          analyst.id,
          date.iso
        );

        if (validation.blocked) {
          return 'bg-rose-100 border-rose-300 cursor-not-allowed';
        }

        return 'bg-emerald-50 border-emerald-200 cursor-crosshair';
      })()
    : 'border-slate-200/50 cursor-pointer'
}`}
                    >
                      <div className="absolute inset-0 group-hover:bg-black/5 transition-colors pointer-events-none z-10"></div>
                      <div className="h-full w-full relative">
                        {getCellContent(analyst.id, date.iso)}
                      </div>
                    </td>
                  ))}
                </tr>
                <tr><td colSpan={6} className="h-1 bg-slate-900/10"></td></tr>
                            </React.Fragment>
  );
})}
          </tbody>
                </table>

  </SortableContext>
</DndContext>
      </div>

      <div className="flex gap-4 flex-wrap px-4 pb-4">
        {Object.entries(COLORS).map(([key, val]) => (
          <div key={key} className="flex items-center gap-1.5 text-[9px] font-black tracking-widest uppercase">
            <div className="w-3.5 h-3.5 rounded-sm shadow-sm" style={{ backgroundColor: val }}></div> {key}
          </div>
        ))}
        <div className="flex items-center gap-1.5 text-[9px] font-black tracking-widest uppercase">
          <div className="flex gap-0.5">
            {OUTROS_PALETTE.slice(0,3).map(p => <div key={p.id} className="w-2.5 h-2.5 rounded-sm" style={{backgroundColor: p.color}}></div>)}
          </div>
          OUTROS (CORES VAR.)
        </div>
      </div>

      {selection && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setSelection(null)}></div>
          <div className="fixed z-[70] bg-white border border-slate-200 shadow-2xl rounded-[32px] py-6 w-72 animate-in zoom-in duration-200" style={{ top: selection.rect.bottom + 12 > window.innerHeight - 350 ? selection.rect.top - 350 : selection.rect.bottom + 12, left: Math.min(selection.rect.left, window.innerWidth - 300) }}>
            <div className="flex flex-col">
              <div className="px-6 py-2 bg-slate-50 border-b border-slate-100 text-[9px] font-black text-slate-400 uppercase tracking-widest">Ações Rápidas</div>
              <button
  onClick={() => {
    setTrainingType('INST HFC');
    setTrainingLesson('');
    setTrainingShift(Shift.FULL_DAY); // já alinhado com novo padrão
    setIsTrainingModalOpen(true);
  }}
  className="w-full text-left px-8 py-4 text-[11px] font-black text-slate-900 hover:bg-slate-100 uppercase transition-all tracking-wider"
>
  Treinamento
</button>

<button
  onClick={() => {
    setVacationEndDate(selection?.dateIso || '');
    setIsVacationModalOpen(true);
  }}
  className="w-full text-left px-8 py-4 text-[11px] font-black text-claro-red hover:bg-claro-red hover:text-white uppercase transition-all tracking-wider"
>
  Lançar Férias
</button>

<button
  onClick={() => setStatus('IMPREVISTO')}
  className="w-full text-left px-8 py-4 text-[11px] font-black text-[#6A1B9A] hover:bg-[#6A1B9A] hover:text-white uppercase transition-all tracking-wider"
>
  Lançar Improviso
</button>
              <button
  onClick={() => {
    setStatus('CQ_SUPPORT', Shift.FULL_DAY);
  }}
  className="w-full text-left px-8 py-4 text-[11px] font-black text-indigo-600 hover:bg-indigo-600 hover:text-white uppercase transition-all tracking-wider"
>
  Apoio CQ
</button>
  

<button
  onClick={() => {
    setOtherReasonType('FOLGA');
    setOtherReasonText('');
    setOtherReasonShift(Shift.MORNING);
    setIsOutrosModalOpen(true);
  }}
  className="w-full text-left px-8 py-4 text-[11px] font-black text-[#455A64] hover:bg-[#455A64] hover:text-white uppercase transition-all tracking-wider"
>
  Outros (Motivo)
</button>

<button
  onClick={() => {
    setHolidayTarget('ONE');
    setIsHolidayModalOpen(true);
  }}
  className="w-full text-left px-8 py-4 text-[11px] font-black text-black hover:bg-black hover:text-white uppercase transition-all tracking-wider"
>
  Lançar Feriado
</button>

<button
  onClick={() => setStatus(null)}
  className="w-full text-left px-8 py-4 text-[11px] font-black text-slate-400 hover:bg-slate-50 uppercase transition-all tracking-wider mt-2 border-t border-slate-100 italic"
>
  Limpar Célula
</button>
            </div>
          </div>
        </>
      )}

      {splitMove && (
  <>
    <div
      className="fixed inset-0 z-[90]"
      onClick={() => {
        setSplitMove(null);
        setMovedScheduleIds([]);
      }}
    />

    <div
      className="fixed z-[100] bg-slate-900 text-white rounded-2xl shadow-2xl px-4 py-3 min-w-[340px] max-w-[420px] max-h-[460px] overflow-y-auto border border-white/10"
      style={{
        top: Math.min(splitMove.rect.bottom + 12, window.innerHeight - 480),
        left: Math.min(splitMove.rect.left, window.innerWidth - 440)
      }}
    >
      <div className="text-[10px] font-black uppercase tracking-widest text-emerald-300 mb-3">
        Mover para {analysts.find(a => a.id === splitMove.targetAnalystId)?.normalizedLogin || splitMove.targetAnalystId} — {formatDateBR(splitMove.targetDateIso)}
      </div>

      {(() => {
        const items = buildAgendaTooltipData(
          splitMove.sourceAnalystId,
          splitMove.sourceDateIso,
          splitMove.sourceShift,
          splitMove.sourceTechnology,
          splitMove.sourceModality
        ).filter((item: any) => !movedScheduleIds.includes(String(item.scheduleId)));

        return items.length > 0 ? (
          items.map((item: any, index: number) => (
            <div key={index} className="bg-white/5 rounded-xl px-3 py-2 mb-2">
              <div className="text-[11px] font-black uppercase tracking-wide">
                {item.time} — {item.technician}
              </div>

              <div className="flex items-center justify-between gap-3 mt-1">
                <div className="text-[10px] text-white/70 font-bold uppercase tracking-wide truncate">
                  {item.city}
                </div>

                <div className="text-[10px] text-emerald-300 font-bold uppercase tracking-wide whitespace-nowrap">
                  {item.partner}
                </div>
              </div>

              <button
                onClick={() => moveOneScheduleNow(item.scheduleId)}
                className="mt-2 w-full rounded-xl bg-emerald-600 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-emerald-500"
              >
                Mover este técnico
              </button>
            </div>
          ))
        ) : (
          <div className="bg-white/5 rounded-xl px-3 py-2">
            <div className="text-[11px] font-black uppercase tracking-wide text-white/70">
              Todos os técnicos deste bloco já foram movimentados
            </div>
          </div>
        );
      })()}
    </div>
  </>
)}

      {isImprovisoModal && selection && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/70 backdrop-blur-md p-4">
          <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-sm overflow-hidden border-t-8 border-[#6A1B9A] animate-in zoom-in duration-300">
            <div className="bg-[#6A1B9A] p-8 text-white text-center">
              <h3 className="text-xl font-black uppercase tracking-tighter">Período Improviso</h3>
              <p className="text-[10px] font-bold uppercase mt-1 opacity-70">Define indisponibilidade imediata</p>
            </div>
            <div className="p-8 space-y-4">
               <div className="flex flex-col gap-2">
                  <button onClick={() => checkImprovisoShift(Shift.MORNING)} className={`w-full p-4 rounded-2xl border-2 font-black text-[11px] uppercase transition-all ${improvisoShift === Shift.MORNING ? 'border-[#6A1B9A] bg-[#6A1B9A]/10 text-[#6A1B9A]' : 'border-slate-100 text-slate-400'}`}>Manhã</button>
                  <button onClick={() => checkImprovisoShift(Shift.AFTERNOON)} className={`w-full p-4 rounded-2xl border-2 font-black text-[11px] uppercase transition-all ${improvisoShift === Shift.AFTERNOON ? 'border-[#6A1B9A] bg-[#6A1B9A]/10 text-[#6A1B9A]' : 'border-slate-100 text-slate-400'}`}>Tarde</button>
                  <button onClick={() => checkImprovisoShift(Shift.FULL_DAY)} className={`w-full p-4 rounded-2xl border-2 font-black text-[11px] uppercase transition-all ${improvisoShift === Shift.FULL_DAY ? 'border-[#6A1B9A] bg-[#6A1B9A]/10 text-[#6A1B9A]' : 'border-slate-100 text-slate-400'}`}>Dia Inteiro</button>
               </div>

<div className="space-y-1 pt-2">
  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
    Descreva o imprevisto
  </label>
  <input
    type="text"
    maxLength={150}
    autoFocus
    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3 text-sm font-bold outline-none focus:border-[#6A1B9A] transition-all"
    placeholder="EX: ADM, REUNIÃO, APOIO EXTERNO..."
    value={improvisoReason}
    onChange={(e) => setImprovisoReason(e.target.value)}
  />
</div>
              
               {impactCount > 0 && (
                 <div className="bg-rose-50 p-4 rounded-2xl border border-rose-100 animate-in shake duration-500">
                    <p className="text-[10px] font-black text-rose-600 uppercase leading-tight tracking-tighter">
                      ⚠️ Este imprevisto irá cancelar {impactCount} agendamentos já existentes e mover os técnicos para CANCELADOS (ANALISTA). Deseja continuar?
                    </p>
                 </div>
               )}
            </div>
            <div className="flex gap-4 p-8 pt-0">
              <button
  onClick={() => {
    setIsImprovisoModal(false);
    setImprovisoReason('');
  }}
  className="flex-1 py-4 text-xs font-black text-slate-400 uppercase tracking-widest"
>
  Voltar
</button>
              <button onClick={() => setStatus('IMPREVISTO', improvisoShift)} className="flex-1 py-4 bg-[#6A1B9A] text-white text-xs font-black uppercase rounded-2xl shadow-xl tracking-widest">Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {isTrainingModalOpen && selection && (
  <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/70 backdrop-blur-md p-4">
    <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-md overflow-hidden border-t-8 border-slate-900 animate-in zoom-in duration-300">
      <div className="bg-slate-900 p-8 text-white text-center">
        <h3 className="text-xl font-black uppercase tracking-tighter">Treinamento ETN</h3>
        <p className="text-[10px] font-bold uppercase mt-1 opacity-70">Tipo, período e aula</p>
      </div>

      <div className="p-8 space-y-6">
  <div className="space-y-1">
    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
      Treinamento
    </label>
    <select
      value={trainingType}
      onChange={(e) => setTrainingType(e.target.value as any)}
      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3 text-sm font-bold outline-none focus:border-claro-red"
    >
      {TRAINING_OPTIONS.map(item => (
        <option key={item} value={item}>{item}</option>
      ))}
    </select>
  </div>

  <div className="space-y-1">
    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
      Período
    </label>
    <div className="grid grid-cols-3 gap-2">
  <button
    type="button"
    onClick={() => setTrainingShift(Shift.FULL_DAY)}
    className={`p-3 rounded-2xl border-2 text-[10px] font-black uppercase ${
      trainingShift === Shift.FULL_DAY
        ? 'border-slate-900 bg-slate-900 text-white'
        : 'border-slate-100 text-slate-500'
    }`}
  >
    Integral
  </button>

  <button
    type="button"
    onClick={() => setTrainingShift(Shift.MORNING)}
    className={`p-3 rounded-2xl border-2 text-[10px] font-black uppercase ${
      trainingShift === Shift.MORNING
        ? 'border-slate-900 bg-slate-900 text-white'
        : 'border-slate-100 text-slate-500'
    }`}
  >
    Manhã
  </button>

  <button
    type="button"
    onClick={() => setTrainingShift(Shift.AFTERNOON)}
    className={`p-3 rounded-2xl border-2 text-[10px] font-black uppercase ${
      trainingShift === Shift.AFTERNOON
        ? 'border-slate-900 bg-slate-900 text-white'
        : 'border-slate-100 text-slate-500'
    }`}
  >
    Tarde
  </button>
</div>
  </div>

  <div className="space-y-2">
    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
      Aula {trainingType === 'NR' ? '(Opcional)' : '(Opcional também)'}
    </label>

    <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="radio"
          name="trainingLesson"
          className="accent-claro-red"
          checked={trainingLesson === ''}
          onChange={() => setTrainingLesson('')}
        />
        <span className="text-[10px] font-bold uppercase text-slate-700">
          Sem aula
        </span>
      </label>

      {LESSON_OPTIONS.map((lesson) => (
        <label key={lesson} className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="trainingLesson"
            className="accent-claro-red"
            checked={trainingLesson === lesson}
            onChange={() => setTrainingLesson(lesson)}
          />
          <span className="text-[10px] font-bold uppercase text-slate-700">
            Aula {lesson}
          </span>
        </label>
      ))}
    </div>
  </div>

  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
      Prévia
    </p>
    <p className="text-sm font-black text-slate-900 mt-2">
      {buildTrainingTitle(trainingType, trainingLesson || undefined)}
    </p>
  </div>
</div>

      <div className="flex gap-4 p-8 pt-0">
        <button
          onClick={() => setIsTrainingModalOpen(false)}
          className="flex-1 py-4 text-xs font-black text-slate-400 uppercase tracking-widest"
        >
          Voltar
        </button>
        <button
          onClick={saveTrainingEvent}
          className="flex-1 py-4 bg-slate-900 text-white text-xs font-black uppercase rounded-2xl shadow-xl tracking-widest"
        >
          Confirmar
        </button>
      </div>
    </div>
  </div>
)}

      {isVacationModalOpen && selection && (
  <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/70 backdrop-blur-md p-4">
    <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-sm overflow-hidden border-t-8 border-claro-red animate-in zoom-in duration-300">
      <div className="bg-claro-red p-8 text-white text-center">
        <h3 className="text-xl font-black uppercase tracking-tighter">Lançar Férias</h3>
        <p className="text-[10px] font-bold uppercase mt-1 opacity-70">Defina o período</p>
      </div>

      <div className="p-8 space-y-6">
        <div className="space-y-1">
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">De</label>
          <input
            type="date"
            disabled
            value={selection.dateIso}
            className="w-full bg-slate-100 border-2 border-slate-100 rounded-2xl px-5 py-3 text-sm font-bold outline-none"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Até</label>
          <input
            type="date"
            value={vacationEndDate}
            min={selection.dateIso}
            onChange={(e) => setVacationEndDate(e.target.value)}
            className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3 text-sm font-bold outline-none focus:border-claro-red"
          />
        </div>
      </div>

      <div className="flex gap-4 p-8 pt-0">
        <button
          onClick={() => setIsVacationModalOpen(false)}
          className="flex-1 py-4 text-xs font-black text-slate-400 uppercase tracking-widest"
        >
          Voltar
        </button>
        <button
          onClick={saveVacationRange}
          className="flex-1 py-4 bg-claro-red text-white text-xs font-black uppercase rounded-2xl shadow-xl tracking-widest"
        >
          Confirmar
        </button>
      </div>
    </div>
  </div>
)}

      

      {isOutrosModalOpen && selection && (
  <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/70 backdrop-blur-md p-4">
    <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-sm overflow-hidden border-t-8 border-slate-900 animate-in zoom-in duration-300">
      <div className="bg-slate-900 p-8 text-white text-center">
        <h3 className="text-xl font-black uppercase tracking-tighter">Outros (Motivo)</h3>
        <p className="text-[10px] font-bold uppercase mt-1 opacity-70">Tipo e período</p>
      </div>

      <div className="p-8 space-y-6">
        <div className="space-y-1">
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Motivo</label>
          <select
            value={otherReasonType}
            onChange={(e) => setOtherReasonType(e.target.value as any)}
            className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3 text-sm font-bold outline-none focus:border-claro-red"
          >
            {OTHER_REASON_OPTIONS.map(item => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </div>

        {otherReasonType === 'OUTROS' && (
          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Descrição</label>
            <input
              type="text"
              value={otherReasonText}
              onChange={(e) => setOtherReasonText(e.target.value)}
              className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3 text-sm font-bold outline-none focus:border-claro-red"
              placeholder="EX: REUNIÃO, APOIO, MÉDICO..."
            />
          </div>
        )}

        <div className="space-y-1">
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Período</label>
          <div className="grid grid-cols-3 gap-2">
            <button type="button" onClick={() => setOtherReasonShift(Shift.MORNING)} className={`p-3 rounded-2xl border-2 text-[10px] font-black uppercase ${otherReasonShift === Shift.MORNING ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-100 text-slate-500'}`}>Manhã</button>
            <button type="button" onClick={() => setOtherReasonShift(Shift.AFTERNOON)} className={`p-3 rounded-2xl border-2 text-[10px] font-black uppercase ${otherReasonShift === Shift.AFTERNOON ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-100 text-slate-500'}`}>Tarde</button>
            <button type="button" onClick={() => setOtherReasonShift(Shift.FULL_DAY)} className={`p-3 rounded-2xl border-2 text-[10px] font-black uppercase ${otherReasonShift === Shift.FULL_DAY ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-100 text-slate-500'}`}>Integral</button>
          </div>
        </div>
      </div>

      <div className="flex gap-4 p-8 pt-0">
        <button onClick={() => setIsOutrosModalOpen(false)} className="flex-1 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">
          Voltar
        </button>
        <button onClick={saveOtherReasonEvent} className="flex-1 py-4 bg-slate-900 text-white text-xs font-black uppercase rounded-2xl shadow-xl tracking-widest">
          Gravar
        </button>
      </div>
    </div>
  </div>
)}
      {isHolidayModalOpen && selection && (
  <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/70 backdrop-blur-md p-4">
    <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-sm overflow-hidden border-t-8 border-black animate-in zoom-in duration-300">
      <div className="bg-black p-8 text-white text-center">
        <h3 className="text-xl font-black uppercase tracking-tighter">Lançar Feriado</h3>
        <p className="text-[10px] font-bold uppercase mt-1 opacity-70">Aplicar para um ou todos</p>
      </div>

      <div className="p-8 space-y-4">
        <button
          onClick={() => setHolidayTarget('ONE')}
          className={`w-full p-4 rounded-2xl border-2 font-black text-[11px] uppercase transition-all ${holidayTarget === 'ONE' ? 'border-black bg-black text-white' : 'border-slate-100 text-slate-400'}`}
        >
          Somente este analista
        </button>
        <button
          onClick={() => setHolidayTarget('ALL')}
          className={`w-full p-4 rounded-2xl border-2 font-black text-[11px] uppercase transition-all ${holidayTarget === 'ALL' ? 'border-black bg-black text-white' : 'border-slate-100 text-slate-400'}`}
        >
          Todos
        </button>
      </div>

      <div className="flex gap-4 p-8 pt-0">
        <button
          onClick={() => setIsHolidayModalOpen(false)}
          className="flex-1 py-4 text-xs font-black text-slate-400 uppercase tracking-widest"
        >
          Voltar
        </button>
        <button
          onClick={saveHolidayEvent}
          className="flex-1 py-4 bg-black text-white text-xs font-black uppercase rounded-2xl shadow-xl tracking-widest"
        >
          Confirmar
        </button>
      </div>
    </div>
  </div>
)}
      

                 {isRangeModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/70 backdrop-blur-md p-4">
          
        </div>
      )}

   {pendingMove && (
  <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/70 backdrop-blur-md p-4">
    <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden">
      <div className="bg-slate-900 p-6 text-white">
        <h3 className="text-lg font-black uppercase">
          Confirmar movimentação
        </h3>

        <p className="text-[10px] font-bold uppercase opacity-70 mt-1">
          Prévia operacional
        </p>
      </div>

      <div className="p-6 space-y-3 text-sm font-bold text-slate-700">
  <p>
    <b>Origem:</b>{' '}
    {analysts.find(a => a.id === pendingMove.fromAnalystId)?.normalizedLogin || pendingMove.fromAnalystId}
    {' — '}
    {formatDateBR(pendingMove.fromDateIso)}
  </p>

  <p>
    <b>Destino:</b>{' '}
    {analysts.find(a => a.id === pendingMove.toAnalystId)?.normalizedLogin || pendingMove.toAnalystId}
    {' — '}
    {formatDateBR(pendingMove.toDateIso)}
  </p>

  <div>
    {(() => {
      const validation = validateMovementTarget(
        pendingMove.toAnalystId,
        pendingMove.toDateIso
      );

    
  return (
    <div className="space-y-2 pt-3">
      {validation.blocked && (
        <div className="bg-rose-100 text-rose-700 px-3 py-2 rounded-xl text-xs font-black uppercase">
          Analista possui bloqueio neste dia
        </div>
      )}

      {validation.hasVirtual && (
        <div className="bg-amber-100 text-amber-700 px-3 py-2 rounded-xl text-xs font-black uppercase">
          Já existe virtual neste dia
        </div>
      )}

      {validation.hasPresential && (
        <div className="bg-sky-100 text-sky-700 px-3 py-2 rounded-xl text-xs font-black uppercase">
          Já existe presencial neste dia
        </div>
      )}
    </div>
  );
})()}
  </div>
</div>

      <div className="flex gap-3 p-6 pt-0">
        <button
          onClick={() => setPendingMove(null)}
          className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-500 text-xs font-black uppercase"
        >
          Cancelar
        </button>

        <button
          onClick={confirmPendingMove}
          className="flex-1 py-3 rounded-2xl bg-emerald-600 text-white text-xs font-black uppercase"
        >
          Confirmar
        </button>
      </div>
    </div>
  </div>
)}
      {splitMove && (
  <>
    <div
      className="fixed inset-0 z-[90]"
      onClick={() => setSplitMove(null)}
    />

    <div
      className="fixed z-[100] bg-slate-900 text-white rounded-2xl shadow-2xl px-4 py-3 min-w-[340px] max-w-[420px] max-h-[460px] overflow-y-auto border border-white/10"
      style={{
        top: Math.min(splitMove.rect.bottom + 12, window.innerHeight - 480),
        left: Math.min(splitMove.rect.left, window.innerWidth - 440)
      }}
    >
      <div className="text-[10px] font-black uppercase tracking-widest text-emerald-300 mb-3">
        Escolha técnicos para mover
      </div>

      {buildAgendaTooltipData(
        splitMove.sourceAnalystId,
        splitMove.sourceDateIso,
        splitMove.sourceShift,
        splitMove.sourceTechnology,
        splitMove.sourceModality
      ).length > 0 ? (
        buildAgendaTooltipData(
          splitMove.sourceAnalystId,
          splitMove.sourceDateIso,
          splitMove.sourceShift,
          splitMove.sourceTechnology,
          splitMove.sourceModality
        ).map((item: any, index: number) => (
          <div key={index} className="bg-white/5 rounded-xl px-3 py-2 mb-2">
            <div className="text-[11px] font-black uppercase tracking-wide">
              {item.time} — {item.technician}
            </div>

            <div className="flex items-center justify-between gap-3 mt-1">
              <div className="text-[10px] text-white/70 font-bold uppercase tracking-wide truncate">
                {item.city}
              </div>

              <div className="text-[10px] text-emerald-300 font-bold uppercase tracking-wide whitespace-nowrap">
                {item.partner}
              </div>
            </div>

            <button
              onClick={() => moveOneScheduleNow(item.scheduleId)}
              className="mt-2 w-full rounded-xl bg-emerald-600 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-emerald-500"
            >
              Mover este técnico
            </button>
          </div>
        ))
      ) : (
        <div className="bg-white/5 rounded-xl px-3 py-2">
          <div className="text-[11px] font-black uppercase tracking-wide text-white/70">
            Todos os técnicos deste bloco já foram movimentados
          </div>
        </div>
      )}
    </div>
  </>
)}

      {splitMove && (
  <>
    <div
      className="fixed inset-0 z-[90]"
      onClick={() => setSplitMove(null)}
    />

    <div
      className="fixed z-[100] bg-slate-900 text-white rounded-2xl shadow-2xl px-4 py-3 min-w-[340px] max-w-[420px] max-h-[460px] overflow-y-auto border border-white/10"
      style={{
        top: Math.min(splitMove.rect.bottom + 12, window.innerHeight - 480),
        left: Math.min(splitMove.rect.left, window.innerWidth - 440)
      }}
    >
      <div className="text-[10px] font-black uppercase tracking-widest text-emerald-300 mb-3">
        Escolha técnicos para mover
      </div>

      {buildAgendaTooltipData(
        splitMove.sourceAnalystId,
        splitMove.sourceDateIso,
        splitMove.sourceShift,
        splitMove.sourceTechnology,
        splitMove.sourceModality
      ).length > 0 ? (
        buildAgendaTooltipData(
          splitMove.sourceAnalystId,
          splitMove.sourceDateIso,
          splitMove.sourceShift,
          splitMove.sourceTechnology,
          splitMove.sourceModality
        ).map((item: any, index: number) => (
          <div key={index} className="bg-white/5 rounded-xl px-3 py-2 mb-2">
            <div className="text-[11px] font-black uppercase tracking-wide">
              {item.time} — {item.technician}
            </div>

            <div className="flex items-center justify-between gap-3 mt-1">
              <div className="text-[10px] text-white/70 font-bold uppercase tracking-wide truncate">
                {item.city}
              </div>

              <div className="text-[10px] text-emerald-300 font-bold uppercase tracking-wide whitespace-nowrap">
                {item.partner}
              </div>
            </div>

            <button
              onClick={() => moveOneScheduleNow(item.scheduleId)}
              className="mt-2 w-full rounded-xl bg-emerald-600 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-emerald-500"
            >
              Mover este técnico
            </button>
          </div>
        ))
      ) : (
        <div className="bg-white/5 rounded-xl px-3 py-2">
          <div className="text-[11px] font-black uppercase tracking-wide text-white/70">
            Todos os técnicos deste bloco já foram movimentados
          </div>
        </div>
      )}
    </div>
  </>
)}

      {splitMove && (
  <>
    <div
      className="fixed inset-0 z-[90]"
      onClick={() => setSplitMove(null)}
    />

    <div
      className="fixed z-[100] bg-slate-900 text-white rounded-2xl shadow-2xl px-4 py-3 min-w-[340px] max-w-[420px] max-h-[460px] overflow-y-auto border border-white/10"
      style={{
        top: Math.min(splitMove.rect.bottom + 12, window.innerHeight - 480),
        left: Math.min(splitMove.rect.left, window.innerWidth - 440)
      }}
    >
      <div className="text-[10px] font-black uppercase tracking-widest text-emerald-300 mb-3">
        Escolha técnicos para mover
      </div>

      {buildAgendaTooltipData(
        splitMove.sourceAnalystId,
        splitMove.sourceDateIso,
        splitMove.sourceShift,
        splitMove.sourceTechnology,
        splitMove.sourceModality
      ).length > 0 ? (
        buildAgendaTooltipData(
          splitMove.sourceAnalystId,
          splitMove.sourceDateIso,
          splitMove.sourceShift,
          splitMove.sourceTechnology,
          splitMove.sourceModality
        ).map((item: any, index: number) => (
          <div key={index} className="bg-white/5 rounded-xl px-3 py-2 mb-2">
            <div className="text-[11px] font-black uppercase tracking-wide">
              {item.time} — {item.technician}
            </div>

            <div className="flex items-center justify-between gap-3 mt-1">
              <div className="text-[10px] text-white/70 font-bold uppercase tracking-wide truncate">
                {item.city}
              </div>

              <div className="text-[10px] text-emerald-300 font-bold uppercase tracking-wide whitespace-nowrap">
                {item.partner}
              </div>
            </div>

            <button
              onClick={() => moveOneScheduleNow(item.scheduleId)}
              className="mt-2 w-full rounded-xl bg-emerald-600 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-emerald-500"
            >
              Mover este técnico
            </button>
          </div>
        ))
      ) : (
        <div className="bg-white/5 rounded-xl px-3 py-2">
          <div className="text-[11px] font-black uppercase tracking-wide text-white/70">
            Todos os técnicos deste bloco já foram movimentados
          </div>
        </div>
      )}
    </div>
  </>
)}

            {hoverTooltip?.visible && (
        <div
className="fixed z-[9999] pointer-events-auto bg-slate-900 text-white rounded-2xl shadow-2xl px-4 py-3 min-w-[300px] max-w-[380px] max-h-[420px] overflow-y-auto border border-white/10"          style={{
            left: hoverTooltip.x,
            top: hoverTooltip.y
          }}
        >
          <div className="space-y-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-white/60">
                Modalidade
              </div>
              <div className="text-xs font-black uppercase">
                {hoverTooltip.modality}
              </div>
            </div>

                       <div className="border-t border-white/10 pt-3 space-y-2">
              {getLiveTooltipItems().length > 0 ? (
                getLiveTooltipItems().map((item, index) => (
                  <div key={index} className="bg-white/5 rounded-xl px-3 py-2">
                    <div className="text-[11px] font-black uppercase tracking-wide">
                      {item.time} — {item.technician}
                    </div>

                    <div className="flex items-center justify-between gap-3 mt-1">
                      <div className="text-[10px] text-white/70 font-bold uppercase tracking-wide truncate">
                        {item.city}
                      </div>

                      <div className="text-[10px] text-emerald-300 font-bold uppercase tracking-wide whitespace-nowrap">
                        {item.partner}
                      </div>
                      
                    </div>
                  </div>
                ))
              ) : (
        
                <div className="bg-white/5 rounded-xl px-3 py-2">
                  <div className="text-[11px] font-black uppercase tracking-wide text-white/70">
                    Nenhum agendamento ativo nesta célula
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Agenda;
