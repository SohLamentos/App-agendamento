
import React, { useState, useEffect, useMemo } from 'react';
import { dataService } from '../../services/dataService';
import ReportFilters from './ReportFilters';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

const OperationalDashboard: React.FC = () => {
  const [filters, setFilters] = useState({ 
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
    partner: '', city: '', state: ''
  });
  const [report, setReport] = useState<any>(null);

  const partners = useMemo(() => {
    const p = new Set(dataService.getTechnicians().map(t => t.company));
    return Array.from(p).filter(Boolean).sort();
  }, []);

  const loadData = () => setReport(dataService.getOperationalReport(filters));

  useEffect(() => {
    loadData();
    window.addEventListener('data-updated', loadData);
    return () => window.removeEventListener('data-updated', loadData);
  }, [filters]);

  if (!report) return null;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <ReportFilters filters={filters} setFilters={setFilters} partners={partners} />

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        {[
          { label: 'Solicitadas', value: report.kpis.requested, color: 'slate' },
          { label: 'Realizadas', value: report.kpis.realized, color: 'emerald' },
          { label: 'No-Show', value: report.kpis.noShow, color: 'rose' },
          { label: 'Reprov. EAD', value: report.kpis.reprovedEad, color: 'amber' },
          { label: 'Reprov. Virt.', value: report.kpis.reprovedVirtual, color: 'claro-red' },
          { label: 'Reprov. Pres.', value: report.kpis.reprovedPresential, color: 'claro-red' },
          { label: 'Pendentes', value: report.kpis.pending, color: 'blue' },
        ].map((kpi, idx) => (
          <div key={idx} className="bg-white p-5 rounded-[24px] border border-slate-200 shadow-sm">
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">{kpi.label}</p>
            <p className={`text-xl font-black ${kpi.color === 'claro-red' ? 'text-claro-red' : `text-${kpi.color}-600`}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm h-[400px]">
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-6">Tendência Semanal de Solicitações</h3>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={report.rankings.partners}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 8, fill: '#94a3b8', fontWeight: 'bold' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 8, fill: '#94a3b8', fontWeight: 'bold' }} />
              <Tooltip cursor={{ fill: '#f8fafc' }} />
              <Bar dataKey="count" fill="#9B0000" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[400px]">
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-6">Ranking por Parceira</h3>
          <div className="flex-1 overflow-y-auto pr-2 space-y-4">
            {report.rankings.partners.map((p: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-black text-slate-300 w-4">{idx + 1}</span>
                  <span className="text-[10px] font-bold text-slate-700 uppercase truncate max-w-[150px]">{p.name}</span>
                </div>
                <span className="text-[10px] font-black text-slate-900">{p.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[350px]">
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-6">Cidades com Maior Demanda</h3>
          <div className="flex-1 overflow-y-auto pr-2 space-y-3">
            {report.rankings.cities.map((c: any, idx: number) => (
              <div key={idx} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl">
                <span className="text-[10px] font-black text-slate-900 uppercase">{c.name}</span>
                <span className="text-[10px] font-black text-claro-red">{c.count} SOLIC.</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[350px]">
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-6">Demandas por Estado (UF)</h3>
          <div className="flex-1 overflow-y-auto pr-2 space-y-3">
            {report.rankings.states.map((s: any, idx: number) => (
              <div key={idx} className="flex justify-between items-center p-3 border-b border-slate-50">
                <span className="text-[10px] font-black text-slate-700 uppercase">{s.name}</span>
                <span className="text-[10px] font-black text-slate-900">{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OperationalDashboard;
