import React from 'react';
import { User } from '../types';

interface AgendaSettingsProps {
  user: User;
}

const AgendaSettings: React.FC<AgendaSettingsProps> = ({ user }) => {
  return (
    <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm p-8">
      <div className="mb-8">
        <h2 className="text-xl font-black uppercase tracking-tight text-slate-900">
          Configurações da Agenda
        </h2>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-2">
          Gerencie listas usadas nos modais da agenda operacional
        </p>
      </div>

      <div className="flex gap-3 mb-8">
        <button className="bg-claro-red text-white px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-md">
          Treinamentos ETN
        </button>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-[28px] p-6">
        <h3 className="text-sm font-black uppercase text-slate-900">
          Treinamentos ETN
        </h3>

        <p className="text-[10px] font-bold uppercase text-slate-400 mt-2">
          Aqui o gestor/admin poderá cadastrar, editar, ativar ou inativar os treinamentos que aparecem no modal da Agenda.
        </p>

        <div className="mt-6 rounded-2xl bg-white border border-slate-200 p-5 text-[11px] font-bold text-slate-500 uppercase">
          Próximo passo: conectar esta tela à lista dinâmica de treinamentos.
        </div>
      </div>
    </div>
  );
};

export default AgendaSettings;
