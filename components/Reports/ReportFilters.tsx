
import React from 'react';

interface ReportFiltersProps {
  filters: any;
  setFilters: (f: any) => void;
  partners: string[];
}

const ReportFilters: React.FC<ReportFiltersProps> = ({ filters, setFilters, partners }) => {
  return (
    <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm flex flex-wrap gap-4 items-end mb-8 animate-in slide-in-from-top-4 duration-500">
      <div className="flex flex-col gap-1.5">
        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Data Inicial</label>
        <input 
          type="date" 
          className="bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2 text-xs font-black uppercase outline-none focus:border-claro-red" 
          value={filters.start} 
          onChange={e => setFilters({...filters, start: e.target.value})} 
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Data Final</label>
        <input 
          type="date" 
          className="bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2 text-xs font-black uppercase outline-none focus:border-claro-red" 
          value={filters.end} 
          onChange={e => setFilters({...filters, end: e.target.value})} 
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Parceira</label>
        <select 
          className="bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2 text-xs font-black uppercase outline-none focus:border-claro-red" 
          value={filters.partner} 
          onChange={e => setFilters({...filters, partner: e.target.value})}
        >
          <option value="">TODAS</option>
          {partners.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Cidade</label>
        <input 
          type="text" 
          placeholder="EX: GOIANIA"
          className="bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2 text-xs font-black uppercase outline-none focus:border-claro-red" 
          value={filters.city} 
          onChange={e => setFilters({...filters, city: e.target.value})} 
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">UF</label>
        <input 
          type="text" 
          maxLength={2}
          placeholder="GO"
          className="bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2 text-xs font-black uppercase outline-none focus:border-claro-red w-16" 
          value={filters.state} 
          onChange={e => setFilters({...filters, state: e.target.value})} 
        />
      </div>
      <button 
        onClick={() => window.dispatchEvent(new Event('data-updated'))}
        className="bg-slate-900 text-white px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-claro-red transition-all"
      >
        Atualizar
      </button>
    </div>
  );
};

export default ReportFilters;
