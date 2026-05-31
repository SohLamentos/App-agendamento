
import React, { useState, useEffect, useMemo } from 'react';
import { createUserProfile } from '../services/userAdminService';
import { dataService } from '../services/dataService';
import { auditService } from '../services/auditService';
import { User, UserRole, Group, GroupRule, CityGroup, ExpertiseType, VirtualScoreAdjustment, SystemConfig } from '../types';
import { loadSystemConfig, saveSystemConfig } from '../services/appStateService';
import { authService } from '../services/authService';

const AdminManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'groups' | 'users' | 'rules' | 'cities' | 'balancing' | 'audit' | 'maintenance'>('groups');
  const [groups, setGroups] = useState<Group[]>(dataService.getGroups());
  const [users, setUsers] = useState<User[]>(dataService.getUsers());
  const [rules, setRules] = useState<GroupRule[]>(dataService.getGroupRules());
  const [cities, setCities] = useState<CityGroup[]>(dataService.getCities());
  const [scoreAdjustments, setScoreAdjustments] = useState<VirtualScoreAdjustment[]>(dataService.getScoreAdjustments());
  const [unconfigured, setUnconfigured] = useState(dataService.getUnconfiguredCities());
  
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>(() => {
  const user = authService.getCurrentUser();
  return user?.isGlobalAdmin === true ? 'ALL' : user?.groupId || 'G3';
});
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [systemConfig, setSystemConfig] = useState<SystemConfig | null>(null);
const [savingMaintenance, setSavingMaintenance] = useState(false);

  const currentUser = authService.getCurrentUser();

const isGlobalAdmin =
  currentUser?.role === UserRole.ADMIN && currentUser?.isGlobalAdmin === true;

const isManager =
  currentUser?.role === UserRole.MANAGER;

const currentUserGroupId =
  currentUser?.groupId || 'G3';

const visibleGroups = isGlobalAdmin
  ? groups
  : groups.filter(g => g.id === currentUserGroupId);
  
  // States para novos cadastros
  const [formGroup, setFormGroup] = useState({ id: '', name: '' });
  const [formUser, setFormUser] = useState({ fullName: '', groupId: '', managerId: '', role: UserRole.ANALYST });
  const [temporaryPassword, setTemporaryPassword] = useState('Claro@123');
