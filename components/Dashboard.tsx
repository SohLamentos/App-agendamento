
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell 
} from 'recharts';
import { dataService } from '../services/dataService';
import { CertificationProcessStatus, UserRole, User, VirtualScoreAdjustment } from '../types';
import type { AppStateHistoryEntry } from '../services/dataService';


interface DashboardProps {
  user: User;
}

const COLORS = ['#9B0000', '#10b981', '#f59e0b', '#000000', '#8b5cf6', '#64748b'];

const Dashboard: React.FC<DashboardProps> = ({ user }) => {
  const [techs, setTechs] = useState(dataService.getTechnicians());
  const [schedules, setSchedules] = useState(dataService.getSchedules());
  const [analysts, setAnalysts] = useState(dataService.getUsers().filter(u => u.role === UserRole.ANALYST && (user.role === UserRole.ADMIN || u.groupId === user.groupId)));
  const [scoreAdjustments, setScoreAdjustments] = useState<VirtualScoreAdjustment[]>(dataService.getScoreAdjustments());
  const backupInputRef = useRef<HTMLInputElement | null>(null);
  const [backupHistory, setBackupHistory] = useState<AppStateHistoryEntry[]>([]);
const [isBackupHistoryLoading, setIsBackupHistoryLoading] = useState(false);
const [isBackupHistoryOpen, setIsBackupHistoryOpen] = useState(false);
  
  // Modal de Ajuste
  const [isScoreModalOpen, setIsScoreModalOpen] = useState(false);
  const [formAdjustment, setFormAdjustment] = useState({
  analystId: '',
  penalty: 50,
  reason: '',
  active: true
});

  const refresh = () => {
    setTechs(dataService.getTechnicians());
    setSchedules(dataService.getSchedules());
    setAnalysts(dataService.getUsers().filter(u => u.role === UserRole.ANALYST && (user.role === UserRole.ADMIN || u.groupId === user.groupId)));
    setScoreAdjustments(dataService.getScoreAdjustments());
  };

  useEffect(() => {
    window.addEventListener('data-updated', refresh);
    return () => window.removeEventListener('data-updated', refresh);
  }, [user]);

  const stats = useMemo(() => {
    const groupTechs = techs.filter(t => user.role === UserRole.ADMIN || t.groupId === user.groupId);
    return {
      total: groupTechs.length,
      awaiting: groupTechs.filter(t => t.status_principal === "PENDENTE_CERTIFICAÇÃO" || t.status_principal === "PENDENTE_TRATAMENTO").length,
      // Correção: Backlog oficial é definido pelo status principal 'BACKLOG AGUARDANDO'
      backlog: groupTechs.filter(t => t.status_principal === "BACKLOG AGUARDANDO").length,
      scheduled: groupTechs.filter(t => t.status_principal === "AGENDADOS" || t.certificationProcessStatus === CertificationProcessStatus.SCHEDULED).length,
      certified: groupTechs.filter(t => t.status_principal === "APROVADOS" || t.certificationProcessStatus === CertificationProcessStatus.CERTIFIED_APPROVED).length,
    };
  }, [techs, user]);

  const pieData = useMemo(() => [
    { name: 'Aguardando', value: stats.awaiting },
    { name: 'Backlog', value: stats.backlog },
    { name: 'Agendados', value: stats.scheduled },
    { name: 'Certificados', value: stats.certified },
  ], [stats]);

  const activeAdjustments = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return scoreAdjustments.filter(a => a.active && today >= a.startDate && today <= a.endDate);
  }, [scoreAdjustments]);

  const analystDemandData = useMemo(() => {
    return analysts.map(a => {
      const metrics = dataService.getAnalystDemandMetrics(a.id);
      const adj = activeAdjustments.find(ad => ad.analystId === a.id);
      return {
        id: a.id,
        name: a.fullName.split(' ')[0],
        fullName: a.fullName,
        metrics: metrics,
        scoreFinal: metrics.demandIndex + (adj ? adj.penalty : 0),
        penalty: adj ? adj.penalty : 0,
        adjustment: adj
      };
    }).sort((a, b) => b.scoreFinal - a.scoreFinal);
  }, [analysts, techs, schedules, activeAdjustments]);

  const handleSaveAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    dataService.saveScoreAdjustment({
      ...formAdjustment,
      groupId: user.groupId
    });
    setIsScoreModalOpen(false);
    setFormAdjustment({
  analystId: '',
  penalty: 50,
  reason: '',
  active: true
});
  };
  const handleResetScore = () => {
  if (!formAdjustment.analystId) return;

  const analyst = analysts.find(a => a.id === formAdjustment.analystId);

  const confirmed = window.confirm(
    `Deseja zerar o score de ${analyst?.fullName || 'este analista'}?`
  );

  if (!confirmed) return;

  const result = dataService.resetScoreAdjustmentsByAnalyst(formAdjustment.analystId);

  if (result?.success) {
    alert(`Score zerado com sucesso. Ajustes removidos: ${result.removed ?? 0}`);

    setFormAdjustment({
      analystId: '',
      penalty: 50,
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      reason: '',
      active: true
    });
  } else {
    alert('Não foi possível zerar o score.');
  }
};

  const handleRemoveAdjustment = (adjId: string) => {
    if (confirm("Remover este ajuste de score?")) {
      dataService.deleteScoreAdjustment(adjId);
    }
  };
  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const result = await dataService.importFullBackup(file);
  alert(result.message);

  e.target.value = '';
};
  const loadBackupHistory = async () => {
  try {
    setIsBackupHistoryLoading(true);
    const history = await dataService.getBackupHistory(30);
    setBackupHistory(history);
  } catch (error) {
    console.error('Erro ao carregar histórico de backups:', error);
    alert('Erro ao carregar histórico de backups.');
  } finally {
    setIsBackupHistoryLoading(false);
  }
};

