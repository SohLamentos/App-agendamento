
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
  
  const [isImprovisoModal, setIsImprovisoModal] = useState(false);
  const [improvisoShift, setImprovisoShift] = useState<Shift>(Shift.MORNING);
  const [impactCount, setImpactCount] = useState(0);

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
    TREINAMENTO: '#000000'
  };

  const getCellContent = (userId: string, dateIso: string) => {
    const dayBlocks = events.filter(e => e.involvedUserIds.includes(userId) && e.startDatetime.startsWith(dateIso));
    const daySchs = schedules.filter(s => s.analystId === userId && s.datetime.startsWith(dateIso) && s.status !== ScheduleStatus.CANCELLED);

    const renderCard = (title: string, color: string) => (
      <div 
        className="w-full h-full flex items-center justify-center font-black text-[12px] uppercase text-white text-center leading-tight px-1 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)] animate-in fade-in duration-300" 
        style={{ backgroundColor: color }}
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
      else if (title.includes('TREINAMENTO')) color = COLORS.TREINAMENTO;

      const displayTitle = title.includes('OUTROS - ') ? title.replace('OUTROS - ', '') : title;
      return renderCard(displayTitle, color);
    }

    const morningBlock = dayBlocks.find(b => b.shift === Shift.MORNING);
    const afternoonBlock = dayBlocks.find(b => b.shift === Shift.AFTERNOON);
    
    const morningSchs = daySchs.filter(s => s.shift === Shift.MORNING);
    const afternoonSchs = daySchs.filter(s => s.shift === Shift.AFTERNOON);

    return (
      <div className="flex flex-col h-full w-full overflow-hidden">
        <div className="flex-1 flex overflow-hidden border-b border-white/20">
          {morningBlock ? renderCard(morningBlock.title.replace('OUTROS - ', ''), morningBlock.color || (morningBlock.title.includes('FÉRIAS') ? COLORS.FERIAS : morningBlock.title.includes('FOLGA') ? COLORS.FOLGA : morningBlock.title.includes('OUTROS') ? COLORS.OUTROS : COLORS.BLOQUEIO)) : 
           morningSchs.length > 0 ? renderCard(formatScheduleTitle(morningSchs)!, morningSchs[0].type === ExpertiseType.VIRTUAL ? COLORS.VIRTUAL : COLORS.PRESENTIAL) : null}
        </div>
        <div className="flex-1 flex overflow-hidden">
          {afternoonBlock ? renderCard(afternoonBlock.title.replace('OUTROS - ', ''), afternoonBlock.color || (afternoonBlock.title.includes('FÉRIAS') ? COLORS.FERIAS : afternoonBlock.title.includes('FOLGA') ? COLORS.FOLGA : afternoonBlock.title.includes('OUTROS') ? COLORS.OUTROS : COLORS.BLOQUEIO)) : 
           afternoonSchs.length > 0 ? renderCard(formatScheduleTitle(afternoonSchs)!, afternoonSchs[0].type === ExpertiseType.VIRTUAL ? COLORS.VIRTUAL : COLORS.PRESENTIAL) : null}
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

    if (title === 'IMPREVISTO' && !isImprovisoModal) {
      checkImprovisoShift(Shift.FULL_DAY);
      setIsImprovisoModal(true);
      return;
    }

    if (title === 'OUTROS' && !isOutrosModalOpen) {
      setOutrosReason('');
      setOutrosColor(OUTROS_PALETTE[6].color);
      setIsOutrosModalOpen(true);
      return;
    }

    if (title === 'IMPREVISTO' && isImprovisoModal) {
       dataService.applyImprovisoCancellation(selection.userId, selection.dateIso, shift);
    }

    if (shift === Shift.FULL_DAY) {
      dataService.removeEvent(selection.userId, selection.dateIso);
    }

    if (title) {
      const analyst = analysts.find(a => a.id === selection.userId);
      const finalTitle = title === 'OUTROS' 
        ? (outrosReason.trim() ? `OUTROS - ${outrosReason.trim()}` : 'OUTROS')
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
      if (title === 'IMPREVISTO') setToast({message: `Imprevisto lançado e ${impactCount} técnicos cancelados.`, type: 'success'});
    } else if (title === null) {
      dataService.removeEvent(selection.userId, selection.dateIso);
    }

    setSelection(null);
    setIsImprovisoModal(false);
    setIsOutrosModalOpen(false);
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

      <div className={`bg-white border-2 rounded-[40px] shadow-sm overflow-auto flex-1 relative no-scrollbar transition-colors ${isTestMode ? 'border-amber-400 bg-amber-50/20' : 'border-slate-200'}`}>
        {isTestMode && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[50] bg-amber-500 text-white px-6 py-2 rounded-full font-black text-[10px] uppercase tracking-[0.3em] shadow-xl">Visualizando Ambiente de Teste</div>
        )}
        <table className="w-full border-collapse table-fixed min-w-[1400px]">
          <thead className="sticky top-0 z-30">
            <tr className="bg-slate-900 text-white shadow-xl">
              <th className="w-72 p-4 text-left font-black text-[11px] border-r-2 border-white/20 sticky left-0 top-0 z-40 bg-slate-900 uppercase tracking-widest">Equipe Analistas</th>
              {weekDates.map((d, idx) => <th key={idx} className="p-4 text-center font-black text-[11px] border-r border-white/10 uppercase tracking-widest bg-slate-900">{d.formatted}</th>)}
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
              <button onClick={() => setStatus('TREINAMENTO')} className="w-full text-left px-8 py-4 text-[11px] font-black text-slate-900 hover:bg-slate-100 uppercase transition-all tracking-wider">Treinamento</button>
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
               
               {impactCount > 0 && (
                 <div className="bg-rose-50 p-4 rounded-2xl border border-rose-100 animate-in shake duration-500">
                    <p className="text-[10px] font-black text-rose-600 uppercase leading-tight tracking-tighter">
                      ⚠️ Este imprevisto irá cancelar {impactCount} agendamentos já existentes e mover os técnicos para CANCELADOS (ANALISTA). Deseja continuar?
                    </p>
                 </div>
               )}
            </div>
            <div className="flex gap-4 p-8 pt-0">
              <button onClick={() => setIsImprovisoModal(false)} className="flex-1 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Voltar</button>
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-md overflow-hidden border-t-8 border-claro-red animate-in zoom-in duration-300">
            <div className="bg-claro-red p-10 text-white">
              <h3 className="text-xl font-black uppercase tracking-tighter">Bloqueio em Lote</h3>
              <p className="text-[10px] font-bold text-white/70 uppercase mt-1 tracking-widest">Escala de Indisponibilidade</p>
            </div>
            <div className="p-10 space-y-6">
              <select className="w-full border-2 border-slate-100 bg-slate-50 rounded-2xl p-4 text-xs font-black uppercase outline-none focus:border-claro-red" value={rangeAnalystId} onChange={e => setRangeAnalystId(e.target.value)}>
                <option value="">SELECIONAR ANALISTA...</option>
                {analysts.map(a => <option key={a.id} value={a.id}>{a.normalizedLogin}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase ml-1">Início</label>
                  <input type="date" className="w-full border-2 border-slate-100 bg-slate-50 rounded-2xl p-4 text-xs font-black" value={rangeStart} onChange={e => setRangeStart(e.target.value)} />
                </div>
                <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase ml-1">Término</label>
                  <input type="date" className="w-full border-2 border-slate-100 bg-slate-50 rounded-2xl p-4 text-xs font-black" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} />
                </div>
              </div>
              <select className="w-full border-2 border-slate-100 bg-slate-50 rounded-2xl p-4 text-xs font-black uppercase outline-none focus:border-claro-red" value={rangeTitle} onChange={e => setRangeTitle(e.target.value)}>
                <option value="FÉRIAS">FÉRIAS</option>
                <option value="FOLGA">FOLGA</option>
                <option value="TREINAMENTO">TREINAMENTO</option>
                <option value="REUNIÃO">REUNIÃO TÉCNICA</option>
              </select>
            </div>
            <div className="flex gap-4 p-10 pt-0">
              <button onClick={() => setIsRangeModalOpen(false)} className="flex-1 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Cancelar</button>
              <button onClick={() => { dataService.addEventRange(rangeAnalystId, rangeStart, rangeEnd, rangeTitle, 'Other'); setIsRangeModalOpen(false); setToast({message: 'Lote gravado com sucesso!', type: 'success'}); }} disabled={!rangeAnalystId || !rangeStart || !rangeEnd} className="flex-1 py-4 bg-claro-red text-white text-xs font-black uppercase rounded-2xl shadow-xl disabled:opacity-30 tracking-widest">Gravar Lote</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Agenda;
