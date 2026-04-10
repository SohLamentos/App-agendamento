
import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { dataService } from '../services/dataService';
import { User, UserRole, EventSchedule, Shift, ExpertiseType, ScheduleStatus, CertificationSchedule } from '../types';

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
    return dataService.getUsers().filter(u => 
      u.role === UserRole.ANALYST && 
      u.active === true && 
      (user.role === UserRole.ADMIN || u.groupId === user.groupId)
    );
  }, [user]);

  const [events, setEvents] = useState<EventSchedule[]>(dataService.getEvents());
  const [schedules, setSchedules] = useState(dataService.getSchedules());
  const [isTestMode, setIsTestMode] = useState(dataService.isTestMode());
  const [selection, setSelection] = useState<Selection | null>(null);
  const [technicians, setTechnicians] = useState(dataService.getTechnicians());

const [hoverTooltip, setHoverTooltip] = useState<{
  visible: boolean;
  x: number;
  y: number;
  title: string;
  modality: string;
  items: Array<{
    time: string;
    technician: string;
    city: string;
  }>;
} | null>(null);
  
  const [isImprovisoModal, setIsImprovisoModal] = useState(false);
const [improvisoShift, setImprovisoShift] = useState<Shift>(Shift.MORNING);
const [impactCount, setImpactCount] = useState(0);
const [improvisoReason, setImprovisoReason] = useState('');

  const [isOutrosModalOpen, setIsOutrosModalOpen] = useState(false);
  const [outrosReason, setOutrosReason] = useState('');
  const [outrosColor, setOutrosColor] = useState(OUTROS_PALETTE[6].color); // Default Silver

  const [isRangeModalOpen, setIsRangeModalOpen] = useState(false);
  const [rangeAnalystId, setRangeAnalystId] = useState('');
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [rangeTitle, setRangeTitle] = useState('FÉRIAS');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  useEffect(() => {

    const handleUpdate = () => {
  setEvents(dataService.getEvents());
  setSchedules(dataService.getSchedules());
  setTechnicians(dataService.getTechnicians());
  setIsTestMode(dataService.isTestMode());
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
    FERIADO: '#000000'
  };

  const getCellContent = (userId: string, dateIso: string) => {
    const dayBlocks = events.filter(e => e.involvedUserIds.includes(userId) && e.startDatetime.startsWith(dateIso));
    const daySchs = schedules.filter(s => s.analystId === userId && s.datetime.startsWith(dateIso) && s.status !== ScheduleStatus.CANCELLED);

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
      else if (title.includes('FOLGA')) color = COLORS.FOLGA;
      else if (title.includes('IMPREVISTO')) color = COLORS.IMPREVISTO;
      else if (title.includes('OUTROS')) {
        color = fullDayBlock.color || COLORS.OUTROS;
      }
      else if (title.includes('FERIADO')) color = COLORS.FERIADO;

      const displayTitle =
  title.includes('OUTROS - ')
    ? title.replace('OUTROS - ', '')
    : title.includes('IMPREVISTO - ')
      ? title.replace('IMPREVISTO - ', '')
      : title;

return renderCard(displayTitle, color);
    }

    const morningBlock = dayBlocks.find(b => b.shift === Shift.MORNING);
    const afternoonBlock = dayBlocks.find(b => b.shift === Shift.AFTERNOON);
    
    const morningSchs = daySchs.filter(s => s.shift === Shift.MORNING);
    const afternoonSchs = daySchs.filter(s => s.shift === Shift.AFTERNOON);

    return (
  <div className="flex flex-col h-full w-full overflow-hidden">
    <div className="flex-1 flex overflow-hidden border-b border-white/20">
      {morningBlock
        ? renderCard(
            morningBlock.title
              .replace('OUTROS - ', '')
              .replace('IMPREVISTO - ', ''),
            morningBlock.color || (
              morningBlock.title.includes('FÉRIAS') ? COLORS.FERIAS :
              morningBlock.title.includes('FOLGA') ? COLORS.FOLGA :
              morningBlock.title.includes('IMPREVISTO') ? COLORS.IMPREVISTO :
              morningBlock.title.includes('OUTROS') ? COLORS.OUTROS :
              COLORS.BLOQUEIO
            )
          )
        : morningSchs.length > 0
          ? renderCard(
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
            )
          : null}
    </div>

    <div className="flex-1 flex overflow-hidden">
      {afternoonBlock
        ? renderCard(
            afternoonBlock.title
              .replace('OUTROS - ', '')
              .replace('IMPREVISTO - ', ''),
            afternoonBlock.color || (
              afternoonBlock.title.includes('FÉRIAS') ? COLORS.FERIAS :
              afternoonBlock.title.includes('FOLGA') ? COLORS.FOLGA :
              afternoonBlock.title.includes('IMPREVISTO') ? COLORS.IMPREVISTO :
              afternoonBlock.title.includes('OUTROS') ? COLORS.OUTROS :
              COLORS.BLOQUEIO
            )
          )
        : afternoonSchs.length > 0
          ? renderCard(
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

  const checkImprovisoShift = (shift: Shift) => {
    if (!selection) return;
    const count = dataService.getSchedulesImpactedByImproviso(selection.userId, selection.dateIso, shift).length;
    setImpactCount(count);
    setImprovisoShift(shift);
  };

const setStatus = (title: string | null, shift: Shift = Shift.FULL_DAY, color?: string) => {
  if (!selection) return;

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
    setOutrosReason('');
    setOutrosColor(OUTROS_PALETTE[6].color);
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
  }

  if (title) {
    const analyst = analysts.find(a => a.id === selection.userId);

    const finalTitle =
      title === 'OUTROS'
        ? (outrosReason.trim() ? `OUTROS - ${outrosReason.trim()}` : 'OUTROS')
        : title === 'IMPREVISTO'
          ? (improvisoReason.trim() ? `IMPREVISTO - ${improvisoReason.trim()}` : 'IMPREVISTO')
          : title.toUpperCase();

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
  return s.datetime.split('T')[0] === dateIso;
});

const sameAnalystSchedules = sameDaySchedules.filter((s: any) => {
  return String(s?.analystId ?? '') === String(analystId ?? '');
});

let relatedSchedules = sameAnalystSchedules.filter((s: any) => {
  const scheduleShift = String(s?.shift ?? '').toUpperCase();
  const targetShift = String(shift ?? '').toUpperCase();

  if (scheduleShift === targetShift) return true;

  if (targetShift === 'MORNING') {
    return scheduleShift.includes('MORNING') || scheduleShift.includes('MANHA');
  }

  if (targetShift === 'AFTERNOON') {
    return scheduleShift.includes('AFTERNOON') || scheduleShift.includes('TARDE');
  }

  return false;
});

if (!relatedSchedules.length) {
  const sortedSchedules = [...sameAnalystSchedules].sort((a: any, b: any) => {
    const dateDiff =
      new Date(a?.datetime ?? '').getTime() - new Date(b?.datetime ?? '').getTime();

    if (dateDiff !== 0) return dateDiff;
    return String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
  });

  const maxPerShift = modality.toUpperCase().includes('PRES') ? 3 : 2;

  if (shift === 'MORNING') {
    relatedSchedules = sortedSchedules.slice(0, maxPerShift);
  } else {
    relatedSchedules = sortedSchedules.slice(maxPerShift, maxPerShift * 2);
  }
}

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

  return {
    time: getVisualScheduleTime(modality, shift, index + 1),
    technician: technicianName,
    city: `${technicianCity}${technicianState ? ' / ' + technicianState : ''}`,
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
  const items = buildAgendaTooltipData(
    params.analystId,
    params.dateIso,
    params.shift,
    params.technology,
    params.modality
  );

  const tooltipWidth = 340;
  const tooltipHeight = 220;
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

  if (!items.length) {
    setHoverTooltip({
      visible: true,
      x,
      y,
      title: `${params.technology} ${params.shift === 'MORNING' ? 'MANHÃ' : 'TARDE'}`,
      modality: params.modality.toUpperCase().includes('PRES') ? 'PRESENCIAL' : 'VIRTUAL',
      items: [
        {
          time: 'N/D',
          technician: 'SEM DADOS',
          city: 'VERIFICAR VÍNCULO',
        },
      ],
    });
    return;
  }

  setHoverTooltip({
  visible: true,
  x,
  y,
  title: `${params.technology} ${params.shift === 'MORNING' ? 'MANHÃ' : 'TARDE'}`,
  modality: params.modality.toUpperCase().includes('PRES') ? 'PRESENCIAL' : 'VIRTUAL',
  items
});
};

const moveAgendaTooltip = (e: React.MouseEvent) => {
  const tooltipWidth = 340;
  const tooltipHeight = 220;
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

return (


    <div className="flex flex-col space-y-6 h-full relative">
       {toast && (
        <div className={`fixed top-10 right-10 z-[300] px-8 py-4 rounded-2xl shadow-2xl font-black text-xs uppercase tracking-widest animate-in slide-in-from-right-10 duration-300 ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
          {toast.message}
        </div>
      )}

      <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx,.xls" onChange={handleFileUpload} />

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm gap-4">
        <div className="flex items-center space-x-4">
          <div className="flex bg-slate-50 border-2 border-slate-100 rounded-2xl overflow-hidden shadow-sm">
            <button onClick={() => navigateWeek(-1)} className="p-3 hover:bg-slate-200 border-r border-slate-100"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg></button>
            <div className="px-8 py-3 text-[10px] font-black text-slate-900 uppercase min-w-[220px] text-center tracking-widest">
              {weekDates[0].iso.split('-').reverse().slice(0,2).join('/')} — {weekDates[4].iso.split('-').reverse().slice(0,2).join('/')}
            </div>
            <button onClick={() => navigateWeek(1)} className="p-3 hover:bg-slate-200 border-l border-slate-100"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg></button>
          </div>
          
          {user.role === UserRole.ADMIN && (
            <div className="flex items-center gap-3 bg-amber-50 px-4 py-2.5 rounded-2xl border-2 border-amber-100">
               <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">MODO TESTE</span>
               <button 
                 onClick={() => dataService.setTestMode(!isTestMode)} 
                 className={`w-12 h-6 rounded-full relative transition-all ${isTestMode ? 'bg-amber-500' : 'bg-slate-300'}`}
               >
                 <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${isTestMode ? 'left-7' : 'left-1'}`}></div>
               </button>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          {isTestMode && user.role === UserRole.ADMIN && (
            <>
              <button onClick={() => dataService.downloadTestTemplate()} className="bg-slate-900 text-white px-5 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest shadow-md">Modelo Teste</button>
              <button onClick={() => fileInputRef.current?.click()} className="bg-amber-600 text-white px-5 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest shadow-md">Importar Teste</button>
              <button onClick={() => { if(confirm("Limpar toda a agenda de teste?")) dataService.clearTestSchedules(); }} className="bg-rose-600 text-white px-5 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest shadow-md">Limpar Teste</button>
            </>
          )}
          {!isTestMode && (
            <button onClick={() => setIsRangeModalOpen(true)} className="bg-claro-red text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase shadow-lg tracking-widest">Bloqueio Lote</button>
          )}
        </div>
      </div>

<div className={`bg-white border-2 rounded-[40px] shadow-sm overflow-y-auto overflow-x-auto flex-1 relative no-scrollbar transition-colors max-h-[calc(100vh-220px)] ${isTestMode ? 'border-amber-400 bg-amber-50/20' : 'border-slate-200'}`}>
      {isTestMode && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[50] bg-amber-500 text-white px-6 py-2 rounded-full font-black text-[10px] uppercase tracking-[0.3em] shadow-xl">Visualizando Ambiente de Teste</div>
        )}
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
            {analysts.map((analyst, aIdx) => (
              <React.Fragment key={analyst.id}>
                <tr className={`${aIdx % 2 === 0 ? 'bg-white' : 'bg-[#f5f7fa]'} border-b border-slate-900/10 h-24 transition-colors`}>
                  <td className="p-0 border-r-2 border-slate-300 sticky left-0 z-20 bg-inherit shadow-md h-24">
                    <div className="flex items-center p-4 h-full">
                      <span className={`w-1.5 h-8 mr-4 rounded-full ${aIdx % 2 === 0 ? 'bg-claro-red' : 'bg-slate-900'}`}></span>
                      <p className="font-black text-[11px] uppercase truncate">{analyst.normalizedLogin}</p>
                    </div>
                  </td>
                  {weekDates.map((date, idx) => (
                    <td 
                      key={idx} 
                      onClick={(e) => setSelection({ userId: analyst.id, dateIso: date.iso, rect: e.currentTarget.getBoundingClientRect() })} 
                      className="p-0 border-r border-slate-200/50 cursor-pointer overflow-hidden relative group h-24"
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
            ))}
          </tbody>
        </table>
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
              <button onClick={() => setStatus('FÉRIAS')} className="w-full text-left px-8 py-4 text-[11px] font-black text-claro-red hover:bg-claro-red hover:text-white uppercase transition-all tracking-wider">Lançar Férias</button>
              <button onClick={() => setStatus('FOLGA')} className="w-full text-left px-8 py-4 text-[11px] font-black text-slate-600 hover:bg-slate-600 hover:text-white uppercase transition-all tracking-wider">Lançar Folga</button>
              <button onClick={() => setStatus('IMPREVISTO')} className="w-full text-left px-8 py-4 text-[11px] font-black text-[#6A1B9A] hover:bg-[#6A1B9A] hover:text-white uppercase transition-all tracking-wider">Lançar Improviso</button>
              <button onClick={() => setStatus('FERIADO')} className="w-full text-left px-8 py-4 text-[11px] font-black text-slate-900 hover:bg-slate-100 uppercase transition-all tracking-wider">Treinamento</button>
              <button onClick={() => setStatus('OUTROS')} className="w-full text-left px-8 py-4 text-[11px] font-black text-[#455A64] hover:bg-[#455A64] hover:text-white uppercase transition-all tracking-wider">Outros (Motivo)</button>
              <button onClick={() => setStatus(null)} className="w-full text-left px-8 py-4 text-[11px] font-black text-slate-400 hover:bg-slate-50 uppercase transition-all tracking-wider mt-2 border-t border-slate-100 italic">Limpar Célula</button>
            </div>
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

      {isOutrosModalOpen && selection && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/70 backdrop-blur-md p-4">
          <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-sm overflow-hidden border-t-8 border-slate-900 animate-in zoom-in duration-300">
            <div className="bg-slate-900 p-8 text-white text-center">
              <h3 className="text-xl font-black uppercase tracking-tighter">Lançar Motivo</h3>
              <p className="text-[10px] font-bold uppercase mt-1 opacity-70">Descrição livre e escolha de cor</p>
            </div>
            <div className="p-8 space-y-6">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Descreva o Motivo</label>
                <input 
                  type="text" 
                  maxLength={150}
                  autoFocus
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3 text-sm font-bold outline-none focus:border-claro-red transition-all"
                  placeholder="EX: REUNIÃO, NR..."
                  value={outrosReason}
                  onChange={(e) => setOutrosReason(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Cor de Destaque</label>
                <div className="grid grid-cols-7 gap-2">
                  {OUTROS_PALETTE.map(item => (
                    <button
                      key={item.id}
                      onClick={() => setOutrosColor(item.color)}
                      title={item.label}
                      className={`w-full aspect-square rounded-lg border-2 transition-all transform hover:scale-110 ${outrosColor === item.color ? 'border-slate-900 shadow-md' : 'border-transparent'}`}
                      style={{ backgroundColor: item.color }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-4 p-8 pt-0">
              <button onClick={() => setIsOutrosModalOpen(false)} className="flex-1 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Voltar</button>
              <button onClick={() => setStatus('OUTROS', Shift.FULL_DAY, outrosColor)} className="flex-1 py-4 bg-slate-900 text-white text-xs font-black uppercase rounded-2xl shadow-xl hover:bg-black transition-colors tracking-widest">Gravar</button>
            </div>
          </div>
        </div>
      )}

                 {isRangeModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/70 backdrop-blur-md p-4">
          
        </div>
      )}

            {hoverTooltip?.visible && (
        <div
          className="fixed z-[9999] pointer-events-none bg-slate-900 text-white rounded-2xl shadow-2xl px-4 py-3 min-w-[280px] max-w-[360px] border border-white/10"
          style={{
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
              {hoverTooltip.items.map((item, index) => (
                <div key={index} className="bg-white/5 rounded-xl px-3 py-2">
                  <div className="text-[11px] font-black uppercase tracking-wide">
                    {item.time} — {item.technician}
                  </div>
                  <div className="text-[10px] text-white/70 font-bold uppercase tracking-wide mt-1">
                    {item.city}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        )}
    </div>
  );
};

export default Agenda;
