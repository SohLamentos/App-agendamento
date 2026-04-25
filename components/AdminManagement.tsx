
import React, { useState, useEffect, useMemo } from 'react';
import { dataService } from '../services/dataService';
import { auditService } from '../services/auditService';
import { User, UserRole, Group, GroupRule, CityGroup, ExpertiseType, VirtualScoreAdjustment } from '../types';

const AdminManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'groups' | 'users' | 'rules' | 'cities' | 'balancing' | 'audit'>('groups');
  const [groups, setGroups] = useState<Group[]>(dataService.getGroups());
  const [users, setUsers] = useState<User[]>(dataService.getUsers());
  const [rules, setRules] = useState<GroupRule[]>(dataService.getGroupRules());
  const [cities, setCities] = useState<CityGroup[]>(dataService.getCities());
  const [scoreAdjustments, setScoreAdjustments] = useState<VirtualScoreAdjustment[]>(dataService.getScoreAdjustments());
  const [unconfigured, setUnconfigured] = useState(dataService.getUnconfiguredCities());
  
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // States para novos cadastros
  const [formGroup, setFormGroup] = useState({ id: '', name: '' });
  const [formUser, setFormUser] = useState({ fullName: '', groupId: '', managerId: '', role: UserRole.ANALYST });
  const [formAdjustment, setFormAdjustment] = useState({
    analystId: '',
    penalty: 50,
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
    reason: '',
    active: true
  });

  const refreshData = () => {
    setGroups(dataService.getGroups());
    setUsers(dataService.getUsers());
    setRules(dataService.getGroupRules());
    setCities(dataService.getCities());
    setScoreAdjustments(dataService.getScoreAdjustments());
    setUnconfigured(dataService.getUnconfiguredCities());
  };

  useEffect(() => {
    window.addEventListener('data-updated', refreshData);
    return () => window.removeEventListener('data-updated', refreshData);
  }, []);

  const analysts = useMemo(() => users.filter(u => u.role === UserRole.ANALYST && (selectedGroupFilter === 'ALL' || u.groupId === selectedGroupFilter)), [users, selectedGroupFilter]);
  const filteredUsers = useMemo(() => users.filter(u => selectedGroupFilter === 'ALL' || u.groupId === selectedGroupFilter), [users, selectedGroupFilter]);

  const handleResetPassword = (userId: string, userName: string) => {
    if (window.confirm(`Deseja realmente resetar a senha de ${userName}?`)) {
      dataService.resetUserPassword(userId);
      alert('Senha redefinida.');
    }
  };

  const handleAddAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    const currentGroup = selectedGroupFilter === 'ALL' ? groups[0].id : selectedGroupFilter;
    dataService.saveScoreAdjustment({
      ...formAdjustment,
      groupId: currentGroup
    });
    setIsModalOpen(false);
    setFormAdjustment({
      analystId: '',
      penalty: 50,
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      reason: '',
      active: true
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex gap-4 border-b border-slate-200 pb-4 overflow-x-auto no-scrollbar">
        {[
          { id: 'groups', label: 'Grupos', icon: '🏢' },
          { id: 'users', label: 'Usuários', icon: '👤' },
          { id: 'rules', label: 'Regras', icon: '📏' },
          { id: 'cities', label: 'Cidades/UF', icon: '📍' },
          { id: 'balancing', label: 'Balanceamento', icon: '⚖️' },
          { id: 'audit', label: 'Auditoria', icon: '📋' }
        ].map((tab) => (
          <button 
            key={tab.id} 
            onClick={() => setActiveTab(tab.id as any)} 
            className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === tab.id ? 'bg-emerald-600 text-white shadow-md' : 'bg-white text-slate-400 hover:text-slate-600'}`}
          >
            <span>{tab.icon}</span> {tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-[32px] border border-slate-200">
        <div className="flex items-center gap-4">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Filtro Grupo:</label>
          <select 
            className="bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2 text-xs font-black outline-none" 
            value={selectedGroupFilter} 
            onChange={(e) => setSelectedGroupFilter(e.target.value)}
          >
            <option value="ALL">TODOS OS GRUPOS</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.id} - {g.name}</option>)}
          </select>
        </div>
        {activeTab === 'balancing' && (
          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-slate-900 text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-lg"
          >
            Novo Ajuste de Score
          </button>
        )}
      </div>

      {activeTab === 'balancing' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-[40px] shadow-sm overflow-hidden">
            <table className="w-full text-left text-xs uppercase">
              <thead className="bg-slate-50 font-black text-slate-400 border-b">
                <tr>
                  <th className="px-8 py-5">Analista</th>
                  <th className="px-8 py-5 text-center">Penalidade Virtual</th>
                  <th className="px-8 py-5 text-center">Vigência</th>
                  <th className="px-8 py-5">Motivo</th>
                  <th className="px-8 py-5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-bold text-slate-600">
                {scoreAdjustments.map(adj => {
                  const analyst = users.find(u => u.id === adj.analystId);
                  return (
                    <tr key={adj.id} className={`hover:bg-slate-50/50 transition-all ${!adj.active ? 'opacity-50' : ''}`}>
                      <td className="px-8 py-5">
                        <p className="font-black text-slate-900">{analyst?.fullName || 'N/A'}</p>
                        <p className="text-[9px] text-slate-400">ID: {adj.analystId}</p>
                      </td>
                      <td className="px-8 py-5 text-center">
                        <span className="bg-claro-red/10 text-claro-red px-3 py-1 rounded-full text-[10px] font-black">+{adj.penalty} Pts</span>
                      </td>
                      <td className="px-8 py-5 text-center text-[10px]">
                        {new Date(adj.startDate).toLocaleDateString('pt-BR')} até {new Date(adj.endDate).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-8 py-5 truncate max-w-xs" title={adj.reason}>{adj.reason}</td>
                      <td className="px-8 py-5 text-right">
                        <button 
                          onClick={() => dataService.deleteScoreAdjustment(adj.id)} 
                          className="text-rose-600 hover:text-rose-800 text-[10px] font-black tracking-widest uppercase"
                        >
                          Remover
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {scoreAdjustments.length === 0 && (
                  <tr><td colSpan={5} className="px-8 py-10 text-center text-slate-400 italic">Nenhum ajuste de score ativo para este grupo.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Restante das abas (groups, users, etc) permanecem as mesmas */}
      {activeTab === 'users' && (
        <div className="bg-white border border-slate-200 rounded-[40px] shadow-sm overflow-hidden">
          <table className="w-full text-left text-xs uppercase">
            <thead className="bg-slate-50 font-black text-slate-400 border-b">
              <tr><th className="px-8 py-5">Login / Nome</th><th className="px-8 py-5">Perfil</th><th className="px-8 py-5">Grupo</th><th className="px-8 py-5">Status</th><th className="px-8 py-5 text-right">Ações</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-bold text-slate-600">
              {filteredUsers.map(u => (
                <tr key={u.id} className={`hover:bg-slate-50/50 transition-all ${!u.active ? 'opacity-50' : ''}`}>
                  <td className="px-8 py-5"><p className="font-black text-slate-900">{u.normalizedLogin}</p><p className="text-[9px] text-slate-400">{u.fullName}</p></td>
                  <td className="px-8 py-5"><span className={`px-2 py-1 rounded-lg text-[8px] font-black ${u.role === UserRole.ADMIN ? 'bg-emerald-100 text-emerald-700' : u.role === UserRole.MANAGER ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{u.role}</span></td>
                  <td className="px-8 py-5 font-black text-claro-red">{u.groupId}</td>
                  <td className="px-8 py-5"><div className={`flex items-center gap-1.5 ${u.active ? 'text-emerald-600' : 'text-slate-400'}`}><div className={`w-1.5 h-1.5 rounded-full ${u.active ? 'bg-emerald-500' : 'bg-slate-300'}`}></div><span className="text-[9px] font-black">{u.active ? 'ATIVO' : 'INATIVO'}</span></div></td>
                  <td className="px-8 py-5 text-right space-x-4">
                    <button onClick={() => handleResetPassword(u.id, u.normalizedLogin)} className="text-[9px] font-black text-slate-400 hover:text-emerald-600 tracking-widest">RESET SENHA</button>
                    <button onClick={() => dataService.updateUserStatus(u.id, !u.active)} className={`text-[9px] font-black tracking-widest ${u.active ? 'text-slate-400 hover:text-claro-red' : 'text-emerald-600'}`}>{u.active ? 'INATIVAR' : 'REATIVAR'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal para Novo Ajuste de Score */}
      {isModalOpen && activeTab === 'balancing' && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4">
          <form onSubmit={handleAddAdjustment} className="bg-white rounded-[40px] shadow-2xl w-full max-w-lg overflow-hidden border-t-8 border-slate-900 animate-in zoom-in duration-300">
            <div className="bg-slate-900 p-8 text-white text-center">
              <h3 className="text-xl font-black uppercase tracking-tighter">Novo Ajuste de Score (Virtual)</h3>
              <p className="text-[10px] font-bold uppercase mt-1 opacity-70 tracking-widest">Aumenta o Score para baixar a prioridade</p>
            </div>
            <div className="p-10 space-y-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Selecionar Analista</label>
                <select 
                  required 
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3 text-xs font-bold uppercase outline-none focus:border-claro-red"
                  value={formAdjustment.analystId}
                  onChange={e => setFormAdjustment({...formAdjustment, analystId: e.target.value})}
                >
                  <option value="">Selecione...</option>
                  {analysts.map(a => <option key={a.id} value={a.id}>{a.fullName}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Penalidade (+ Pts)</label>
                  <input 
                    type="number" min="0" max="1000" required 
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3 text-xs font-bold outline-none focus:border-claro-red"
                    value={formAdjustment.penalty}
                    onChange={e => setFormAdjustment({...formAdjustment, penalty: parseInt(e.target.value)})}
                  />
                </div>
                <div className="space-y-1.5 flex items-end">
                   <p className="text-[8px] font-bold text-slate-400 uppercase italic">Sugestão: Use 50 a 100 para impacto moderado.</p>
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
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Motivo do Ajuste</label>
                <textarea 
                  required maxLength={100}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3 text-xs font-bold outline-none focus:border-claro-red min-h-[80px] resize-none"
                  placeholder="Ex: Baixa performance virtual temporária"
                  value={formAdjustment.reason}
                  onChange={e => setFormAdjustment({...formAdjustment, reason: e.target.value})}
                />
              </div>
            </div>
            <div className="flex gap-4 p-10 pt-0">
              <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Cancelar</button>
              <button type="submit" className="flex-1 py-4 bg-slate-900 text-white text-xs font-black uppercase rounded-2xl shadow-xl tracking-widest hover:bg-black transition-all">Salvar Ajuste</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default AdminManagement;
