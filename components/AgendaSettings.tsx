import React, { useEffect, useState } from 'react';
import { User, AgendaTrainingType, OperationalEventType, UserRole } from '../types';
import { dataService } from '../services/dataService';

interface AgendaSettingsProps {
  user: User;
}

const emptyForm: AgendaTrainingType = {
  id: '',
  name: '',
  agendaTitle: '',
  color: '#0F766E',
  active: true,
  allowLesson: true,
  maxLessons: 9,
  sortOrder: 1
};

const emptyEventForm: OperationalEventType = {
  id: '',
  name: '',
  color: '#455A64',
  category: 'OTHER',
  active: true,
  sortOrder: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

const AgendaSettings: React.FC<AgendaSettingsProps> = ({ user }) => {
  const [trainingTypes, setTrainingTypes] = useState<AgendaTrainingType[]>([]);
  const [editing, setEditing] = useState<AgendaTrainingType | null>(null);
  const [activeSection, setActiveSection] = useState<'TRAININGS' | 'EVENTS'>('TRAININGS');
const [operationalEvents, setOperationalEvents] = useState<OperationalEventType[]>([]);
const [editingEvent, setEditingEvent] = useState<OperationalEventType | null>(null);

  const canEdit = user.role === UserRole.ADMIN || user.role === UserRole.MANAGER;

  const load = () => {
  setTrainingTypes(dataService.getTrainingTypes());
  setOperationalEvents(dataService.getOperationalEventTypes());
};

  useEffect(() => {
    load();

    const onUpdate = () => load();
    window.addEventListener('data-updated', onUpdate);

    return () => {
      window.removeEventListener('data-updated', onUpdate);
    };
  }, []);

  const save = () => {
    if (!editing) return;

    const name = editing.name.trim().toUpperCase();

    if (!name) {
      alert('Informe o nome do treinamento.');
      return;
    }

    const nextItem: AgendaTrainingType = {
      ...editing,
      id: editing.id || `training-${Date.now()}`,
      name,
      agendaTitle: editing.agendaTitle.trim().toUpperCase() || `ETN ${name}`,
      sortOrder: Number(editing.sortOrder || 1),
      maxLessons: editing.allowLesson ? Number(editing.maxLessons || 9) : 0
    };

    const exists = trainingTypes.some(t => t.id === nextItem.id);

const desiredOrder = Number(nextItem.sortOrder || 1);

let baseList = exists
  ? trainingTypes.filter(t => t.id !== nextItem.id)
  : [...trainingTypes];

baseList = baseList
  .sort((a, b) => a.sortOrder - b.sortOrder)
  .map((item, index) => ({
    ...item,
    sortOrder: index + 1
  }));

const insertIndex = Math.max(
  0,
  Math.min(desiredOrder - 1, baseList.length)
);

const reorderedList = [
  ...baseList.slice(0, insertIndex),
  {
    ...nextItem,
    sortOrder: desiredOrder
  },
  ...baseList.slice(insertIndex)
].map((item, index) => ({
  ...item,
  sortOrder: index + 1
}));

dataService.saveTrainingTypes(reorderedList);
    setEditing(null);
    load();
  };

  const toggleActive = (item: AgendaTrainingType) => {
    const nextList = trainingTypes.map(t =>
      t.id === item.id ? { ...t, active: !t.active } : t
    );

    dataService.saveTrainingTypes(nextList);
    load();
  };

  const removeItem = (item: AgendaTrainingType) => {
    const ok = confirm(
      `Deseja remover "${item.name}" da lista?\n\nSe já existir histórico com esse treinamento, prefira INATIVAR.`
    );

    if (!ok) return;

    const nextList = trainingTypes.filter(t => t.id !== item.id);
    dataService.saveTrainingTypes(nextList);
    load();
  };

  const saveOperationalEvent = () => {
  if (!editingEvent) return;

  const name = editingEvent.name.trim().toUpperCase();

  if (!name) {
    alert('Informe o nome do evento.');
    return;
  }

  const nextItem: OperationalEventType = {
    ...editingEvent,
    id: editingEvent.id || `event-${Date.now()}`,
    name,
    sortOrder: Number(editingEvent.sortOrder || 1),
    updatedAt: new Date().toISOString(),
    createdAt: editingEvent.createdAt || new Date().toISOString()
  };

  const exists = operationalEvents.some(e => e.id === nextItem.id);
  const desiredOrder = Number(nextItem.sortOrder || 1);

  let baseList = exists
    ? operationalEvents.filter(e => e.id !== nextItem.id)
    : [...operationalEvents];

  baseList = baseList
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item, index) => ({
      ...item,
      sortOrder: index + 1
    }));

  const insertIndex = Math.max(
    0,
    Math.min(desiredOrder - 1, baseList.length)
  );

  const reorderedList = [
    ...baseList.slice(0, insertIndex),
    nextItem,
    ...baseList.slice(insertIndex)
  ].map((item, index) => ({
    ...item,
    sortOrder: index + 1
  }));

  dataService.saveOperationalEventTypes(reorderedList);
  setEditingEvent(null);
  load();
};

