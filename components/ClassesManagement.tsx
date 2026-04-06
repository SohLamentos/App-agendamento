import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { dataService, ImportResult, StatusEngine, ManualScheduleValidationResult, SchedulingSummary } from '../services/dataService';
import { User, UserRole, Technician, TrainingClass, CertificationProcessStatus, ExpertiseType, Shift } from '../types';

interface ClassesManagementProps {
  user: User;
}

const ClassesManagement: React.FC<ClassesManagementProps> = ({ user }) => {
  const [activeSubTab, setActiveSubTab] = useState<string>('technicians');
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Filtros Agendados
  const [filterAnalystId, setFilterAnalystId] = useState<string>('');
  const [filterDateStart, setFilterDateStart] = useState<string>('');
  const [filterDateEnd, setFilterDateEnd] = useState<string>('');

  const [technicians, setTechnicians] = useState<Technician[]>(dataService.getTechnicians());
  const [trainingClasses, setTrainingClasses] = useState<TrainingClass[]>(dataService.getTrainingClasses());
  const [schedules, setSchedules] = useState(dataService.getSchedules());
  const [allUsers, setAllUsers] = useState(dataService.getUsers());
  
  const [selectedTechIds, setSelectedTechIds] = useState<Set<string>>(new Set());
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // NOVO FLUXO INSERIR TURMA
  const [isClassWizardOpen, setIsClassWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [formClass, setFormClass] = useState({
    type: 'GPON' as 'GPON' | 'HFC' | 'OUTROS',
    requiresCert: true,
    classNumber: '',
    subcategory: 'Capacitação Inicial',
    customSubcategory: ''
  });
  const [isOutrosCertWarningOpen, setIsOutrosCertWarningOpen] = useState(false);
  const [isNoCertClassWarningOpen, setIsNoCertClassWarningOpen] = useState(false);
  const [isFinalSummaryOpen, setIsFinalSummaryOpen] = useState(false);
  const [lastClassCreated, setLastClassCreated] = useState<TrainingClass | null>(null);

  // Validação de Cabeçalho
  const [isHeaderErrorModalOpen, setIsHeaderErrorModalOpen] = useState(false);
  const [headerErrors, setHeaderErrors] = useState<string[]>([]);

  // Gerenciamento individual
  const [selectedTechnician, setSelectedTechnician] = useState<Technician | null>(null);
  const [isManagementModalOpen, setIsManagementModalOpen] = useState(false);
  const [withdrawType, setWithdrawType] = useState<string>('');
  const [withdrawSubReason, setWithdrawSubReason] = useState<string>('');
  const [withdrawObservation, setWithdrawObservation] = useState<string>('');
  
  // Agendamento Manual
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualTechId, setManualTechId] = useState('');
  const [manualAnalystId, setManualAnalystId] = useState('');
  const [manualDate, setManualDate] = useState('');
  const [manualType, setManualType] = useState<ExpertiseType>(ExpertiseType.VIRTUAL);
  const [manualShift, setManualShift] = useState<Shift>(Shift.MORNING);
  const [isForceConfirmOpen, setIsForceConfirmOpen] = useState(false);
  const [validationResult, setValidationResult] = useState<ManualScheduleValidationResult | null>(null);

  // Agendamento Automático (GERAR AGENDAMENTO)
  const [schedulingStartDate, setSchedulingStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSchedulingConfirmOpen, setIsSchedulingConfirmOpen] = useState(false);
  const [schedulingSummary, setSchedulingSummary] = useState<SchedulingSummary | null>(null);
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);
  
  // Feedback
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  const analysts = useMemo(() => allUsers.filter(u => u.role === UserRole.ANALYST && u.active), [allUsers]);

  const refreshData = () => {
    setTechnicians(dataService.getTechnicians());
    setTrainingClasses(dataService.getTrainingClasses());
    setSchedules(dataService.getSchedules());
    setAllUsers(dataService.getUsers());
    setSelectedTechIds(new Set());
  };

  useEffect(() => {
    window.addEventListener('data-updated', refreshData);
    return () => window.removeEventListener('data-updated', refreshData);
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Inteligência do Dropdown de Turmas (LISTAR APENAS TURMAS COM TÉCNICOS NA FILA ATUAL)
  const availableClassesForFilter = useMemo(() => {
    const currentTabDef = StatusEngine.find(t => t.key === activeSubTab) || StatusEngine[0];
    
    return trainingClasses.map(c => {
      // Contar técnicos desta turma que atendem ao critério da aba ativa
      const count = technicians.filter(t => 
        t.trainingClassId === c.id && 
        currentTabDef.filter(t)
      ).length;
      
      return { ...c, count };
    }).filter(c => c.count > 0);
  }, [trainingClasses, technicians, activeSubTab]);

  const filteredTechs = useMemo(() => {
    const currentTab = StatusEngine.find(t => t.key === activeSubTab) || StatusEngine[0];
    const pool = technicians.filter(t => {
      if (!currentTab.filter(t)) return false;
      
      const matchesSearch = (t.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || (t.cpf && t.cpf.includes(searchTerm));
      if (!matchesSearch) return false;

      // Logica de Filtro Especial para Backlog Geral
      if (selectedClassId === 'GLOBAL_BACKLOG') {
        if (t.status_principal !== 'BACKLOG AGUARDANDO') return false;
      } else if (selectedClassId && (t.trainingClassId || "SEM TURMA") !== selectedClassId) {
        return false;
      }

      if (activeSubTab === 'scheduled') {
        const sch = schedules.find(s => s.id === t.scheduledCertificationId);
        if (filterAnalystId && sch?.analystId !== filterAnalystId) return false;
        if (filterDateStart || filterDateEnd) {
          if (!sch?.datetime) return false;
          const schDate = sch.datetime.split('T')[0];
          if (filterDateStart && schDate < filterDateStart) return false;
          if (filterDateEnd && schDate > filterDateEnd) return false;
        }
      }

      return true;
    });
    return pool;
  }, [technicians, activeSubTab, searchTerm, selectedClassId, filterAnalystId, filterDateStart, filterDateEnd, schedules]);

  // WIZARD HANDLERS
  const handleOpenWizard = () => {
    setFormClass({ 
      type: 'GPON', 
      requiresCert: true, 
      classNumber: '', 
      subcategory: 'Capacitação Inicial',
      customSubcategory: ''
    });
    setWizardStep(1);
    setIsClassWizardOpen(true);
  };

  const handleStep1Next = () => {
    if (!formClass.classNumber) {
      setToast({ message: 'O Número da Turma é obrigatório.', type: 'error' });
      return;
    }

    if (formClass.subcategory === 'Outros' && !formClass.customSubcategory.trim()) {
      setToast({ message: 'Por favor, descreva a subcategoria personalizada.', type: 'error' });
      return;
    }

    if (formClass.type === 'OUTROS' && formClass.requiresCert) {
      setIsOutrosCertWarningOpen(true);
      return;
    }

    if (!formClass.requiresCert) {
      setIsNoCertClassWarningOpen(true);
      return;
    }

    setWizardStep(2);
  };

  const validateHeader = (row: any[]): { isValid: boolean; errors: string[] } => {
    if (!row || !Array.isArray(row) || row.length === 0) {
      return { isValid: false, errors: ['O arquivo parece estar vazio ou sem cabeçalho.'] };
    }

    const errors: string[] = [];
    const normalizedCols = row.map(col => {
      if (col === null || col === undefined) return "";
      let s = String(col).trim().toUpperCase().replace(/\s+/g, ' ');
      // Mapeamentos específicos
      if (s === "E-MAIL") s = "EMAIL";
      if (s === "LOGINTOA") s = "LOGIN TOA";
      if (s === "EMPRESA / PARCEIRO") s = "EMPRESA/PARCEIRO";
      if (s === "EMPRESA/ PARCEIRO") s = "EMPRESA/PARCEIRO";
      if (s === "EMPRESA /PARCEIRO") s = "EMPRESA/PARCEIRO";
      return s;
    });

    const hasCol = (name: string) => normalizedCols.includes(name);

    if (!hasCol("NOME")) errors.push('Coluna "Nome" não encontrada.');
    if (!hasCol("CIDADE")) errors.push('Coluna "Cidade" não encontrada.');
    if (!hasCol("ESTADO")) errors.push('Coluna "Estado" não encontrada.');
    
    if (!hasCol("CPF") && !hasCol("LOGIN TOA")) {
      errors.push('O arquivo deve conter pelo menos uma das colunas: "CPF" ou "Login TOA".');
    }

    if (hasCol("LOGIN") && hasCol("TOA")) {
      errors.push('As colunas "Login" e "TOA" estão separadas. Use "Login TOA" em uma única coluna.');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  };

  const handleFileForClass = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const firstSheet = workbook.Sheets[firstSheetName];
        const rawData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][];
        
        // Validação de Cabeçalho
        const validation = validateHeader(rawData[0]);
        if (!validation.isValid) {
          setHeaderErrors(validation.errors);
          setIsHeaderErrorModalOpen(true);
          return;
        }

        const subcategoryValue = formClass.subcategory === 'Outros' 
          ? formClass.customSubcategory.trim()
          : formClass.subcategory;

        // Criar turma e importar técnicos
        const classObj = dataService.createTrainingClass({
          ...formClass,
          subcategory: subcategoryValue
        });
        const res = dataService.importTechniciansForClass(classObj, rawData);
        
        setLastClassCreated(classObj);
        setImportResult(res);
        setIsClassWizardOpen(false);
        setIsFinalSummaryOpen(true);
      } catch (err: any) {
        setToast({ message: 'Erro ao processar turma: ' + err.message, type: 'error' });
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleApproveTech = (tech: Technician) => {
    if (!tech || !tech.id) {
      setToast({ message: "Não foi possível identificar o técnico da linha.", type: 'error' });
      return;
    }

    if (confirm(`Mover técnico para APROVADOS?`)) {
      const res = dataService.approveScheduledTechnician(tech.id);
      if (res.success) {
        setToast({message: 'Técnico movido para APROVADOS.', type: 'success'});
      } else {
        setToast({ message: `Falha ao aprovar: ${res.message || 'Erro de sistema'}`, type: 'error' });
      }
    }
  };

  const handleWithdrawConfirm = () => {
    if (!selectedTechnician || !withdrawType || !withdrawSubReason) return;

    let targetStatus = '';
    let category = '';

    if (withdrawType === 'REPROVADOS') {
      targetStatus = 'REPROVADO';
      const catMap: Record<string, string> = {
        'NOSHOW': 'NOSHOW',
        'SEM EAD': 'EAD',
        'REPROVADO EAD': 'EAD',
        'REPROVADO VIRTUAL': 'VIRTUAL',
        'REPROVADO CERTIFICAÇÃO': 'CERTIFICACAO'
      };
      category = catMap[withdrawSubReason] || '';
    } else if (withdrawType === 'NÃO REALIZAR') {
      targetStatus = 'INABILITADO';
    } else if (withdrawType === 'AGENDAR POSTERIORMENTE') {
      targetStatus = 'CANCELADO_ANALISTA';
    }

    const res = dataService.withdrawScheduling({
      techId: selectedTechnician.id,
      statusPrincipal: targetStatus,
      subReason: withdrawSubReason,
      observation: withdrawObservation,
      category: category
    });

    if (res.success) {
      setToast({ message: `Atualizado: ${targetStatus} – ${withdrawSubReason}`, type: 'success' });
      setIsManagementModalOpen(false);
      setSelectedTechnician(null);
      setWithdrawType('');
      setWithdrawSubReason('');
      setWithdrawObservation('');
    } else {
      setToast({ message: 'Falha ao atualizar técnico.', type: 'error' });
    }
  };

  const handleManualScheduleSubmit = () => {
    if (!manualTechId || !manualAnalystId || !manualDate) return;
    const validation = dataService.validateManualSchedule(manualTechId, manualAnalystId, manualDate, manualShift, manualType);
    if (!validation.canSchedule) {
      setValidationResult(validation);
      setIsForceConfirmOpen(true);
    } else {
      executeManualSchedule(false);
    }
  };

  const executeManualSchedule = (forced: boolean) => {
    const res = dataService.manualScheduleReinforced({
      techId: manualTechId,
      analystId: manualAnalystId,
      dateIso: manualDate,
      shift: manualShift,
      type: manualType,
      forced,
      brokenRules: validationResult?.brokenRules
    });
    if (res.success) {
      setToast({message: forced ? 'Agendamento FORÇADO com sucesso!' : 'Agendamento manual realizado.', type: 'success'});
      setIsManualModalOpen(false);
      setIsForceConfirmOpen(false);
      setValidationResult(null);
    }
  };

  const handleRunAutomaticScheduling = () => {
    if (selectedClassId === 'GLOBAL_BACKLOG') {
      setToast({message: 'Selecione uma turma para gerar agendamento.', type: 'error'});
      return;
    }
    if (!schedulingStartDate) {
      setToast({message: 'Selecione uma data válida "A PARTIR DE".', type: 'error'});
      return;
    }
    const today = new Date().toISOString().split('T')[0];
    if (schedulingStartDate < today) {
      setToast({message: 'A data inicial não pode ser no passado.', type: 'error'});
      return;
    }
    setIsSchedulingConfirmOpen(true);
  };

  const executeAutomaticScheduling = () => {
    setIsSchedulingConfirmOpen(false);
    try {
      const summary = dataService.runSmartSchedulingReinforced(schedulingStartDate);
      setSchedulingSummary(summary);
      setIsSummaryModalOpen(true);
    } catch (error: any) {
      setToast({ message: `Falha ao gerar agendamento: ${error.message}`, type: 'error' });
    }
  };

  const openFilePickerTecnicos = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const subReasons = useMemo(() => {
    if (withdrawType === 'REPROVADOS') return ['NOSHOW', 'SEM EAD', 'REPROVADO EAD', 'REPROVADO VIRTUAL', 'REPROVADO CERTIFICAÇÃO'];
    if (withdrawType === 'NÃO REALIZAR') return ['GESTOR', 'TREINAMENTO NÃO NECESSITA'];
    if (withdrawType === 'AGENDAR POSTERIORMENTE') return ['SOLICITADO PELO GESTOR', 'ANALISTA INDISPONÍVEL'];
    return [];
  }, [withdrawType]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 relative">
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        accept=".xlsx,.xls,.csv" 
        onChange={handleFileForClass} 
      />

      {toast && (
        <div className={`fixed top-10 right-10 z-[300] px-8 py-4 rounded-2xl shadow-2xl font-black text-xs uppercase tracking-widest animate-in slide-in-from-right-10 duration-300 ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
          {toast.message}
        </div>
      )}

      {/* ActionBar Fixa */}
      <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm flex flex-col xl:flex-row xl:items-center justify-between gap-6">
        
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex flex-col">
            <span className="text-[9px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-widest">Busca Geral:</span>
            <input 
              type="text" 
              placeholder="NOME OU CPF..." 
              className="text-xs border-2 border-slate-50 rounded-2xl px-5 py-3 outline-none focus:border-claro-red font-bold uppercase w-64 bg-slate-50 shadow-inner" 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
            />
          </div>

          <div className="flex flex-col">
            <span className="text-[9px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-widest">Filtrar Turma:</span>
            <select 
              className="text-xs border-2 border-slate-50 rounded-2xl px-5 py-3 outline-none focus:border-claro-red font-bold uppercase bg-slate-50 w-72 shadow-inner" 
              value={selectedClassId || ''} 
              onChange={e => setSelectedClassId(e.target.value || null)}
            >
              <option value="">TODAS AS TURMAS</option>
              {activeSubTab === 'technicians' && (
                <option value="GLOBAL_BACKLOG" className="text-claro-red font-black">BACKLOG — Todas as Turmas</option>
              )}
              
              {availableClassesForFilter.length > 0 ? (
                availableClassesForFilter.map(c => (
                  <option key={c.id} value={c.id}>{c.title} ({c.count})</option>
                ))
              ) : (
                <option disabled value="">SEM TURMAS COM TÉCNICOS NESTA FILA</option>
              )}
            </select>
          </div>

          <div className={`flex flex-wrap items-center gap-6 ${activeSubTab === 'scheduled' ? 'flex' : 'hidden'}`}>
            <div className="flex flex-col">
              <span className="text-[9px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-widest">Analista:</span>
              <select 
                className="text-xs border-2 border-slate-50 rounded-2xl px-5 py-3 outline-none focus:border-claro-red font-bold uppercase bg-slate-50 w-48 shadow-inner" 
                value={filterAnalystId} 
                onChange={e => setFilterAnalystId(e.target.value)}
              >
                <option value="">TODOS</option>
                {analysts.map(a => <option key={a.id} value={a.id}>{a.fullName}</option>)}
              </select>
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-widest">Intervalo (DE/ATÉ):</span>
              <div className="flex gap-2">
                <input type="date" className="text-xs border-2 border-slate-50 rounded-2xl px-5 py-3 outline-none focus:border-claro-red font-bold uppercase bg-slate-50 shadow-inner" value={filterDateStart} onChange={e => setFilterDateStart(e.target.value)} />
                <input type="date" className="text-xs border-2 border-slate-50 rounded-2xl px-5 py-3 outline-none focus:border-claro-red font-bold uppercase bg-slate-50 shadow-inner" value={filterDateEnd} onChange={e => setFilterDateEnd(e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className={`flex flex-wrap items-center gap-3 ${activeSubTab === 'technicians' ? 'flex' : 'hidden'}`}>
            <button 
              onClick={handleOpenWizard} 
              className="bg-emerald-600 text-white text-[10px] px-6 py-3 rounded-2xl font-black uppercase tracking-widest hover:bg-emerald-700 shadow-lg transition-all"
            >
              Inserir Turma
            </button>
            <button 
              onClick={() => dataService.downloadTemplate()} 
              className="bg-white text-slate-900 border-2 border-slate-100 text-[10px] px-6 py-3 rounded-2xl font-black uppercase tracking-widest hover:border-slate-300 shadow-sm transition-all"
            >
              Baixar Modelo
            </button>
            
            <div className="h-10 w-px bg-slate-100 mx-2 hidden xl:block"></div>

            <div className="flex flex-col">
              <span className="text-[9px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-widest">A PARTIR DE:</span>
              <input 
                type="date" 
                className="text-xs border-2 border-slate-100 rounded-2xl px-5 py-2.5 outline-none focus:border-emerald-600 font-bold uppercase bg-white shadow-sm"
                value={schedulingStartDate}
                onChange={e => setSchedulingStartDate(e.target.value)}
              />
            </div>
            <button 
              onClick={handleRunAutomaticScheduling} 
              className={`mt-5 bg-emerald-600 text-white text-[10px] px-6 py-3 rounded-2xl font-black uppercase tracking-widest hover:bg-emerald-700 shadow-lg transition-all ${selectedClassId === 'GLOBAL_BACKLOG' ? 'opacity-50' : ''}`}
            >
              Gerar Agendamento
            </button>
          </div>

          <div className={`flex items-center gap-3 ${['pending', 'failed', 'analyst_cancelled', 'ineligible', 'training_no_cert'].includes(activeSubTab) ? 'flex' : 'hidden'}`}>
             <button 
              onClick={() => setIsManualModalOpen(true)} 
              className="bg-claro-red text-white text-[10px] px-8 py-3.5 rounded-2xl font-black uppercase tracking-widest hover:bg-claro-redHover shadow-xl transition-all"
             >
               Agendamento Manual
             </button>
          </div>
        </div>
      </div>

      <div className="flex space-x-6 px-4 overflow-x-auto pb-2 no-scrollbar border-b border-slate-100">
        {StatusEngine.map(tab => (
          <button 
            key={tab.key} 
            onClick={() => { setActiveSubTab(tab.key); setSelectedClassId(''); }} 
            className={`pb-4 text-[10px] font-black uppercase border-b-4 transition-all tracking-widest flex items-center gap-2 whitespace-nowrap ${activeSubTab === tab.key ? 'border-claro-red text-claro-red' : 'border-transparent text-slate-400'}`}
          >
            {tab.label} {activeSubTab === tab.key && (tab.key === 'technicians' || tab.key === 'training_no_cert') && `(${filteredTechs.length})`}
          </button>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-[40px] shadow-sm overflow-hidden">
        <table className="w-full text-left text-xs uppercase">
          <thead className="bg-slate-50 border-b border-slate-200 font-black text-slate-400">
            <tr>
              <th className="px-10 py-6 tracking-widest">Técnico</th>
              <th className="px-10 py-6 tracking-widest">Território</th>
              <th className="px-10 py-6 tracking-widest">Status Atual</th>
              <th className="px-10 py-6 text-right tracking-widest">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filteredTechs.length > 0 ? filteredTechs.map(tech => (
              <tr key={tech.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-10 py-6">
                  <p className="font-black text-slate-900 tracking-wider">{tech.name}</p>
                  <p className="text-[9px] text-slate-400 font-bold">{tech.cpf}</p>
                  
                  {/* EXIBIÇÃO DE DETALHES DO AGENDAMENTO (DATA, PERÍODO, TECNOLOGIA) */}
                  {activeSubTab === 'scheduled' && tech.scheduledCertificationId && (
                    (() => {
                      const sch = schedules.find(s => s.id === tech.scheduledCertificationId);
                      if (!sch) return null;
                      const formattedDate = sch.datetime ? new Date(sch.datetime).toLocaleDateString('pt-BR') : 'N/D';
                      const shiftLabel = sch.shift === Shift.MORNING ? 'MANHÃ' : sch.shift === Shift.AFTERNOON ? 'TARDE' : sch.shift === Shift.FULL_DAY ? 'INTEGRAL' : 'N/D';
                      const techType = sch.technology || 'N/D';
                      return (
                        <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                          <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[8px] font-black border border-slate-200 tracking-tighter">📅 {formattedDate}</span>
                          <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[8px] font-black border border-slate-200 tracking-tighter">⏰ {shiftLabel}</span>
                          <span className="bg-claro-red/10 text-claro-red px-2 py-0.5 rounded text-[8px] font-black border border-claro-red/10 tracking-tighter">🏷️ {techType}</span>
                        </div>
                      );
                    })()
                  )}

                  {activeSubTab === 'technicians' && (
                    <p className="text-[9px] text-amber-600 font-black mt-0.5">PENDENTE_CERTIFICAÇÃO</p>
                  )}
                </td>
                <td className="px-10 py-6 font-bold text-slate-600">{tech.city} / {tech.state}</td>
                <td className="px-10 py-6 font-bold text-slate-400">
                   {tech.status_principal || tech.certificationProcessStatus}
                   {tech.status_submotivo && <p className="text-[8px] italic opacity-50 mt-1">{tech.status_submotivo}</p>}
                </td>
                <td className="px-10 py-6 text-right flex items-center justify-end gap-2">
                  {(activeSubTab === 'scheduled' || activeSubTab === 'training_no_cert') && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleApproveTech(tech); }} 
                      className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-[9px] font-black uppercase hover:bg-emerald-700 transition-all shadow-sm"
                    >
                      Aprovar
                    </button>
                  )}
                  <button 
                    onClick={(e) => { e.stopPropagation(); setSelectedTechnician(tech); setIsManagementModalOpen(true); }} 
                    className="bg-slate-900 text-white px-4 py-2 rounded-xl text-[9px] font-black uppercase hover:bg-black transition-all"
                  >
                    Gerenciar
                  </button>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={4} className="px-10 py-24 text-center">
                  <div className="flex flex-col items-center opacity-20">
                    <span className="text-4xl mb-4">📭</span>
                    <p className="font-black text-slate-400 uppercase tracking-widest text-sm">Nenhum registro localizado</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Restante dos modais mantidos conforme original */}
      {isClassWizardOpen && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4">
          <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-lg overflow-hidden border-t-8 border-slate-900 animate-in zoom-in duration-300">
            <div className="bg-slate-900 p-8 text-white flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tighter">Inserir Turma</h3>
                <p className="text-[10px] font-bold uppercase opacity-70 tracking-widest">Etapa {wizardStep} de 2</p>
              </div>
              <button onClick={() => setIsClassWizardOpen(false)} className="text-white/30 hover:text-white uppercase font-black text-[10px]">Cancelar</button>
            </div>

            {wizardStep === 1 ? (
              <div className="p-10 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Tipo da Turma</label>
                    <select 
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3 text-xs font-bold uppercase outline-none focus:border-claro-red"
                      value={formClass.type}
                      onChange={e => setFormClass({...formClass, type: e.target.value as any})}
                    >
                      <option value="GPON">GPON</option>
                      <option value="HFC">HFC</option>
                      <option value="OUTROS">OUTROS</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Exige Certificação?</label>
                    <div className="flex gap-4 items-center h-full pt-1">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" className="accent-claro-red" checked={formClass.requiresCert} onChange={() => setFormClass({...formClass, requiresCert: true})} />
                        <span className="text-[10px] font-black uppercase">SIM</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" className="accent-claro-red" checked={!formClass.requiresCert} onChange={() => setFormClass({...formClass, requiresCert: false})} />
                        <span className="text-[10px] font-black uppercase">NÃO</span>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Subcategoria da Turma</label>
                  <div className="flex flex-wrap gap-4 pt-1">
                    {['Capacitação Inicial', 'Veterano', 'Outros'].map(sub => (
                      <label key={sub} className="flex items-center gap-2 cursor-pointer">
                        <input 
                          type="radio" 
                          name="subcategory"
                          className="accent-claro-red" 
                          checked={formClass.subcategory === sub} 
                          onChange={() => setFormClass({...formClass, subcategory: sub})} 
                        />
                        <span className="text-[10px] font-black uppercase">{sub}</span>
                      </label>
                    ))}
                  </div>
                  {formClass.subcategory === 'Outros' && (
                    <input 
                      type="text" 
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3 text-xs font-bold uppercase outline-none focus:border-claro-red mt-2 animate-in slide-in-from-top-1"
                      placeholder="ESPECIFIQUE A SUBCATEGORIA..."
                      value={formClass.customSubcategory}
                      onChange={e => setFormClass({...formClass, customSubcategory: e.target.value})}
                    />
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Número da Turma</label>
                  <input 
                    type="text" 
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3 text-xs font-bold uppercase outline-none focus:border-claro-red"
                    placeholder="EX: 2024-001"
                    value={formClass.classNumber}
                    onChange={e => setFormClass({...formClass, classNumber: e.target.value})}
                  />
                </div>

                <div className="flex gap-4 pt-4">
                  <button onClick={() => setIsClassWizardOpen(false)} className="flex-1 py-4 text-xs font-black text-slate-400 uppercase tracking-widest hover:bg-slate-50 rounded-2xl transition-colors">Cancelar</button>
                  <button onClick={handleStep1Next} className="flex-1 py-4 bg-slate-900 text-white text-xs font-black uppercase rounded-2xl shadow-xl tracking-widest hover:bg-black transition-all">Próximo</button>
                </div>
              </div>
            ) : (
              <div className="p-10 space-y-8">
                <div className="bg-slate-50 p-6 rounded-[32px] border border-slate-100 space-y-3">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Resumo da Turma:</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <p className="text-[8px] font-black text-slate-400 uppercase">Nome da Turma (Gerado)</p>
                      <p className="text-xs font-black text-slate-900 uppercase">
                        {formClass.type} — {formClass.subcategory === 'Outros' ? formClass.customSubcategory : formClass.subcategory} — TURMA {formClass.classNumber}
                      </p>
                    </div>
                    <div>
                      <p className="text-[8px] font-black text-slate-400 uppercase">Número</p>
                      <p className="text-xs font-black text-slate-900">{formClass.classNumber}</p>
                    </div>
                    <div>
                      <p className="text-[8px] font-black text-slate-400 uppercase">Certificação</p>
                      <p className={`text-[10px] font-black ${formClass.requiresCert ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {formClass.requiresCert ? 'SIM, EXIGE' : 'NÃO EXIGE'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="text-center py-10 border-4 border-dashed border-slate-100 rounded-[40px] hover:border-claro-red transition-all cursor-pointer group" onClick={openFilePickerTecnicos}>
                   <span className="text-4xl block mb-4 group-hover:scale-110 transition-transform">📄</span>
                   <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Clique para selecionar Planilha</p>
                   <p className="text-[9px] font-bold text-slate-300 mt-2">XLSX ou CSV • Técnicos da Turma</p>
                </div>

                <div className="flex gap-4">
                  <button onClick={() => setWizardStep(1)} className="flex-1 py-4 text-xs font-black text-slate-400 uppercase tracking-widest hover:bg-slate-50 rounded-2xl transition-colors">Voltar</button>
                  <button disabled className="flex-1 py-4 bg-slate-100 text-slate-300 text-xs font-black uppercase rounded-2xl tracking-widest">Importar Turma</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: Erro de Cabeçalho */}
      {isHeaderErrorModalOpen && (
        <div className="fixed inset-0 z-[800] flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-4">
          <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-lg overflow-hidden border-t-8 border-claro-red animate-in zoom-in duration-300">
            <div className="bg-claro-red p-8 text-white text-center">
              <span className="text-4xl mb-2 block">❌</span>
              <h3 className="text-xl font-black uppercase tracking-tighter leading-tight">Cabeçalho inválido.<br/>Importação bloqueada.</h3>
            </div>
            <div className="p-10 space-y-6">
              <div className="space-y-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Modelo correto:</p>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-[9px] font-bold text-slate-600 leading-relaxed uppercase tracking-tighter">
                  Nome | Email | Cidade | Estado | Telefone | CPF | Empresa/Parceiro | Login TOA | OBS | Solicitante
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest">Problemas encontrados:</p>
                <div className="bg-rose-50 p-4 rounded-2xl border border-rose-100 space-y-2">
                  {headerErrors.map((err, i) => (
                    <p key={i} className="text-[10px] font-black text-rose-700 uppercase leading-tight">• {err}</p>
                  ))}
                </div>
              </div>

              <p className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">Corrija e tente novamente.</p>

              <button 
                onClick={() => setIsHeaderErrorModalOpen(false)}
                className="w-full py-5 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl"
              >
                FECHAR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Outros modais ocultados por concisão - nenhuma mudança neles */}
      {isOutrosCertWarningOpen && (
        <div className="fixed inset-0 z-[700] flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-4">
          <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-md overflow-hidden border-t-8 border-amber-500">
            <div className="p-10 text-center space-y-6">
              <span className="text-4xl">⚠️</span>
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Turma Tipo OUTROS</h3>
              <p className="text-sm font-bold text-slate-600 uppercase italic">Turmas do tipo OUTROS normalmente não seguem fluxo padrão de certificação. Deseja continuar mesmo assim?</p>
              <div className="flex gap-4 pt-4">
                <button onClick={() => setIsOutrosCertWarningOpen(false)} className="flex-1 py-4 bg-slate-100 text-slate-900 rounded-2xl text-[10px] font-black uppercase tracking-widest">CANCELAR</button>
                <button onClick={() => { setIsOutrosCertWarningOpen(false); setWizardStep(2); }} className="flex-1 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl">CONTINUAR</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isNoCertClassWarningOpen && (
        <div className="fixed inset-0 z-[700] flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-4">
          <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-lg overflow-hidden border-t-8 border-amber-500">
            <div className="bg-amber-500 p-8 text-white text-center">
              <h3 className="text-xl font-black uppercase tracking-tighter">⚠️ TREINAMENTO SEM CERTIFICAÇÃO</h3>
            </div>
            <div className="p-10 space-y-6">
              <p className="text-sm font-black text-slate-700 uppercase tracking-tight">Esta turma NÃO entrará na fila de agendamento.</p>
              <div className="space-y-4">
                <p className="text-xs font-bold text-slate-600 flex items-center gap-3"><span className="text-emerald-500">✔</span> NÃO SERÃO AGENDADOS</p>
                <p className="text-xs font-bold text-slate-600 flex items-center gap-3"><span className="text-emerald-500">✔</span> FICARÃO APENAS PARA ACOMPANHAMENTO</p>
              </div>
              <p className="text-xs font-black text-slate-400 uppercase italic text-center pt-4">Deseja continuar?</p>
              <div className="flex gap-4">
                <button onClick={() => setIsNoCertClassWarningOpen(false)} className="flex-1 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">CANCELAR</button>
                <button onClick={() => { setIsNoCertClassWarningOpen(false); setWizardStep(2); }} className="flex-1 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl">CONFIRMAR</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isFinalSummaryOpen && lastClassCreated && importResult && (
        <div className="fixed inset-0 z-[750] flex items-center justify-center bg-slate-900/95 backdrop-blur-md p-4">
          <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-xl overflow-hidden border-t-8 border-emerald-600 animate-in zoom-in duration-300">
            <div className="bg-emerald-600 p-10 text-white text-center">
              <span className="text-4xl mb-4 block">✅</span>
              <h3 className="text-2xl font-black uppercase tracking-tighter">Resultado da Importação</h3>
            </div>
            <div className="p-10 space-y-8">
              <div className="grid grid-cols-2 gap-6 bg-slate-50 p-6 rounded-[32px] border border-slate-100">
                <div className="col-span-2">
                  <p className="text-[9px] font-black text-slate-400 uppercase">Turma Processada</p>
                  <p className="text-sm font-black text-slate-900">{lastClassCreated.title}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase">Número</p>
                  <p className="text-xs font-black text-slate-700">{lastClassCreated.classNumber}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase">Destino</p>
                  <p className="text-[10px] font-black text-emerald-600 uppercase">
                    {lastClassCreated.requiresCert ? 'Fila Certificação' : 'Fila Sem Certificação'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-center">
                <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-sm">
                  <p className="text-[10px] font-black text-emerald-600 uppercase">Inseridos</p>
                  <p className="text-2xl font-black text-emerald-700">{importResult.inserted}</p>
                  <p className="text-[8px] font-bold text-slate-400 uppercase mt-1">Novos nesta turma</p>
                </div>
                <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-sm">
                  <p className="text-[10px] font-black text-amber-600 uppercase">Duplicados na Turma</p>
                  <p className="text-2xl font-black text-amber-700">{importResult.duplicatedInClass}</p>
                  <p className="text-[8px] font-bold text-slate-400 uppercase mt-1">Já existentes na mesma turma</p>
                </div>
                <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-sm">
                  <p className="text-[10px] font-black text-blue-600 uppercase">Novos em Outra Turma</p>
                  <p className="text-2xl font-black text-blue-700">{importResult.newInOtherClass}</p>
                  <p className="text-[8px] font-bold text-slate-400 uppercase mt-1">CPF existe em turma distinta</p>
                </div>
                <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-sm">
                  <p className="text-[10px] font-black text-slate-600 uppercase">Atualizados</p>
                  <p className="text-2xl font-black text-slate-700">{importResult.updated}</p>
                  <p className="text-[8px] font-bold text-slate-400 uppercase mt-1">Dados básicos completados</p>
                </div>
              </div>

              <div className="flex gap-4">
                <button onClick={() => setIsFinalSummaryOpen(false)} className="flex-1 py-5 border-2 border-slate-100 text-slate-900 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all">Ver Fila</button>
                <button onClick={() => setIsFinalSummaryOpen(false)} className="flex-1 py-5 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl">Fechar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isManagementModalOpen && selectedTechnician && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4">
          <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-lg overflow-hidden border-t-8 border-slate-900 animate-in zoom-in duration-300">
            <div className="bg-slate-900 p-8 text-white"><h3 className="text-xl font-black uppercase tracking-tighter">Gerenciar Técnico</h3><p className="text-[10px] font-bold text-white/70 uppercase mt-1 tracking-widest">{selectedTechnician.name} - {selectedTechnician.cpf}</p></div>
            <div className="p-10 space-y-6">
               <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                  <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest mb-4">Retirar do Treinamento</h4>
                  <div className="space-y-4">
                    <div className="space-y-1.5"><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Tipo de Ação</label>
                      <select className="w-full bg-white border-2 border-slate-100 rounded-2xl px-5 py-3 text-xs font-bold uppercase outline-none focus:border-claro-red transition-all" value={withdrawType} onChange={(e) => { setWithdrawType(e.target.value); setWithdrawSubReason(''); }}>
                        <option value="">Selecione...</option><option value="REPROVADOS">REPROVADOS</option><option value="NÃO REALIZAR">NÃO REALIZAR</option><option value="AGENDAR POSTERIORMENTE">AGENDAR POSTERIORMENTE</option>
                      </select>
                    </div>
                    {withdrawType && (
                      <div className="space-y-1.5 animate-in slide-in-from-top-2 duration-300"><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Submotivo</label>
                        <select className="w-full bg-white border-2 border-slate-100 rounded-2xl px-5 py-3 text-xs font-bold uppercase outline-none focus:border-claro-red transition-all" value={withdrawSubReason} onChange={(e) => setWithdrawSubReason(e.target.value)}>
                          <option value="">Selecione...</option>{subReasons.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                    )}
                    <div className="space-y-1.5"><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Observação (Opcional)</label>
                      <textarea maxLength={200} className="w-full bg-white border-2 border-slate-100 rounded-2xl px-5 py-3 text-xs font-bold uppercase outline-none focus:border-claro-red transition-all min-h-[80px] resize-none" placeholder="Detalhes adicionais..." value={withdrawObservation} onChange={(e) => setWithdrawObservation(e.target.value)} />
                    </div>
                  </div>
               </div>
               {selectedTechnician.scheduledCertificationId && <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 flex items-center gap-3"><span className="text-xl">⚠️</span><p className="text-[10px] font-black text-amber-700 uppercase tracking-tighter leading-tight">Agendamento ativo será cancelado e a vaga liberada.</p></div>}
            </div>
            <div className="flex gap-4 p-10 pt-0"><button onClick={() => { setIsManagementModalOpen(false); setWithdrawType(''); setWithdrawSubReason(''); }} className="flex-1 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Cancelar</button><button disabled={!withdrawType || !withdrawSubReason} onClick={handleWithdrawConfirm} className="flex-1 py-4 bg-slate-900 text-white text-xs font-black uppercase rounded-2xl shadow-xl disabled:opacity-20 tracking-widest transition-all">Confirmar</button></div>
          </div>
        </div>
      )}

      {isManualModalOpen && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4">
          <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-lg overflow-hidden border-t-8 border-claro-red animate-in zoom-in duration-300">
            <div className="bg-claro-red p-8 text-white"><h3 className="text-xl font-black uppercase tracking-tighter">Agendamento Manual</h3><p className="text-[10px] font-bold text-white/70 uppercase mt-1 tracking-widest">Atribuição Direta de Slot</p></div>
            <div className="p-10 space-y-6">
              <div className="space-y-1.5"><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Técnico Selecionado</label>
                <select className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3 text-xs font-bold uppercase outline-none focus:border-claro-red" value={manualTechId} onChange={e => setManualTechId(e.target.value)}><option value="">Selecione o Técnico...</option>{filteredTechs.map(t => <option key={t.id} value={t.id}>{t.name} ({t.cpf})</option>)}</select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5"><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Analista G3</label>
                  <select className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3 text-xs font-bold uppercase outline-none focus:border-claro-red" value={manualAnalystId} onChange={e => setManualAnalystId(e.target.value)}><option value="">Selecionar Analista...</option>{analysts.map(a => <option key={a.id} value={a.id}>{a.fullName}</option>)}</select>
                </div>
                <div className="space-y-1.5"><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Data Agendamento</label>
                  <input type="date" className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3 text-xs font-bold outline-none focus:border-claro-red" value={manualDate} onChange={e => setManualDate(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5"><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Modalidade</label>
                  <select className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3 text-xs font-bold uppercase outline-none focus:border-claro-red" value={manualType} onChange={e => setManualType(e.target.value as any)}><option value={ExpertiseType.VIRTUAL}>VIRTUAL (REMOTO)</option><option value={ExpertiseType.PRESENTIAL}>PRESENCIAL (LOCAL)</option></select>
                </div>
                <div className="space-y-1.5"><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Turno</label>
                  <select className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3 text-xs font-bold uppercase outline-none focus:border-claro-red" value={manualShift} onChange={e => setManualShift(e.target.value as any)}><option value={Shift.MORNING}>MANHÃ</option><option value={Shift.AFTERNOON}>TARDE</option></select>
                </div>
              </div>
            </div>
            <div className="flex gap-4 p-10 pt-0"><button onClick={() => setIsManualModalOpen(false)} className="flex-1 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Cancelar</button><button onClick={handleManualScheduleSubmit} disabled={!manualTechId || !manualAnalystId || !manualDate} className="flex-1 py-4 bg-claro-red text-white text-xs font-black uppercase rounded-2xl shadow-xl disabled:opacity-20 tracking-widest">Verificar Regras</button></div>
          </div>
        </div>
      )}

      {isForceConfirmOpen && validationResult && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-4">
          <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-md overflow-hidden border-t-8 border-claro-red animate-in zoom-in duration-300">
            <div className="p-10 space-y-6">
              <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center mx-auto"><span className="text-4xl">⚠️</span></div>
              <h3 className="text-xl font-black text-slate-900 text-center uppercase tracking-tight">Quebra de Regra Operacional</h3>
              <div className="space-y-3">
                {validationResult.brokenRules.map((rule, i) => <div key={i} className="bg-rose-50 p-4 rounded-2xl border border-rose-100 text-[10px] font-black text-rose-600 uppercase leading-tight tracking-tighter">{rule}</div>)}
              </div>
              <div className="flex gap-4 pt-4"><button onClick={() => setIsForceConfirmOpen(false)} className="flex-1 py-4 bg-slate-100 text-slate-900 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-colors">ABORTAR</button><button onClick={() => executeManualSchedule(true)} className="flex-1 py-4 bg-claro-red text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:bg-claro-redHover transition-all">FORÇAR AGENDAMENTO</button></div>
            </div>
          </div>
        </div>
      )}

      {isSchedulingConfirmOpen && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4">
          <div className="bg-white rounded-[40px] shadow-2xl w-full max-md overflow-hidden border-t-8 border-emerald-600 animate-in zoom-in duration-300">
            <div className="p-10 text-center space-y-6">
              <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4"><span className="text-4xl">🤖</span></div>
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Gerar Agendamento Automático</h3>
              <p className="text-sm font-bold text-slate-600 uppercase italic leading-relaxed">
                Confirmar o processamento da fila por até 10 dias úteis a partir de <span className="text-emerald-600">{schedulingStartDate.split('-').reverse().join('/')}</span>?
              </p>
              <div className="flex gap-4 pt-4">
                <button onClick={() => setIsSchedulingConfirmOpen(false)} className="flex-1 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:bg-slate-50 transition-colors">CANCELAR</button>
                <button onClick={executeAutomaticScheduling} className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:bg-emerald-700 transition-all">OK, CONFIRMAR</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isSummaryModalOpen && schedulingSummary && (
        <div className="fixed inset-0 z-[410] flex items-center justify-center bg-slate-900/95 backdrop-blur-md p-4">
          <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-2xl overflow-hidden border-t-8 border-slate-900 animate-in zoom-in duration-300">
            <div className="bg-slate-900 p-8 text-white flex justify-between items-center"><h3 className="text-xl font-black uppercase tracking-tighter">Resumo do Processamento</h3><button onClick={() => setIsSummaryModalOpen(false)} className="text-white/30 hover:text-white uppercase font-black text-[10px] transition-colors">Fechar</button></div>
            <div className="p-10 space-y-8">
              <div className="grid grid-cols-2 gap-6">
                <div className="bg-emerald-50 p-6 rounded-3xl border border-emerald-100 text-center"><p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Técnicos Agendados</p><p className="text-4xl font-black text-emerald-700">{schedulingSummary.scheduled}</p></div>
                <div className="bg-amber-50 p-6 rounded-3xl border border-amber-100 text-center"><p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Movidos para Backlog</p><p className="text-4xl font-black text-amber-700">{schedulingSummary.backlog}</p></div>
              </div>
              <div className="space-y-4">
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Motivos do Backlog:</p>
                 <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 space-y-3">
                    {Object.entries(schedulingSummary.reasons).length > 0 ? Object.entries(schedulingSummary.reasons).map(([reason, count]) => (
                      <div key={reason} className="flex justify-between items-center text-[11px] font-black uppercase text-slate-700">
                        <span className="truncate mr-4">{reason}</span><span className="bg-slate-200 px-3 py-1 rounded-lg min-w-[30px] text-center">{count}</span>
                      </div>
                    )) : <p className="text-[10px] font-black text-slate-400 uppercase italic">Nenhum técnico foi para o backlog.</p>}
                 </div>
              </div>
              <button onClick={() => setIsSummaryModalOpen(false)} className="w-full py-5 border-2 border-slate-100 text-slate-900 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all font-black">ENTENDIDO, CONCLUIR</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClassesManagement;
