
import React, { useState, useEffect, useMemo } from 'react';
import { dataService } from '../../services/dataService';
import ReportFilters from './ReportFilters';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const QualityReport: React.FC = () => {
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

  const loadData = () => setReport(dataService.getQualityReport(filters));

  useEffect(() => {
    loadData();
    window.addEventListener('data-updated', loadData);
    return () => window.removeEventListener('data-updated', loadData);
  }, [filters]);

  if (!report) return null;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <ReportFilters filters={filters} setFilters={setFilters} partners={partners} />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { label: '% No-Show', value: report.kpis.noShowPct.toFixed(1) + '%', color: 'rose' },
          { label: '% Reprov. EAD', value: report.kpis.reprovedEadPct.toFixed(1) + '%', color: 'amber' },
          { label: '% Reprov. Virtual', value: report.kpis.reprovedVirtualPct.toFixed(1) + '%', color: 'claro-red' },
          { label: '% Reprov. Presencial', value: report.kpis.reprovedPresentialPct.toFixed(1) + '%', color: 'claro-red' },
        ].map((kpi, idx) => (
          <div key={idx} className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{kpi.label}</p>
            <p className={`text-3xl font-black ${kpi.color === 'claro-red' ? 'text-claro-red' : `text-${kpi.color}-600`}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white p-10 rounded-[40px] border border-slate-200 shadow-sm">
        <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-8">Risco por Parceira (Volume de Falhas)</h3>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart layout="vertical" data={[
              { name: 'No-Show', value: report.kpis.noShowPct, fill: '#e11d48' },
              { name: 'Reprov. EAD', value: report.kpis.reprovedEadPct, fill: '#f59e0b' },
              { name: 'Reprov. Virtual', value: report.kpis.reprovedVirtualPct, fill: '#9B0000' },
              { name: 'Reprov. Presencial', value: report.kpis.reprovedPresentialPct, fill: '#CC0000' },
            ]}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
              <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 8, fill: '#94a3b8', fontWeight: 'bold' }} />
              <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 8, fill: '#94a3b8', fontWeight: 'bold' }} />
              <Tooltip cursor={{ fill: '#f8fafc' }} />
              <Bar dataKey="value" radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default QualityReport;