const toggleOperationalEventActive = (item: OperationalEventType) => {
  const nextList = operationalEvents.map(e =>
    e.id === item.id
      ? { ...e, active: !e.active, updatedAt: new Date().toISOString() }
      : e
  );

  dataService.saveOperationalEventTypes(nextList);
  load();
};

const removeOperationalEvent = (item: OperationalEventType) => {
  const ok = confirm(
    `Deseja remover "${item.name}" da lista?\n\nSe já existir histórico com esse evento, prefira INATIVAR.`
  );

  if (!ok) return;

  const nextList = operationalEvents.filter(e => e.id !== item.id);
  dataService.saveOperationalEventTypes(nextList);
  load();
};

  return (
    <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm p-8">
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h2 className="text-xl font-black uppercase tracking-tight text-slate-900">
            Configurações da Agenda
          </h2>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-2">
            Gerencie os treinamentos que aparecem no modal da agenda operacional
          </p>
        </div>

       {canEdit && (
  <button
    onClick={() => {
      if (activeSection === 'TRAININGS') {
        setEditing({
          ...emptyForm,
          sortOrder: trainingTypes.length + 1
        });
        return;
      }

      setEditingEvent({
        ...emptyEventForm,
        sortOrder: operationalEvents.length + 1
      });
    }}
    className="bg-claro-red text-white px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-md"
  >
    {activeSection === 'TRAININGS' ? 'Novo Treinamento' : 'Novo Evento'}
  </button>
)}
 
      </div>

      <div className="flex gap-3 mb-8">
  <button
    onClick={() => setActiveSection('TRAININGS')}
    className={`px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-md ${
      activeSection === 'TRAININGS'
        ? 'bg-claro-red text-white'
        : 'bg-slate-100 text-slate-500'
    }`}
  >
    Treinamentos ETN
  </button>

  <button
    onClick={() => setActiveSection('EVENTS')}
    className={`px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-md ${
      activeSection === 'EVENTS'
        ? 'bg-claro-red text-white'
        : 'bg-slate-100 text-slate-500'
    }`}
  >
    Eventos Operacionais
  </button>
</div>

  {activeSection === 'TRAININGS' ? (
  <div className="rounded-[28px] border border-slate-200 overflow-hidden">
    <div className="max-h-[60vh] overflow-y-auto">
      <table className="w-full text-left">
        <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="p-4 text-[10px] font-black uppercase text-slate-400">Ordem</th>
            <th className="p-4 text-[10px] font-black uppercase text-slate-400">Nome</th>
            <th className="p-4 text-[10px] font-black uppercase text-slate-400">Título Agenda</th>
            <th className="p-4 text-[10px] font-black uppercase text-slate-400">Cor</th>
            <th className="p-4 text-[10px] font-black uppercase text-slate-400">Aula</th>
            <th className="p-4 text-[10px] font-black uppercase text-slate-400">Status</th>
            <th className="p-4 text-[10px] font-black uppercase text-slate-400 text-right">Ações</th>
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-100">
          {trainingTypes.map(item => (
            <tr key={item.id} className={!item.active ? 'bg-slate-50 opacity-60' : 'bg-white'}>
              <td className="p-4 text-xs font-black text-slate-700">{item.sortOrder}</td>

              <td className="p-4 text-xs font-black text-slate-900 uppercase">{item.name}</td>

              <td className="p-4 text-xs font-bold text-slate-500 uppercase">{item.agendaTitle}</td>

              <td className="p-4">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full border border-slate-200" style={{ backgroundColor: item.color }} />
                  <span className="text-[10px] font-bold text-slate-400 uppercase">{item.color}</span>
                </div>
              </td>

              <td className="p-4 text-[10px] font-black uppercase text-slate-500">
                {item.allowLesson ? `Sim (${item.maxLessons})` : 'Não'}
              </td>

              <td className="p-4">
                <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${
                  item.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'
                }`}>
                  {item.active ? 'Ativo' : 'Inativo'}
                </span>
              </td>

              <td className="p-4">
                <div className="flex justify-end gap-2">
                  <button
                    disabled={!canEdit}
                    onClick={() => setEditing(item)}
                    className="px-3 py-2 rounded-xl bg-slate-900 text-white text-[9px] font-black uppercase disabled:opacity-30"
                  >
                    Editar
                  </button>

                  <button
                    disabled={!canEdit}
                    onClick={() => toggleActive(item)}
                    className="px-3 py-2 rounded-xl bg-amber-500 text-white text-[9px] font-black uppercase disabled:opacity-30"
                  >
                    {item.active ? 'Inativar' : 'Ativar'}
                  </button>

                  <button
                    disabled={!canEdit}
                    onClick={() => removeItem(item)}
                    className="px-3 py-2 rounded-xl bg-rose-600 text-white text-[9px] font-black uppercase disabled:opacity-30"
                  >
                    Remover
                  </button>
                </div>
              </td>
            </tr>
          ))}

          {trainingTypes.length === 0 && (
            <tr>
              <td colSpan={7} className="p-8 text-center text-xs font-bold text-slate-400 uppercase">
                Nenhum treinamento cadastrado.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </div>
) : (
  <div className="rounded-[28px] border border-slate-200 overflow-hidden">
    <div className="max-h-[60vh] overflow-y-auto">
      <table className="w-full text-left">
        <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="p-4 text-[10px] font-black uppercase text-slate-400">Ordem</th>
            <th className="p-4 text-[10px] font-black uppercase text-slate-400">Nome</th>
            <th className="p-4 text-[10px] font-black uppercase text-slate-400">Categoria</th>
            <th className="p-4 text-[10px] font-black uppercase text-slate-400">Cor</th>
            <th className="p-4 text-[10px] font-black uppercase text-slate-400">Status</th>
            <th className="p-4 text-[10px] font-black uppercase text-slate-400 text-right">Ações</th>
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-100">
          {operationalEvents.map(item => (
            <tr key={item.id} className={!item.active ? 'bg-slate-50 opacity-60' : 'bg-white'}>
              <td className="p-4 text-xs font-black text-slate-700">{item.sortOrder}</td>

              <td className="p-4 text-xs font-black text-slate-900 uppercase">{item.name}</td>

              <td className="p-4 text-[10px] font-black uppercase text-slate-500">{item.category}</td>

              <td className="p-4">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full border border-slate-200" style={{ backgroundColor: item.color }} />
                  <span className="text-[10px] font-bold text-slate-400 uppercase">{item.color}</span>
                </div>
              </td>

              <td className="p-4">
                <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${
                  item.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'
                }`}>
                  {item.active ? 'Ativo' : 'Inativo'}
                </span>
              </td>

              <td className="p-4">
                <div className="flex justify-end gap-2">
                  <button
                    disabled={!canEdit}
                    onClick={() => setEditingEvent(item)}
                    className="px-3 py-2 rounded-xl bg-slate-900 text-white text-[9px] font-black uppercase disabled:opacity-30"
                  >
                    Editar
                  </button>

                  <button
                    disabled={!canEdit}
                    onClick={() => toggleOperationalEventActive(item)}
                    className="px-3 py-2 rounded-xl bg-amber-500 text-white text-[9px] font-black uppercase disabled:opacity-30"
                  >
                    {item.active ? 'Inativar' : 'Ativar'}
                  </button>

                  <button
                    disabled={!canEdit}
                    onClick={() => removeOperationalEvent(item)}
                    className="px-3 py-2 rounded-xl bg-rose-600 text-white text-[9px] font-black uppercase disabled:opacity-30"
                  >
                    Remover
                  </button>
                </div>
              </td>
            </tr>
          ))}

          {operationalEvents.length === 0 && (
            <tr>
              <td colSpan={6} className="p-8 text-center text-xs font-bold text-slate-400 uppercase">
                Nenhum evento operacional cadastrado.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </div>
)}
      {editing && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-2xl p-8">
            <h3 className="text-lg font-black uppercase text-slate-900 mb-6">
              {editing.id ? 'Editar Treinamento' : 'Novo Treinamento'}
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <label className="flex flex-col gap-2">
                <span className="text-[10px] font-black uppercase text-slate-400">Nome</span>
                <input
                  value={editing.name}
                  onChange={e => setEditing({ ...editing, name: e.target.value })}
                  className="border border-slate-200 rounded-2xl px-4 py-3 text-xs font-bold uppercase"
                  placeholder="INST HFC"
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-[10px] font-black uppercase text-slate-400">Título na Agenda</span>
                <input
                  value={editing.agendaTitle}
                  onChange={e => setEditing({ ...editing, agendaTitle: e.target.value })}
                  className="border border-slate-200 rounded-2xl px-4 py-3 text-xs font-bold uppercase"
                  placeholder="ETN INST HFC"
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-[10px] font-black uppercase text-slate-400">Cor</span>
                <input
                  type="color"
                  value={editing.color}
                  onChange={e => setEditing({ ...editing, color: e.target.value })}
                  className="border border-slate-200 rounded-2xl px-4 py-2 h-12"
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-[10px] font-black uppercase text-slate-400">Ordem</span>
                <input
                  type="number"
                  value={editing.sortOrder}
                  onChange={e => setEditing({ ...editing, sortOrder: Number(e.target.value) })}
                  className="border border-slate-200 rounded-2xl px-4 py-3 text-xs font-bold"
                />
              </label>

              <label className="flex items-center gap-3 bg-slate-50 rounded-2xl px-4 py-3">
                <input
                  type="checkbox"
                  checked={editing.active}
                  onChange={e => setEditing({ ...editing, active: e.target.checked })}
                />
                <span className="text-[10px] font-black uppercase text-slate-600">Ativo</span>
              </label>

              <label className="flex items-center gap-3 bg-slate-50 rounded-2xl px-4 py-3">
                <input
                  type="checkbox"
                  checked={editing.allowLesson}
                  onChange={e => setEditing({ ...editing, allowLesson: e.target.checked })}
                />
                <span className="text-[10px] font-black uppercase text-slate-600">Possui aula</span>
              </label>

              {editing.allowLesson && (
                <label className="flex flex-col gap-2">
                  <span className="text-[10px] font-black uppercase text-slate-400">Máximo de aulas</span>
                  <input
                    type="number"
                    value={editing.maxLessons}
                    onChange={e => setEditing({ ...editing, maxLessons: Number(e.target.value) })}
                    className="border border-slate-200 rounded-2xl px-4 py-3 text-xs font-bold"
                  />
                </label>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-8">
              <button
                onClick={() => setEditing(null)}
                className="px-5 py-3 rounded-2xl bg-slate-100 text-slate-600 text-[10px] font-black uppercase"
              >
                Cancelar
              </button>

              <button
                onClick={save}
                className="px-5 py-3 rounded-2xl bg-claro-red text-white text-[10px] font-black uppercase shadow-md"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
      {editingEvent && (
  <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4">
    <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-2xl p-8">
      <h3 className="text-lg font-black uppercase text-slate-900 mb-6">
        {editingEvent.id ? 'Editar Evento Operacional' : 'Novo Evento Operacional'}
      </h3>

      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-2">
          <span className="text-[10px] font-black uppercase text-slate-400">Nome</span>
          <input
            value={editingEvent.name}
            onChange={e => setEditingEvent({ ...editingEvent, name: e.target.value })}
            className="border border-slate-200 rounded-2xl px-4 py-3 text-xs font-bold uppercase"
            placeholder="EX: ACOMPANHAMENTO CAMPO"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-[10px] font-black uppercase text-slate-400">Categoria</span>
          <select
            value={editingEvent.category}
            onChange={e => setEditingEvent({ ...editingEvent, category: e.target.value as any })}
            className="border border-slate-200 rounded-2xl px-4 py-3 text-xs font-bold uppercase"
          >
            <option value="BLOCKING">Bloqueante</option>
            <option value="OPERATIONAL">Operacional</option>
            <option value="SUPPORT">Apoio</option>
            <option value="OTHER">Outros</option>
          </select>
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-[10px] font-black uppercase text-slate-400">Cor</span>
          <input
            type="color"
            value={editingEvent.color}
            onChange={e => setEditingEvent({ ...editingEvent, color: e.target.value })}
            className="border border-slate-200 rounded-2xl px-4 py-2 h-12"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-[10px] font-black uppercase text-slate-400">Ordem</span>
          <input
            type="number"
            value={editingEvent.sortOrder}
            onChange={e => setEditingEvent({ ...editingEvent, sortOrder: Number(e.target.value) })}
            className="border border-slate-200 rounded-2xl px-4 py-3 text-xs font-bold"
          />
        </label>

        <label className="flex items-center gap-3 bg-slate-50 rounded-2xl px-4 py-3">
          <input
            type="checkbox"
            checked={editingEvent.active}
            onChange={e => setEditingEvent({ ...editingEvent, active: e.target.checked })}
          />
          <span className="text-[10px] font-black uppercase text-slate-600">Ativo</span>
        </label>
      </div>

      <div className="flex justify-end gap-3 mt-8">
        <button
          onClick={() => setEditingEvent(null)}
          className="px-5 py-3 rounded-2xl bg-slate-100 text-slate-600 text-[10px] font-black uppercase"
        >
          Cancelar
        </button>

        <button
          onClick={saveOperationalEvent}
          className="px-5 py-3 rounded-2xl bg-claro-red text-white text-[10px] font-black uppercase shadow-md"
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

export default AgendaSettings;