const handleOpenBackupHistory = async () => {
  setIsBackupHistoryOpen(true);
  await loadBackupHistory();
};

const handleRestoreHistoryEntry = async (entryId: string) => {
  const confirmed = window.confirm(
    'Deseja restaurar esta versão do sistema? A versão atual será salva antes da restauração.'
  );

  if (!confirmed) return;

  const result = await dataService.restoreHistoryEntry(entryId);
  alert(result.message);

  if (result.success) {
    await loadBackupHistory();
  }
};

const formatBackupDate = (value?: string) => {
  if (!value) return 'Sem data';

  try {
    return new Date(value).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch {
    return value;
  }
};

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: `Total Base ${user.groupId}`, value: stats.total, color: 'slate' },
          { label: 'Em Backlog', value: stats.backlog, color: 'amber' },
          { label: 'Agendados', value: stats.scheduled, color: 'claro-red' },
          { label: 'Certificados', value: stats.certified, color: 'emerald' },
        ].map((kpi, idx) => (
          <div key={idx} className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{kpi.label}</p>
            <p className={`text-3xl font-black ${kpi.color === 'claro-red' ? 'text-claro-red' : `text-${kpi.color}-600`} mt-2`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Ações de Backup da Base */}

      {user.role === UserRole.ADMIN && (
  <div className="flex justify-end px-4 -mt-4 gap-3 flex-wrap">
    <button
      onClick={() => dataService.exportFullBackup()}
      className="text-[8px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-900 transition-colors flex items-center gap-2"
      title="Exportar backup completo da base"
    >
      <span className="text-[10px]">💾</span> Exportar Backup
    </button>

    <button
      onClick={() => backupInputRef.current?.click()}
      className="text-[8px] font-black uppercase tracking-widest text-slate-500 hover:text-amber-600 transition-colors flex items-center gap-2"
      title="Restaurar backup completo da base"
    >
      <span className="text-[10px]">📥</span> Restaurar Backup
    </button>

    <button
      onClick={handleOpenBackupHistory}
      className="text-[8px] font-black uppercase tracking-widest text-slate-500 hover:text-claro-red transition-colors flex items-center gap-2"
      title="Visualizar histórico de backups automáticos"
    >
      <span className="text-[10px]">🕘</span> Histórico de Backups
    </button>

    <input
      ref={backupInputRef}
      type="file"
      accept=".json,application/json"
      onChange={handleImportBackup}
      className="hidden"
    />
  </div>
)}


     
      {isBackupHistoryOpen && (
  <div className="fixed inset-0 z-[650] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4">
    <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-5xl overflow-hidden border-t-8 border-claro-red animate-in zoom-in duration-300">
      <div className="bg-slate-900 p-8 text-white flex items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-black uppercase tracking-tighter">Histórico de Backups</h3>
          <p className="text-[10px] font-bold uppercase mt-1 opacity-70 tracking-widest">
            Últimas versões automáticas salvas no sistema
          </p>
        </div>

        <button
          onClick={() => setIsBackupHistoryOpen(false)}
          className="text-[10px] font-black uppercase tracking-widest text-white/70 hover:text-white"
        >
          Fechar
        </button>
      </div>

      <div className="p-8">
        <div className="flex items-center justify-between mb-6 gap-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            {isBackupHistoryLoading ? 'Carregando histórico...' : `${backupHistory.length} registro(s) encontrado(s)`}
          </p>

          <button
            onClick={loadBackupHistory}
            className="px-4 py-2 rounded-xl bg-slate-100 text-slate-900 text-[9px] font-black uppercase tracking-widest hover:bg-slate-200 transition-colors"
          >
            Atualizar Lista
          </button>
        </div>

        <div className="max-h-[60vh] overflow-auto rounded-[28px] border border-slate-200">
          <table className="w-full">
            <thead className="sticky top-0 bg-slate-50">
              <tr>
                <th className="text-left px-4 py-4 text-[9px] font-black uppercase tracking-widest text-slate-400">Data/Hora</th>
                <th className="text-left px-4 py-4 text-[9px] font-black uppercase tracking-widest text-slate-400">Usuário</th>
                <th className="text-left px-4 py-4 text-[9px] font-black uppercase tracking-widest text-slate-400">Motivo</th>
                <th className="text-left px-4 py-4 text-[9px] font-black uppercase tracking-widest text-slate-400">Ação</th>
              </tr>
            </thead>

            <tbody>
              {backupHistory.length === 0 && !isBackupHistoryLoading && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Nenhum backup encontrado
                  </td>
                </tr>
              )}

              {backupHistory.map((entry) => (
                <tr key={entry.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                  <td className="px-4 py-4 text-[11px] font-bold text-slate-700">
                    {formatBackupDate(
  entry.data?._backupMeta?.createdAt || entry.created_at
)}
                  </td>

                  <td className="px-4 py-4 text-[11px] font-bold text-slate-700 uppercase">
                    {entry.created_by || entry.data?._backupMeta?.createdBy || 'SYSTEM'}
                  </td>

                  <td className="px-4 py-4">
                    <span className="inline-flex items-center px-3 py-1 rounded-full bg-slate-100 text-slate-800 text-[9px] font-black uppercase tracking-widest">
                      {entry.reason || entry.data?._backupMeta?.reason || 'AUTO_BACKUP'}
                    </span>
                  </td>

                  <td className="px-4 py-4">
                    <button
                      onClick={() => handleRestoreHistoryEntry(entry.id)}
                      className="px-4 py-2 rounded-xl bg-claro-red text-white text-[9px] font-black uppercase tracking-widest hover:opacity-90 transition-opacity shadow-lg"
                    >
                      Restaurar Versão
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Restaurar uma versão salva substituirá o estado atual, mas o sistema criará um backup antes da restauração.
        </div>
      </div>
    </div>
  </div>
)}
      
      {/* Modal de Ajuste Score Virtual */}
      {isScoreModalOpen && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4">
          <form onSubmit={handleSaveAdjustment} className="bg-white rounded-[40px] shadow-2xl w-full max-w-lg overflow-hidden border-t-8 border-slate-900 animate-in zoom-in duration-300">
            <div className="bg-slate-900 p-8 text-white text-center">
              <h3 className="text-xl font-black uppercase tracking-tighter">Ajuste de Prioridade Presencial</h3>
              <p className="text-[10px] font-bold uppercase mt-1 opacity-70 tracking-widest">Controla a prioridade do analista na distribuição presencial</p>
            </div>
            
            <div className="p-10 space-y-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Selecionar Analista do Grupo</label>
                <select 
                  required 
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3 text-xs font-bold uppercase outline-none focus:border-claro-red transition-all"
                  value={formAdjustment.analystId}
                  onChange={e => setFormAdjustment({...formAdjustment, analystId: e.target.value})}
                >
                  <option value="">Selecione o Analista...</option>
                  {analysts.map(a => <option key={a.id} value={a.id}>{a.fullName}</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center mb-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Prioridade Manual (+ Pts)</label>
                  <span className="text-sm font-black text-claro-red">+{formAdjustment.penalty} PTS</span>
                </div>
                <input 
                  type="range" min="0" max="100" step="5"
                  className="w-full accent-claro-red h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer"
                  value={formAdjustment.penalty}
                  onChange={e => setFormAdjustment({...formAdjustment, penalty: parseInt(e.target.value)})}
                />
                <div className="flex justify-between text-[8px] font-bold text-slate-400 uppercase italic">
                  <span>Mínimo (0)</span>
                  <span>Impacto Médio (50)</span>
                  <span>Máximo (100)</span>
                </div>
              </div>

              
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Motivo Justificável</label>
                <textarea 
                  required maxLength={80}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3 text-xs font-bold outline-none focus:border-claro-red min-h-[80px] resize-none"
                  placeholder="Descreva o motivo do ajuste manual de prioridade..."
                  value={formAdjustment.reason}
                  onChange={e => setFormAdjustment({...formAdjustment, reason: e.target.value})}
                />
              </div>
            </div>

            <div className="flex gap-4 p-10 pt-0">
  <button 
    type="button" 
    onClick={() => setIsScoreModalOpen(false)} 
    className="flex-1 py-4 text-xs font-black text-slate-400 uppercase tracking-widest hover:bg-slate-50 rounded-2xl transition-colors"
  >
    Fechar
  </button>

  <button 
    type="submit" 
    disabled={!formAdjustment.analystId || !formAdjustment.reason}
    className="flex-1 py-4 bg-slate-900 text-white text-xs font-black uppercase rounded-2xl shadow-xl tracking-widest hover:bg-black transition-all disabled:opacity-30"
  >
    Salvar Ajuste
  </button>
</div>

{formAdjustment.analystId && (
  <div className="px-10 pb-10 pt-0">
    <button
      type="button"
      onClick={handleResetScore}
      className="w-full py-4 bg-red-50 border-2 border-red-200 text-red-700 text-xs font-black uppercase rounded-2xl shadow-sm tracking-widest hover:bg-red-100 transition-all"
    >
      Zerar Score do Analista
    </button>
  </div>
)}

          </form>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-10 rounded-[40px] border border-slate-200 shadow-sm h-[450px] flex flex-col">
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6">Status Operacional {user.groupId}</h3>
          <div className="flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={70} outerRadius={110} paddingAngle={8} dataKey="value">
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', textTransform: 'uppercase', fontSize: '10px', fontWeight: 'bold' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-10 rounded-[40px] border border-slate-200 shadow-sm h-[450px]">
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6">Distribuição por Demanda</h3>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={pieData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#94a3b8', fontWeight: 'bold' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#94a3b8', fontWeight: 'bold' }} />
              <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', textTransform: 'uppercase', fontSize: '10px', fontWeight: 'bold' }} />
              <Bar dataKey="value" fill="#9B0000" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
