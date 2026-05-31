import React, { useState } from 'react';

type FixedBaseDate = {
  id: string;
  date: string;
  capacity: number;
  active: boolean;
};

type FixedBaseRule = {
  id: string;
  baseId: string;
  baseName: string;
  city: string;
  uf: string;
  analystId: string;
  analystName: string;
  defaultCapacity: number;
  notes: string;
  active: boolean;
  dates: FixedBaseDate[];
  createdAt: string;
};

type Props = {
  bases?: any[];
  analysts?: any[];
  groupId?: string;
};


export default function BaseCollectiveSchedule({
  bases = [],
  analysts = [],
  groupId = 'G3',
}: Props) {

  const STORAGE_KEY = `certitech_base_fixed_dates_v1_${groupId}`;
  
  const [rules, setRules] = useState<FixedBaseRule[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [showCreate, setShowCreate] = useState(false);
  const [newDateByRule, setNewDateByRule] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    baseId: '',
    analystId: '',
    firstDate: '',
    defaultCapacity: 6,
    notes: '',
  });

  function persist(next: FixedBaseRule[]) {
    setRules(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function createRule() {
    if (!form.baseId || !form.analystId || !form.firstDate) {
      alert('Informe base, analista responsável e primeira data.');
      return;
    }

    const base = bases.find((b) => String(b.id) === String(form.baseId));
    const analyst = analysts.find((a) => String(a.id) === String(form.analystId));

    const exists = rules.some(
      (r) => String(r.baseId) === String(form.baseId) && r.active
    );

    if (exists) {
      alert('Esta base já possui uma regra ativa de data fixa.');
      return;
    }

    const rule: FixedBaseRule = {
      id: crypto.randomUUID(),
      baseId: form.baseId,
      baseName: base?.name || base?.baseName || base?.city || 'Base não identificada',
      city: base?.city || base?.cidade || '',
      uf: base?.uf || base?.state || '',
      analystId: form.analystId,
      analystName: analyst?.name || analyst?.analystName || 'Analista não identificado',
      defaultCapacity: Number(form.defaultCapacity || 6),
      notes: form.notes,
      active: true,
      dates: [
        {
          id: crypto.randomUUID(),
          date: form.firstDate,
          capacity: Number(form.defaultCapacity || 6),
          active: true,
        },
      ],
      createdAt: new Date().toISOString(),
    };

    persist([rule, ...rules]);

    setForm({
      baseId: '',
      analystId: '',
      firstDate: '',
      defaultCapacity: 6,
      notes: '',
    });

    setShowCreate(false);
  }

  function addDate(ruleId: string) {
    const date = newDateByRule[ruleId];

    if (!date) {
      alert('Informe a nova data.');
      return;
    }

    const next = rules.map((rule) => {
      if (rule.id !== ruleId) return rule;

      const exists = rule.dates.some((d) => d.date === date && d.active);
      if (exists) {
        alert('Esta data já existe para esta base.');
        return rule;
      }

      return {
        ...rule,
        dates: [
          ...rule.dates,
          {
            id: crypto.randomUUID(),
            date,
            capacity: rule.defaultCapacity,
            active: true,
          },
        ].sort((a, b) => a.date.localeCompare(b.date)),
      };
    });

    persist(next);
    setNewDateByRule({ ...newDateByRule, [ruleId]: '' });
  }

  function toggleRule(ruleId: string) {
    const next = rules.map((rule) =>
      rule.id === ruleId ? { ...rule, active: !rule.active } : rule
    );

    persist(next);
  }

  function toggleDate(ruleId: string, dateId: string) {
    const next = rules.map((rule) => {
      if (rule.id !== ruleId) return rule;

      return {
        ...rule,
        dates: rule.dates.map((date) =>
          date.id === dateId ? { ...date, active: !date.active } : date
        ),
      };
    });

    persist(next);
  }

  function deleteDate(ruleId: string, dateId: string) {
  if (!window.confirm('Deseja excluir esta data fixa?')) return;

  const next = rules.map((rule) => {
    if (rule.id !== ruleId) return rule;

    return {
      ...rule,
      dates: rule.dates.filter((date) => date.id !== dateId),
    };
  });

  persist(next);
}

  function updateDateCapacity(ruleId: string, dateId: string, capacity: number) {
    const next = rules.map((rule) => {
      if (rule.id !== ruleId) return rule;

      return {
        ...rule,
        dates: rule.dates.map((date) =>
          date.id === dateId ? { ...date, capacity: Number(capacity || 6) } : date
        ),
      };
    });

    persist(next);
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">
            Datas Fixas Presenciais Por Base
          </h1>
          <p className="text-sm text-slate-500">
            Configure bases com datas presenciais programadas para baixo volume de técnicos. Esta tela ainda não altera as regras atuais do app.
          </p>
        </div>

        <button
          onClick={() => setShowCreate(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg"
        >
          + Nova base presencial
        </button>
      </div>

      {showCreate && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-600">Base</label>
            <select
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={form.baseId}
              onChange={(e) => setForm({ ...form, baseId: e.target.value })}
            >
              <option value="">Selecione</option>
              {bases.map((base) => (
                <option key={base.id} value={base.id}>
                  {base.name || base.baseName || base.city || base.cidade}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">
              Primeira data
            </label>
            <input
              type="date"
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={form.firstDate}
              onChange={(e) => setForm({ ...form, firstDate: e.target.value })}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">
              Analista responsável
            </label>
            <select
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={form.analystId}
              onChange={(e) => setForm({ ...form, analystId: e.target.value })}
            >
              <option value="">Selecione</option>
              {analysts.map((analyst) => (
  <option key={analyst.id} value={analyst.id}>
    {analyst.normalizedLogin ||
      analyst.fullName ||
      analyst.name ||
      analyst.analystName ||
      analyst.firstNameLogin ||
      analyst.id}
  </option>
))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">
              Capacidade padrão
            </label>
            <input
              type="number"
              min={1}
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={form.defaultCapacity}
              onChange={(e) =>
                setForm({ ...form, defaultCapacity: Number(e.target.value) })
              }
            />
          </div>

          <div className="md:col-span-3">
            <label className="text-xs font-semibold text-slate-600">
              Observação
            </label>
            <textarea
              className="w-full border rounded-lg px-3 py-2 text-sm min-h-[70px]"
              placeholder="Ex: aplicação por multiplicador, gestor, apoio CQ..."
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          <div className="md:col-span-3 flex justify-end gap-2">
            <button
              onClick={() => setShowCreate(false)}
              className="border border-slate-300 text-slate-600 text-sm font-semibold px-4 py-2 rounded-lg"
            >
              Cancelar
            </button>

            <button
              onClick={createRule}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg"
            >
              Salvar base
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {rules.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-slate-400">
            Nenhuma base com data fixa criada.
          </div>
        )}

        {rules.map((rule) => (
          <div
            key={rule.id}
            className={`rounded-xl border shadow-sm p-4 ${
              rule.active
                ? 'bg-white border-slate-200'
                : 'bg-slate-50 border-slate-200 opacity-70'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-800">
                    {rule.baseName}
                  </h2>

                  <span
                    className={`text-xs font-semibold px-2 py-1 rounded-full ${
                      rule.active
                        ? 'bg-green-100 text-green-700'
                        : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {rule.active ? 'Ativa' : 'Inativa'}
                  </span>
                </div>

                <p className="text-sm text-slate-500">
                  {rule.city}/{rule.uf} • Analista: {rule.analystName} • Capacidade padrão: {rule.defaultCapacity}
                </p>

                {rule.notes && (
                  <p className="text-sm text-slate-600 mt-1">
                    Obs.: {rule.notes}
                  </p>
                )}
              </div>

              <button
                onClick={() => toggleRule(rule.id)}
                className={`text-sm font-semibold px-3 py-2 rounded-lg ${
                  rule.active
                    ? 'bg-red-50 text-red-600 hover:bg-red-100'
                    : 'bg-green-50 text-green-700 hover:bg-green-100'
                }`}
              >
                {rule.active ? 'Desativar base' : 'Ativar base'}
              </button>
            </div>

            <div className="mt-4 border-t pt-3">
              <div className="flex flex-col md:flex-row md:items-end gap-2 mb-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600">
                    Criar nova data
                  </label>
                  <input
                    type="date"
                    className="border rounded-lg px-3 py-2 text-sm"
                    value={newDateByRule[rule.id] || ''}
                    onChange={(e) =>
                      setNewDateByRule({
                        ...newDateByRule,
                        [rule.id]: e.target.value,
                      })
                    }
                  />
                </div>

                <button
                  onClick={() => addDate(rule.id)}
                  disabled={!rule.active}
                  className="bg-slate-800 hover:bg-slate-900 disabled:bg-slate-300 text-white text-sm font-semibold px-4 py-2 rounded-lg"
                >
                  + Criar nova data
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm border rounded-lg overflow-hidden">
                  <thead className="bg-slate-100 text-slate-600">
                    <tr>
  <th className="text-left px-3 py-2">Data</th>
  <th className="text-center px-3 py-2">Capacidade</th>
  <th className="text-center px-3 py-2">Status</th>
  <th className="text-center px-3 py-2">Ações</th>
</tr>
                  </thead>

                  <tbody>
                    {rule.dates.map((date) => (
                      <tr key={date.id} className="border-t">
                        <td className="px-3 py-2 font-medium">
                          {date.date.split('-').reverse().join('/')}
                        </td>

                        <td className="px-3 py-2 text-center">
                          <input
                            type="number"
                            min={1}
                            className="w-20 border rounded-lg px-2 py-1 text-sm text-center"
                            value={date.capacity}
                            onChange={(e) =>
                              updateDateCapacity(
                                rule.id,
                                date.id,
                                Number(e.target.value)
                              )
                            }
                          />
                        </td>

                        <td className="px-3 py-2 text-center">
                          <button
                            onClick={() => toggleDate(rule.id, date.id)}
                            className={`px-2 py-1 rounded-full text-xs font-semibold ${
                              date.active
                                ? 'bg-green-100 text-green-700'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {date.active ? 'Ativa' : 'Inativa'}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-center">
  <button
    onClick={() => deleteDate(rule.id, date.id)}
    className="px-2 py-1 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 text-xs font-black"
    title="Excluir data fixa"
  >
    🗑
  </button>
</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
        <strong>Seguro para produção:</strong> esta etapa apenas cria e gerencia
        bases com datas fixas. Ainda não interfere no agendamento automático.
      </div>
    </div>
  );
}
