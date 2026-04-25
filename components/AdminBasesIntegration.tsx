import React, { useEffect, useMemo, useState } from 'react';
import { dataService } from '../services/dataService';
import { User, UserRole, IntegrationBase, RoutingRule, AnalystIntegrationMapping } from '../types';

interface Props {
  user: User;
}

type TabKey = 'bases' | 'routing' | 'mappings';

const AdminBasesIntegration: React.FC<Props> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<TabKey>('bases');
  const [bases, setBases] = useState<IntegrationBase[]>(dataService.getIntegrationBases());
  const [rules, setRules] = useState<RoutingRule[]>(dataService.getRoutingRules());
  const [mappings, setMappings] = useState<AnalystIntegrationMapping[]>(dataService.getAnalystMappings());
  const [users, setUsers] = useState(dataService.getUsers());

  const [isBaseModalOpen, setIsBaseModalOpen] = useState(false);
  const [editingBaseId, setEditingBaseId] = useState<string | null>(null);
  const [newBase, setNewBase] = useState({
  name: '',
  city: '',
  uf: '',
  address: '',
  notes: '',
  powerAppsBaseId: ''
});
  
  // MODAL REGRA
const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);

const [newRule, setNewRule] = useState({
  city: '',
  uf: '',
  coveredCities: [] as string[],
  coveredUfs: [] as string[],
  analystId: '',
  company: '',
  baseId: '',
  priority: 1,
  notes: ''
});

const [coveredCityInput, setCoveredCityInput] = useState('');
const [coveredUfInput, setCoveredUfInput] = useState('');

  const handleSaveRule = () => {
  if (!newRule.city || !newRule.uf || !newRule.baseId) {
    alert('Preencha Cidade, UF e Base');
    return;
  }

  const rule: RoutingRule = {
  id: editingRuleId || 'rule-' + Date.now(),
  groupId: user.groupId,
  city: newRule.city.toUpperCase(),
  uf: newRule.uf.toUpperCase(),
  coveredCities: newRule.coveredCities,
  coveredUfs: newRule.coveredUfs,
  analystId: newRule.analystId || undefined,
  company: newRule.company || undefined,
  baseId: newRule.baseId,
  priority: Number(newRule.priority) || 1,
  active: editingRuleId
    ? rules.find(r => r.id === editingRuleId)?.active ?? true
    : true
};

  dataService.saveRoutingRule(rule);

  setIsRuleModalOpen(false);
  setEditingRuleId(null);

  setNewRule({
  city: rule.city || '',
  uf: rule.uf || '',
  coveredCities: rule.coveredCities || [],
  coveredUfs: rule.coveredUfs || [],
  analystId: rule.analystId || '',
  company: rule.company || '',
  baseId: rule.baseId || '',
  priority: rule.priority || 1,
  notes: ''
});

  refresh();
};
  const handleEditRule = (rule: RoutingRule) => {
  setEditingRuleId(rule.id);

  setNewRule({
    city: rule.city || '',
    uf: rule.uf || '',
    analystId: rule.analystId || '',
    company: rule.company || '',
    baseId: rule.baseId || '',
    priority: rule.priority || 1,
    notes: ''
  });

  setIsRuleModalOpen(true);
};

