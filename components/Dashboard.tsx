
import React, { useMemo, useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell 
} from 'recharts';
import { dataService } from '../services/dataService';
import { CertificationProcessStatus, UserRole, User, VirtualScoreAdjustment } from '../types';

interface DashboardProps {
  user: User;
}

const COLORS = ['#9B0000', '#10b981', '#f59e0b', '#000000', '#8b5cf6', '#64748b'];

const Dashboard: React.FC<DashboardProps> = ({ user }) => {
  const [techs, setTechs] = useState(dataService.getTechnicians());
  const [schedules, setSchedules] = useState(dataService.getSchedules());
  const [analysts, setAnalysts] = useState(dataService.getUsers().filter(u => u.role === UserRole.ANALYST && (user.role === UserRole.ADMIN || u.groupId === user.groupId)));
  const [scoreAdjustments, setScoreAdjustments] = useState<VirtualScoreAdjustment[]>(dataService.getScoreAdjustments());
  
  // Modal de Ajuste
  const [isScoreModalOpen, setIsScoreModalOpen] = useState(false);
  const [formAdjustment, setFormAdjustment] = useState({
    analystId: '',
    penalty: 50,
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
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
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      reason: '',
      active: true
    });
  };

  const handleRemoveAdjustment = (adjId: string) => {
    if (confirm("Remover este ajuste de score?")) {
      dataService.deleteScoreAdjustment(adjId);
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

      {/* Painel de Monitoramento de Demanda Presencial */}
      <div className="bg-white p-10 rounded-[40px] border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
          <div>
            <h3 className="text-base font-black text-slate-900 uppercase tracking-wider">Monitoramento de Capacidade {user.groupId}</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Cálculo de Prioridade Nacional</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {(user.role === UserRole.MANAGER || user.role === UserRole.ADMIN) && (
              <button 
                onClick={() => setIsScoreModalOpen(true)}
                className="bg-slate-900 text-white px-5 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-lg flex items-center gap-2 border-b-4 border-slate-700 active:border-b-0 active:translate-y-1"
              >
                <span>⚙️</span> AJUSTAR CARGA PRESENCIAL
              </button>
            )}
            <div className="h-6 w-px bg-slate-200 mx-1 hidden sm:block"></div>
            <span className="flex items-center gap-1.5 text-[8px] font-black text-white bg-claro-red px-3 py-2 rounded-full uppercase tracking-widest">ALTA CARGA</span>
            <span className="flex items-center gap-1.5 text-[8px] font-black text-slate-900 bg-slate-100 px-3 py-2 rounded-full uppercase tracking-widest">CAPACIDADE LIVRE</span>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {analystDemandData.map((data, idx) => (
            <div key={idx} className="border-2 border-slate-50 rounded-[32px] p-6 bg-slate-50/30 hover:bg-white hover:border-slate-100 hover:shadow-xl transition-all group relative overflow-hidden">
              {data.penalty > 0 && (
                <div 
                  className="absolute top-0 right-0 bg-claro-red text-white text-[8px] font-black px-4 py-1.5 rounded-bl-2xl shadow-lg animate-pulse cursor-help"
                  title={`${data.adjustment?.reason} (Até ${data.adjustment?.endDate ? new Date(data.adjustment.endDate).toLocaleDateString() : 'N/A'})`}
                >
                  PENALIDADE +{data.penalty}
                </div>
              )}
              
              <div className="flex justify-between items-start mb-4">
                <div className="flex flex-col">
                  <span className="text-xs font-black text-slate-900 uppercase tracking-wider">{data.name}</span>
                  <span className="text-[7px] font-bold text-slate-400 uppercase tracking-widest">{data.fullName}</span>
                </div>
                <span className={`text-[8px] font-black px-3 py-1 rounded-full uppercase tracking-widest ${
                  data.metrics.level === 'ALTA' || data.scoreFinal > 100 ? 'bg-claro-red text-white' : 
                  data.metrics.level === 'MÉDIA' || data.scoreFinal > 40 ? 'bg-slate-900 text-white' : 'bg-emerald-500 text-white'
                }`}>
                  {data.scoreFinal > 100 ? 'ALTA PRESSÃO' : data.scoreFinal > 40 ? 'CARGA MÉDIA' : 'NORMAL'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-[8px] text-slate-400 font-black uppercase">Território</p>
                  <p className="text-sm font-black text-slate-700">{data.metrics.cityCount}</p>
                </div>
                <div className="text-center">
                  <p className="text-[8px] text-slate-400 font-black uppercase">Pendentes</p>
                  <p className="text-sm font-black text-slate-700">{data.metrics.pendingPresentialCount}</p>
                </div>
                <div className="text-center">
                  <p className="text-[8px] text-slate-400 font-black uppercase">Score Final</p>
                  <p className="text-sm font-black text-claro-red">{data.scoreFinal}</p>
                </div>
              </div>
              <div className="mt-5 w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-1000 ${
                    data.scoreFinal > 100 ? 'bg-claro-red' : 
                    data.scoreFinal > 40 ? 'bg-slate-900' : 'bg-emerald-500'
                  }`} 
                  style={{ width: `${Math.min(100, (data.scoreFinal / 150) * 100)}%` }}
                ></div>
              </div>
              
              {data.adjustment && (user.role === UserRole.MANAGER || user.role === UserRole.ADMIN) && (
                <button 
                  onClick={() => handleRemoveAdjustment(data.adjustment!.id)}
                  className="mt-4 w-full py-1 text-[7px] font-black text-slate-300 hover:text-rose-500 transition-colors uppercase tracking-[0.2em]"
                >
                  [ Remover Ajuste ]
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Modal de Ajuste Score Virtual */}
      {isScoreModalOpen && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4">
          <form onSubmit={handleSaveAdjustment} className="bg-white rounded-[40px] shadow-2xl w-full max-w-lg overflow-hidden border-t-8 border-slate-900 animate-in zoom-in duration-300">
            <div className="bg-slate-900 p-8 text-white text-center">
              <h3 className="text-xl font-black uppercase tracking-tighter">Penalidade de Score Virtual</h3>
              <p className="text-[10px] font-bold uppercase mt-1 opacity-70 tracking-widest">Aumenta o Score para baixar a prioridade no motor</p>
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
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Penalidade (+ Pts)</label>
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

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Início Vigência</label>
                  <input 
                    type="date" required 
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3 text-xs font-bold outline-none focus:border-claro-red"
                    value={formAdjustment.startDate}
                    onChange={e => setFormAdjustment({...formAdjustment, startDate: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Fim Vigência</label>
                  <input 
                    type="date" required 
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3 text-xs font-bold outline-none focus:border-claro-red"
                    value={formAdjustment.endDate}
                    onChange={e => setFormAdjustment({...formAdjustment, endDate: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Motivo Justificável</label>
                <textarea 
                  required maxLength={80}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3 text-xs font-bold outline-none focus:border-claro-red min-h-[80px] resize-none"
                  placeholder="Descreva o motivo do balanceamento temporário..."
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