const [creatingUser, setCreatingUser] = useState(false);
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

  useEffect(() => {
  const loadMaintenance = async () => {
    try {
      const config = await loadSystemConfig();
      setSystemConfig(config);
    } catch (error) {
      console.error('Erro ao carregar modo manutenção:', error);
    }
  };

  loadMaintenance();
}, []);

  const analysts = useMemo(() => users.filter(u => u.role === UserRole.ANALYST && (selectedGroupFilter === 'ALL' || u.groupId === selectedGroupFilter)), [users, selectedGroupFilter]);
  const filteredUsers = useMemo(() => {
  if (isGlobalAdmin) {
    return users.filter(u => selectedGroupFilter === 'ALL' || u.groupId === selectedGroupFilter);
  }

  return users.filter(u => u.groupId === currentUserGroupId);
}, [users, selectedGroupFilter, isGlobalAdmin, currentUserGroupId]);

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

  const handleUpdateGroupName = (groupId: string, currentName: string) => {
  const nextName = window.prompt('Digite o novo nome do grupo:', currentName);

  if (nextName === null) return;

  const cleanName = nextName.trim();

  if (!cleanName) {
    alert('O nome do grupo não pode ficar vazio.');
    return;
  }

  try {
    dataService.updateGroupName(groupId, cleanName);
    refreshData();
    alert('Nome do grupo atualizado.');
  } catch (error) {
    console.error('Erro ao atualizar grupo:', error);
    alert('Erro ao atualizar nome do grupo.');
  }
};

  const handleAddGroup = (e: React.FormEvent) => {
  e.preventDefault();

  const groupId = formGroup.id.trim().toUpperCase();
  const groupName = formGroup.name.trim();

  if (!groupId || !groupName) {
    alert('Informe o ID e o nome do grupo.');
    return;
  }

  try {
    dataService.addGroup({
      id: groupId,
      name: groupName,
    });

    setFormGroup({ id: '', name: '' });
    refreshData();

    alert('Grupo criado com sucesso.');
  } catch (error) {
    console.error('Erro ao criar grupo:', error);
    alert(error instanceof Error ? error.message : 'Erro ao criar grupo.');
  }
};

  const handleCreateUser = async (e: React.FormEvent) => {
  e.preventDefault();

  const targetGroupId = isManager ? currentUserGroupId : formUser.groupId;

  if (!formUser.fullName.trim() || !targetGroupId || !temporaryPassword.trim()) {
    alert('Preencha nome, grupo e senha temporária.');
    return;
  }

  if (isManager && formUser.role !== UserRole.ANALYST) {
    alert('Gestor só pode criar analistas.');
    return;
  }

  const email = window.prompt('Informe o e-mail corporativo do usuário:');

  if (!email) return;

  try {
    setCreatingUser(true);

    await createUserProfile({
      email,
      fullName: formUser.fullName,
      role: formUser.role,
      groupId: targetGroupId,
      temporaryPassword,
      managerId:
  isManager
    ? currentUser?.analystProfileId ||
      currentUser?.id ||
      undefined
    : formUser.managerId || undefined,
    });

    alert('Usuário criado com sucesso.');

    setFormUser({
      fullName: '',
      groupId: isManager ? currentUserGroupId : '',
      managerId: '',
      role: UserRole.ANALYST,
    });

    setTemporaryPassword('Claro@123');
    refreshData();
  } catch (error) {
    console.error('Erro ao criar usuário:', error);
    alert(error instanceof Error ? error.message : 'Erro ao criar usuário.');
  } finally {
    setCreatingUser(false);
  }
};

  const handleToggleMaintenance = async () => {
  if (!systemConfig) return;

  const nextMaintenanceMode = !systemConfig.maintenanceMode;

  const confirmMessage = nextMaintenanceMode
    ? 'Deseja ATIVAR o modo manutenção? Apenas e-mails liberados conseguirão acessar.'
    : 'Deseja DESATIVAR o modo manutenção e liberar o sistema para todos?';

  if (!window.confirm(confirmMessage)) return;

  try {
    setSavingMaintenance(true);

    const currentUser = authService.getCurrentUser();

    const nextConfig: SystemConfig = {
      ...systemConfig,
      maintenanceMode: nextMaintenanceMode,
      maintenanceMessage:
        systemConfig.maintenanceMessage ||
        'Sistema em manutenção para atualização. Tente novamente mais tarde.',
      maintenanceAllowedEmails:
        systemConfig.maintenanceAllowedEmails?.length > 0
          ? systemConfig.maintenanceAllowedEmails
          : ['thiago.andersonsilva@claro.com.br'],
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser?.email || currentUser?.fullName || 'ADMIN',
    };

    await saveSystemConfig(nextConfig);
    setSystemConfig(nextConfig);

    alert(nextMaintenanceMode ? 'Modo manutenção ativado.' : 'Sistema liberado.');
  } catch (error) {
    console.error('Erro ao alterar modo manutenção:', error);
    alert('Erro ao alterar modo manutenção.');
  } finally {
    setSavingMaintenance(false);
  }
};