const handleToggleRuleStatus = (rule: RoutingRule) => {
  const updatedRule: RoutingRule = {
    ...rule,
    active: !rule.active
  };

  dataService.saveRoutingRule(updatedRule);
  refresh();
};
  

  const refresh = () => {
    setBases(dataService.getIntegrationBases());
    setRules(dataService.getRoutingRules());
    setMappings(dataService.getAnalystMappings());
    setUsers(dataService.getUsers());
  };

  useEffect(() => {
    window.addEventListener('data-updated', refresh);
    return () => window.removeEventListener('data-updated', refresh);
  }, []);

  const analysts = useMemo(() => {
    return users.filter(
      u => u.role === UserRole.ANALYST && u.active && u.groupId === user.groupId
    );
  }, [users, user.groupId]);

  const resetBaseForm = () => {
    setEditingBaseId(null);
    setNewBase({
      name: '',
      city: '',
      uf: '',
      address: '',
      notes: '',
      powerAppsBaseId: ''
    });
  };

  const handleSaveBase = () => {
    if (!newBase.name || !newBase.city || !newBase.uf) {
      alert('Preencha Nome, Cidade e UF');
      return;
    }

    const base: IntegrationBase = {
      id: editingBaseId || 'base-' + Date.now(),
      groupId: user.groupId,
      name: newBase.name.toUpperCase(),
      city: newBase.city.toUpperCase(),
      uf: newBase.uf.toUpperCase(),
      address: newBase.address || '',
      notes: newBase.notes || '',
      powerAppsBaseId: newBase.powerAppsBaseId || '',
      active: editingBaseId
        ? bases.find(b => b.id === editingBaseId)?.active ?? true
        : true
    };

    dataService.saveIntegrationBase(base);

    setIsBaseModalOpen(false);
    resetBaseForm();
    refresh();
  };

  const handleEditBase = (base: IntegrationBase) => {
    setEditingBaseId(base.id);

    setNewBase({
      name: base.name || '',
      city: base.city || '',
      uf: base.uf || '',
      address: base.address || '',
      notes: base.notes || '',
      powerAppsBaseId: base.powerAppsBaseId || ''
    });

    setIsBaseModalOpen(true);
  };

  const handleToggleBaseStatus = (base: IntegrationBase) => {
    const updatedBase: IntegrationBase = {
      ...base,
      active: !base.active
    };

    dataService.saveIntegrationBase(updatedBase);
    refresh();
  };

  if (user.role !== UserRole.ADMIN) {
    return (
      <div className="bg-white p-10 rounded-[40px] border border-slate-200 shadow-sm">
        <h2 className="text-sm font-black uppercase text-slate-900">
          Acesso restrito ao ADMIN
        </h2>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-8">
          <div>
            <h2 className="text-lg font-black text-slate-900 uppercase tracking-wider">
              Bases & Integração
            </h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
              Cadastro administrativo para bases presenciais, roteamento e PowerApps
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { id: 'bases', label: 'Bases Presenciais' },
              { id: 'routing', label: 'Regras de Roteamento' },
              { id: 'mappings', label: 'Analistas x PowerApps' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabKey)}
                className={`px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  activeTab === tab.id
                    ? 'bg-claro-red text-white shadow-lg'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'bases' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">
                Bases Presenciais
              </h3>

              <button
                onClick={() => {
                  resetBaseForm();
                  setIsBaseModalOpen(true);
                }}
                className="bg-slate-900 text-white px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest"
              >
                Nova Base
              </button>
            </div>

            <div className="rounded-[28px] border border-slate-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="p-4 text-left text-[9px] font-black text-slate-400 uppercase">Base</th>
                    <th className="p-4 text-left text-[9px] font-black text-slate-400 uppercase">Cidade/UF</th>
                    <th className="p-4 text-left text-[9px] font-black text-slate-400 uppercase">Endereço</th>
                    <th className="p-4 text-left text-[9px] font-black text-slate-400 uppercase">ID PowerApps</th>
                    <th className="p-4 text-left text-[9px] font-black text-slate-400 uppercase">Status</th>
                    <th className="p-4 text-left text-[9px] font-black text-slate-400 uppercase">Ações</th>
                  </tr>
                </thead>

                <tbody>
                  {bases.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-[11px] font-bold text-slate-400 uppercase">
                        Nenhuma base cadastrada
                      </td>
                    </tr>
                  ) : (
                    bases.map(base => (
                      <tr key={base.id} className="border-t border-slate-100">
                        <td className="p-4 text-xs font-black text-slate-800 uppercase">{base.name}</td>
                        <td className="p-4 text-xs font-bold text-slate-600">{base.city}/{base.uf}</td>
                        <td className="p-4 text-xs font-bold text-slate-600">{base.address}</td>
                        <td className="p-4 text-xs font-bold text-slate-600">{base.powerAppsBaseId}</td>

                        <td className="p-4">
                          <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase ${
                            base.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {base.active ? 'Ativa' : 'Inativa'}
                          </span>
                        </td>

                        <td className="p-4">
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleEditBase(base)}
                              className="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-[9px] font-black uppercase hover:bg-slate-200"
                            >
                              Editar
                            </button>

                            <button
                              onClick={() => handleToggleBaseStatus(base)}
                              className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase ${
                                base.active
                                  ? 'bg-red-100 text-red-700 hover:bg-red-200'
                                  : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                              }`}
                            >
                              {base.active ? 'Inativar' : 'Ativar'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'routing' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">
                Regras de Roteamento
              </h3>
              <button
  onClick={() => setIsRuleModalOpen(true)}
  className="bg-slate-900 text-white px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest"
>
  Nova Regra
</button>
            </div>

            <div className="rounded-[28px] border border-slate-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-50">
  <tr>
    <th className="p-4 text-left text-[9px] font-black text-slate-400 uppercase">Cidade/UF</th>
    <th className="p-4 text-left text-[9px] font-black text-slate-400 uppercase">Analista</th>
    <th className="p-4 text-left text-[9px] font-black text-slate-400 uppercase">Empresa</th>
    <th className="p-4 text-left text-[9px] font-black text-slate-400 uppercase">Base</th>
    <th className="p-4 text-left text-[9px] font-black text-slate-400 uppercase">Prioridade</th>
    <th className="p-4 text-left text-[9px] font-black text-slate-400 uppercase">Status</th>
    <th className="p-4 text-left text-[9px] font-black text-slate-400 uppercase">Ações</th>
  </tr>
</thead>

                <tbody>
                  {rules.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-[11px] font-bold text-slate-400 uppercase">
                        Nenhuma regra cadastrada
                      </td>
                    </tr>
                  ) : (
                    rules.map(rule => {
                      const base = bases.find(b => b.id === rule.baseId);
                      const analyst = analysts.find(a => a.id === rule.analystId);

                      return (
                        <tr key={rule.id} className="border-t border-slate-100">
                          <td className="p-4 text-xs font-bold text-slate-700">{rule.city}/{rule.uf}</td>
                          <td className="p-4 text-xs font-bold text-slate-600">{analyst?.fullName || 'Qualquer analista'}</td>
                          <td className="p-4 text-xs font-bold text-slate-600">{rule.company || 'Qualquer empresa'}</td>
                          <td className="p-4 text-xs font-bold text-slate-600">{base?.name || 'Base não encontrada'}</td>
                          <td className="p-4 text-xs font-black text-claro-red">{rule.priority}</td>
                          <td className="p-4 text-xs font-bold">{rule.active ? 'Ativa' : 'Inativa'}</td>
                          <td className="p-4">
  <div className="flex gap-2">
    <button
      onClick={() => handleEditRule(rule)}
      className="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-[9px] font-black uppercase hover:bg-slate-200"
    >
      Editar
    </button>

    <button
      onClick={() => handleToggleRuleStatus(rule)}
      className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase ${
        rule.active
          ? 'bg-red-100 text-red-700 hover:bg-red-200'
          : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
      }`}
    >
      {rule.active ? 'Inativar' : 'Ativar'}
    </button>
  </div>
</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'mappings' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">
                Analistas x PowerApps
              </h3>
              <button className="bg-slate-900 text-white px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest">
                Novo Mapeamento
              </button>
            </div>

            <div className="rounded-[28px] border border-slate-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="p-4 text-left text-[9px] font-black text-slate-400 uppercase">Analista</th>
                    <th className="p-4 text-left text-[9px] font-black text-slate-400 uppercase">ID Interno</th>
                    <th className="p-4 text-left text-[9px] font-black text-slate-400 uppercase">ID PowerApps</th>
                    <th className="p-4 text-left text-[9px] font-black text-slate-400 uppercase">Status</th>
                  </tr>
                </thead>

                <tbody>
                  {mappings.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-[11px] font-bold text-slate-400 uppercase">
                        Nenhum mapeamento cadastrado
                      </td>
                    </tr>
                  ) : (
                    mappings.map(mapping => {
                      const analyst = analysts.find(a => a.id === mapping.userId);

                      return (
                        <tr key={mapping.id} className="border-t border-slate-100">
                          <td className="p-4 text-xs font-black text-slate-800 uppercase">{analyst?.fullName || 'Analista não encontrado'}</td>
                          <td className="p-4 text-xs font-bold text-slate-600">{mapping.userId}</td>
                          <td className="p-4 text-xs font-bold text-slate-600">{mapping.powerAppsUserId}</td>
                          <td className="p-4 text-xs font-bold">{mapping.active ? 'Ativo' : 'Inativo'}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {isBaseModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-[30px] w-[500px] space-y-4">
            <h3 className="text-sm font-black uppercase text-slate-900">
              {editingBaseId ? 'Editar Base Presencial' : 'Nova Base Presencial'}
            </h3>

            <input
              placeholder="Nome da Base"
              value={newBase.name}
              onChange={(e) => setNewBase({ ...newBase, name: e.target.value })}
              className="w-full p-3 border rounded-xl"
            />

            <div className="flex gap-2">
  <input
    placeholder="Cidade"
    value={newRule.city}
    onChange={(e) => setNewRule({ ...newRule, city: e.target.value })}
    className="w-full p-3 border rounded-xl"
  />
  <input
    placeholder="UF"
    value={newRule.uf}
    onChange={(e) => setNewRule({ ...newRule, uf: e.target.value })}
    className="w-20 p-3 border rounded-xl"
  />
</div>

{/* 👇 COLAR AQUI */}

<div>
  <label className="block text-[10px] font-black text-slate-500 uppercase mb-2">
    Cidades atendidas pela base
  </label>

  <div className="flex gap-2 mb-3">
    <input
      value={coveredCityInput}
      onChange={(e) => setCoveredCityInput(e.target.value)}
      placeholder="Ex: Cambé"
      className="flex-1 p-3 border rounded-xl text-xs font-bold"
    />

    <input
      value={coveredUfInput}
      onChange={(e) => setCoveredUfInput(e.target.value.toUpperCase())}
      placeholder="UF"
      maxLength={2}
      className="w-20 p-3 border rounded-xl text-xs font-bold uppercase"
    />

    <button
      type="button"
      onClick={() => {
        if (!coveredCityInput || !coveredUfInput) return;

        setNewRule({
          ...newRule,
          coveredCities: [...newRule.coveredCities, coveredCityInput.toUpperCase()],
          coveredUfs: [...newRule.coveredUfs, coveredUfInput.toUpperCase()]
        });

        setCoveredCityInput('');
        setCoveredUfInput('');
      }}
      className="px-3 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase"
    >
      +
    </button>
  </div>

  <div className="flex flex-wrap gap-2">
    {newRule.coveredCities.map((city, index) => (
      <span
        key={index}
        className="px-3 py-2 bg-red-50 text-red-700 rounded-full text-[10px] font-black uppercase flex items-center gap-2"
      >
        {city}/{newRule.coveredUfs[index]}

        <button
          type="button"
          onClick={() => {
            setNewRule({
              ...newRule,
              coveredCities: newRule.coveredCities.filter((_, i) => i !== index),
              coveredUfs: newRule.coveredUfs.filter((_, i) => i !== index)
            });
          }}
        >
          ×
        </button>
      </span>
    ))}
  </div>
</div>

            <input
              placeholder="Endereço"
              value={newBase.address}
              onChange={(e) => setNewBase({ ...newBase, address: e.target.value })}
              className="w-full p-3 border rounded-xl"
            />

            <input
              placeholder="ID PowerApps Base"
              value={newBase.powerAppsBaseId}
              onChange={(e) => setNewBase({ ...newBase, powerAppsBaseId: e.target.value })}
              className="w-full p-3 border rounded-xl"
            />

            <textarea
              placeholder="Observações"
              value={newBase.notes}
              onChange={(e) => setNewBase({ ...newBase, notes: e.target.value })}
              className="w-full p-3 border rounded-xl"
            />

            <div className="flex gap-2 pt-4">
              <button
                onClick={() => {
                  setIsBaseModalOpen(false);
                  resetBaseForm();
                }}
                className="flex-1 p-3 bg-slate-200 rounded-xl text-xs font-black uppercase"
              >
                Cancelar
              </button>

              <button
                onClick={handleSaveBase}
                className="flex-1 p-3 bg-claro-red text-white rounded-xl text-xs font-black uppercase"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
          )}

      {isRuleModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-[30px] w-[500px] space-y-4">
            <h3 className="text-sm font-black uppercase text-slate-900">
              {editingRuleId ? 'Editar Regra de Roteamento' : 'Nova Regra de Roteamento'}
            </h3>

            <div className="flex gap-2">
              <input
                placeholder="Cidade"
                value={newRule.city}
                onChange={(e) => setNewRule({ ...newRule, city: e.target.value })}
                className="w-full p-3 border rounded-xl"
              />
              <input
                placeholder="UF"
                value={newRule.uf}
                onChange={(e) => setNewRule({ ...newRule, uf: e.target.value })}
                className="w-20 p-3 border rounded-xl"
              />
            </div>

            <select
              value={newRule.analystId}
              onChange={(e) => setNewRule({ ...newRule, analystId: e.target.value })}
              className="w-full p-3 border rounded-xl"
            >
              <option value="">Qualquer Analista</option>
              {analysts.map(a => (
                <option key={a.id} value={a.id}>{a.fullName}</option>
              ))}
            </select>

            <input
              placeholder="Empresa (opcional)"
              value={newRule.company}
              onChange={(e) => setNewRule({ ...newRule, company: e.target.value })}
              className="w-full p-3 border rounded-xl"
            />

            <select
              value={newRule.baseId}
              onChange={(e) => setNewRule({ ...newRule, baseId: e.target.value })}
              className="w-full p-3 border rounded-xl"
            >
              <option value="">Selecione a Base</option>
              {bases.filter(b => b.active).map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>

            <input
              type="number"
              placeholder="Prioridade"
              value={newRule.priority}
              onChange={(e) => setNewRule({ ...newRule, priority: Number(e.target.value) })}
              className="w-full p-3 border rounded-xl"
            />

            <div className="flex gap-2 pt-4">
              <button
                onClick={() => {
  setIsRuleModalOpen(false);
  setEditingRuleId(null);
  setNewRule({
    city: '',
    uf: '',
    analystId: '',
    company: '',
    baseId: '',
    priority: 1,
    notes: ''
  });
}}
                className="flex-1 p-3 bg-slate-200 rounded-xl text-xs font-black uppercase"
              >
                Cancelar
              </button>

              <button
                onClick={handleSaveRule}
                className="flex-1 p-3 bg-claro-red text-white rounded-xl text-xs font-black uppercase"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminBasesIntegration;