const handleMaintenanceMessageChange = async () => {
  if (!systemConfig) return;

  try {
    setSavingMaintenance(true);

    const currentUser = authService.getCurrentUser();

    const nextConfig: SystemConfig = {
      ...systemConfig,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser?.email || currentUser?.fullName || 'ADMIN',
    };

    await saveSystemConfig(nextConfig);
    setSystemConfig(nextConfig);

    alert('Mensagem de manutenção salva.');
  } catch (error) {
    console.error('Erro ao salvar mensagem de manutenção:', error);
    alert('Erro ao salvar mensagem.');
  } finally {
    setSavingMaintenance(false);
  }
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
          { id: 'audit', label: 'Auditoria', icon: '📋' },
{ id: 'maintenance', label: 'Manutenção', icon: '🔧' }
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
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            Filtro Grupo:
          </label>

          <select
            className="bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2 text-xs font-black outline-none"
            value={selectedGroupFilter}
            onChange={(e) => setSelectedGroupFilter(e.target.value)}
          >
            {isGlobalAdmin && (
  <option value="ALL">TODOS OS GRUPOS</option>
)}

{visibleGroups.map(g => (
  <option key={g.id} value={g.id}>
    {g.id} - {g.name}
  </option>
))}
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

      {activeTab === 'groups' && (
  <div className="space-y-6">

    <form
      onSubmit={handleAddGroup}
      className="bg-white border border-slate-200 rounded-[32px] p-6 flex flex-col md:flex-row gap-4 items-end"
    >
      <div className="flex-1">
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">
          ID do Grupo
        </label>

        <input
          value={formGroup.id}
          onChange={(e) =>
            setFormGroup({
              ...formGroup,
              id: e.target.value.toUpperCase()
            })
          }
          placeholder="Ex: G4"
          className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-xs font-black uppercase outline-none"
        />
      </div>

      <div className="flex-[2]">
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">
          Nome do Grupo
        </label>

        <input
          value={formGroup.name}
          onChange={(e) =>
            setFormGroup({
              ...formGroup,
              name: e.target.value
            })
          }
          placeholder="Ex: G4 - Treinamento"
          className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-xs font-black outline-none"
        />
      </div>

      <button
        type="submit"
        className="bg-slate-900 text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all"
      >
        Criar Grupo
      </button>
    </form>

    <div className="bg-white border border-slate-200 rounded-[40px] shadow-sm overflow-hidden">
    <table className="w-full text-left text-xs uppercase">
      <thead className="bg-slate-50 font-black text-slate-400 border-b">
        <tr>
          <th className="px-8 py-5">ID</th>
          <th className="px-8 py-5">Nome do Grupo</th>
          <th className="px-8 py-5">Status</th>
          <th className="px-8 py-5 text-right">Ações</th>
        </tr>
      </thead>

      <tbody className="divide-y divide-slate-100 font-bold text-slate-600">
        {visibleGroups.map(group => (
          <tr key={group.id} className={!group.active ? 'opacity-50' : ''}>
            <td className="px-8 py-5 font-black text-claro-red">
              {group.id}
            </td>

            <td className="px-8 py-5">
              {group.name}
            </td>

            <td className="px-8 py-5">
              <span className={`px-3 py-1 rounded-full text-[9px] font-black ${
                group.active
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-100 text-slate-500'
              }`}>
                {group.active ? 'ATIVO' : 'INATIVO'}
              </span>
            </td>

            <td className="px-8 py-5 text-right">
              <button
                type="button"
                onClick={() => handleUpdateGroupName(group.id, group.name)}
                className="text-[9px] font-black text-slate-400 hover:text-emerald-600 tracking-widest uppercase"
              >
                Editar Nome
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
      </div>

  </div>
)}

            {activeTab === 'maintenance' && (
        <div className="bg-white border border-slate-200 rounded-[40px] shadow-sm overflow-hidden">

          <div className={`p-8 border-b ${
            systemConfig?.maintenanceMode
              ? 'bg-red-50 border-red-100'
              : 'bg-emerald-50 border-emerald-100'
          }`}>
            <div className="flex items-center justify-between gap-6">

              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                  Controle de disponibilidade do sistema
                </p>

                <h3
                  className={`text-2xl font-black uppercase ${
                    systemConfig?.maintenanceMode
                      ? 'text-red-700'
                      : 'text-emerald-700'
                  }`}
                >
                  {systemConfig?.maintenanceMode
                    ? 'Sistema em manutenção'
                    : 'Sistema liberado'}
                </h3>

                <p className="text-xs font-bold text-slate-500 mt-2">
                  Quando ativo, somente os e-mails autorizados conseguem acessar o app.
                </p>
              </div>

              <button
                type="button"
                disabled={!systemConfig || savingMaintenance}
                onClick={handleToggleMaintenance}
                className={`px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg transition-all disabled:opacity-50 ${
                  systemConfig?.maintenanceMode
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                    : 'bg-red-700 text-white hover:bg-red-800'
                }`}
              >
                {savingMaintenance
                  ? 'Salvando...'
                  : systemConfig?.maintenanceMode
                    ? 'Liberar Sistema'
                    : 'Ativar Manutenção'}
              </button>

            </div>
          </div>

          <div className="p-8 space-y-6">

            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">
                Mensagem exibida no login
              </label>

              <textarea
                value={systemConfig?.maintenanceMessage || ''}
                onChange={(e) =>
                  setSystemConfig(prev =>
                    prev
                      ? {
                          ...prev,
                          maintenanceMessage: e.target.value
                        }
                      : prev
                  )
                }
                className="w-full min-h-[110px] bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-4 text-xs font-bold outline-none resize-none"
              />
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">
                E-mails liberados
              </label>

              <div className="bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-4 text-xs font-black text-slate-700">
                {(systemConfig?.maintenanceAllowedEmails || [
                  'thiago.andersonsilva@claro.com.br'
                ]).join(', ')}
              </div>
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-slate-100">

              <div className="text-[10px] font-bold text-slate-400 uppercase">
                Última alteração:{' '}
                <span className="text-slate-700">
                  {systemConfig?.updatedBy || 'N/A'}
                </span>
              </div>

              <button
                type="button"
                disabled={!systemConfig || savingMaintenance}
                onClick={handleMaintenanceMessageChange}
                className="bg-slate-900 text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest"
              >
                Salvar Mensagem
              </button>

            </div>

          </div>

        </div>
      )}

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
  <div className="space-y-6">

    <form
      onSubmit={handleCreateUser}
      className="bg-white border border-slate-200 rounded-[32px] p-6"
    >
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

        <div>
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">
            Nome Completo
          </label>

          <input
            required
            value={formUser.fullName}
            onChange={(e) =>
              setFormUser({
                ...formUser,
                fullName: e.target.value
              })
            }
            className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-xs font-bold outline-none"
          />
        </div>

        <div>
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">
            Perfil
          </label>

          <select
            value={formUser.role}
            onChange={(e) =>
              setFormUser({
                ...formUser,
                role: e.target.value as UserRole
              })
            }
            className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-xs font-bold outline-none"
          >
            {isGlobalAdmin && (
              <option value={UserRole.MANAGER}>
                Gestor
              </option>
            )}

            <option value={UserRole.ANALYST}>
              Analista
            </option>
          </select>
        </div>

        <div>
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">
            Grupo
          </label>

          <select
            disabled={isManager}
            value={
              isManager
                ? currentUserGroupId
                : formUser.groupId
            }
            onChange={(e) =>
              !isManager &&
              setFormUser({
                ...formUser,
                groupId: e.target.value
              })
            }
            className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-xs font-bold outline-none"
          >
            <option value="">Selecione</option>

            {visibleGroups.map(group => (
              <option
                key={group.id}
                value={group.id}
              >
                {group.id} - {group.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">
            Senha Inicial
          </label>

          <input
            value={temporaryPassword}
            onChange={(e) =>
              setTemporaryPassword(
                e.target.value
              )
            }
            className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-xs font-bold outline-none"
          />
        </div>

      </div>

      <div className="flex justify-end mt-6">
        <button
          type="submit"
          disabled={creatingUser}
          className="bg-slate-900 text-white px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all disabled:opacity-50"
        >
          {creatingUser
            ? 'Criando...'
            : 'Criar Usuário'}
        </button>
      </div>
    </form>

    <div className="bg-white border border-slate-200 rounded-[40px] shadow-sm overflow-hidden">
      <table className="w-full text-left text-xs uppercase">
        <thead className="bg-slate-50 font-black text-slate-400 border-b">
          <tr>
  <th className="px-8 py-5">
    Login / Nome
  </th>

  <th className="px-8 py-5">
    Perfil
  </th>

  <th className="px-8 py-5">
    Grupo
  </th>

  <th className="px-8 py-5">
    Gestor
  </th>

  <th className="px-8 py-5">
    Status
  </th>

  <th className="px-8 py-5 text-right">
    Ações
  </th>
</tr>
        </thead>

        <tbody className="divide-y divide-slate-100 font-bold text-slate-600">
          {filteredUsers.map(u => (
            <tr
              key={u.id}
              className={`hover:bg-slate-50/50 transition-all ${
                !u.active ? 'opacity-50' : ''
              }`}
            >
              <td className="px-8 py-5">
                <p className="font-black text-slate-900">
                  {u.normalizedLogin}
                </p>

                <p className="text-[9px] text-slate-400">
                  {u.fullName}
                </p>
              </td>

              <td className="px-8 py-5">
                <span
                  className={`px-2 py-1 rounded-lg text-[8px] font-black ${
                    u.role === UserRole.ADMIN
                      ? 'bg-emerald-100 text-emerald-700'
                      : u.role === UserRole.MANAGER
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {u.role === UserRole.ADMIN
  ? 'ADMIN'
  : u.role === UserRole.MANAGER
  ? 'GESTOR'
  : 'ANALISTA'}
                </span>
              </td>

              <td className="px-8 py-5 font-black text-claro-red">
  {u.groupId}
</td>

<td className="px-8 py-5">
  {(() => {
    const gestor = users.find(
      x =>
        x.role === UserRole.MANAGER &&
        x.groupId === u.groupId
    );

    return (
      <span className="text-[10px] font-black text-slate-700">
        {gestor?.normalizedLogin || gestor?.fullName || '-'}
      </span>
    );
  })()}
</td>

<td className="px-8 py-5">
  <div
    
                  className={`flex items-center gap-1.5 ${
                    u.active
                      ? 'text-emerald-600'
                      : 'text-slate-400'
                  }`}
                >
                  <div
                    className={`w-1.5 h-1.5 rounded-full ${
                      u.active
                        ? 'bg-emerald-500'
                        : 'bg-slate-300'
                    }`}
                  />

                  <span className="text-[9px] font-black">
                    {u.active
                      ? 'ATIVO'
                      : 'INATIVO'}
                  </span>
                </div>
              </td>

              <td className="px-8 py-5 text-right space-x-4">
                <button
                  onClick={() =>
                    handleResetPassword(
                      u.id,
                      u.normalizedLogin
                    )
                  }
                  className="text-[9px] font-black text-slate-400 hover:text-emerald-600 tracking-widest"
                >
                  RESET SENHA
                </button>

                <button
                  onClick={() =>
                    dataService.updateUserStatus(
                      u.id,
                      !u.active
                    )
                  }
                  className={`text-[9px] font-black tracking-widest ${
                    u.active
                      ? 'text-slate-400 hover:text-claro-red'
                      : 'text-emerald-600'
                  }`}
                >
                  {u.active
                    ? 'INATIVAR'
                    : 'REATIVAR'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

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
