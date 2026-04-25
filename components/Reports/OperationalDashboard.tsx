import React, { useState, useEffect, useMemo } from 'react';
import { dataService } from '../../services/dataService';
import ReportFilters from './ReportFilters';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend, LineChart, Line 
} from 'recharts';
import { CertificationProcessStatus } from '../../types';

const COLORS = ['#9B0000', '#10b981', '#f59e0b', '#3b82f6', '#8b5cf6', '#64748b', '#ec4899', '#06b6d4'];

const OperationalDashboard: React.FC = () => {
  const [filters, setFilters] = useState({ 
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
    partner: '', city: '', state: ''
  });

  const technicians = useMemo(() => dataService.getTechnicians(), []);
  const trainingClasses = useMemo(() => dataService.getTrainingClasses(), []);

  const partners = useMemo(() => {
    const p = new Set(technicians.map(t => t.company));
    return Array.from(p).filter(Boolean).sort();
  }, [technicians]);

  const report = useMemo(() => {
    const filtered = technicians.filter(t => {
      const dateMatch = !filters.start || !filters.end || (t.status_updated_at && t.status_updated_at >= filters.start && t.status_updated_at <= filters.end);
      const partnerMatch = !filters.partner || t.company === filters.partner;
      const cityMatch = !filters.city || t.city === filters.city;
      const stateMatch = !filters.state || t.state === filters.state;
      return dateMatch && partnerMatch && cityMatch && stateMatch;
    });

    const kpis = {
      total: filtered.length,
      scheduled: filtered.filter(t => t.status_principal === 'AGENDADOS').length,
      approved: filtered.filter(t => t.status_principal === 'APROVADOS').length,
      pending: filtered.filter(t => t.status_principal === 'PENDENTE_CERTIFICAÇÃO' || t.certificationProcessStatus === CertificationProcessStatus.QUALIFIED_AWAITING).length,
      backlog: filtered.filter(t => t.status_principal === 'BACKLOG AGUARDANDO').length,
      reproved: filtered.filter(t => t.status_principal === 'REPROVADOS' || t.certificationProcessStatus.includes('REPROVADO')).length,
      cancelled: filtered.filter(t => t.status_principal?.includes('CANCELADO')).length,
    };

    // Distributions
    const statusDist = Object.entries(
      filtered.reduce((acc: any, t) => {
        const s = t.status_principal || 'OUTROS';
        acc[s] = (acc[s] || 0) + 1;
        return acc;
      }, {})
    ).map(([name, value]) => ({ name, value }));

    const techDist = Object.entries(
      filtered.reduce((acc: any, t) => {
        const tech = t.technology || 'N/A';
        acc[tech] = (acc[tech] || 0) + 1;
        return acc;
      }, {})
    ).map(([name, value]) => ({ name, value }));

    const typeDist = Object.entries(
      filtered.reduce((acc: any, t) => {
        const type = t.certificationType || 'N/A';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {})
    ).map(([name, value]) => ({ name, value }));

    const classDist = Object.entries(
      filtered.reduce((acc: any, t) => {
        const classObj = trainingClasses.find(c => c.id === t.trainingClassId);
        const name = classObj ? classObj.classNumber : 'S/ TURMA';
        acc[name] = (acc[name] || 0) + 1;
        return acc;
      }, {})
    ).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10);

    const ufDist = Object.entries(
      filtered.reduce((acc: any, t) => {
        const uf = t.state || 'N/A';
        acc[uf] = (acc[uf] || 0) + 1;
        return acc;
      }, {})
    ).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

    const timelineData = Object.entries(
      filtered.reduce((acc: any, t) => {
        if (t.status_updated_at) {
          const date = t.status_updated_at.split('T')[0];
          acc[date] = (acc[date] || 0) + 1;
        }
        return acc;
      }, {})
    ).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));

    return { kpis, statusDist, techDist, typeDist, classDist, ufDist, timelineData };
  }, [technicians, trainingClasses, filters]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <ReportFilters filters={filters} setFilters={setFilters} partners={partners} />

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
        {[
          { label: 'Total Técnicos', value: report.kpis.total, color: 'slate' },
          { label: 'Agendados', value: report.kpis.scheduled, color: 'blue' },
          { label: 'Aprovados', value: report.kpis.approved, color: 'emerald' },
          { label: 'Pendentes', value: report.kpis.pending, color: 'amber' },
          { label: 'Backlog', value: report.kpis.backlog, color: 'indigo' },
          { label: 'Reprovados', value: report.kpis.reproved, color: 'claro-red' },
          { label: 'Cancelados', value: report.kpis.cancelled, color: 'rose' },
          { label: 'Certificados', value: report.kpis.approved, color: 'emerald' },
        ].map((kpi, idx) => (
          <div key={idx} className="bg-white p-5 rounded-[24px] border border-slate-200 shadow-sm">
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">{kpi.label}</p>
            <p className={`text-xl font-black ${kpi.color === 'claro-red' ? 'text-claro-red' : `text-${kpi.color}-600`}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm h-[400px] flex flex-col">
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-6">Distribuição por Status</h3>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={report.statusDist} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value">
                {report.statusDist.map((entry: any, index: number) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: '8px', fontWeight: 'bold', textTransform: 'uppercase' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="lg:col-span-2 bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm h-[400px]">
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-6">Evolução de Atualizações</h3>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={report.timelineData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 8, fill: '#94a3b8', fontWeight: 'bold' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 8, fill: '#94a3b8', fontWeight: 'bold' }} />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#9B0000" strokeWidth={3} dot={{ r: 4, fill: '#9B0000' }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm h-[350px] flex flex-col">
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-6">Tecnologia (GPON/HFC)</h3>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={report.techDist} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={5} dataKey="value">
                {report.techDist.map((entry: any, index: number) => <Cell key={`cell-${index}`} fill={index === 0 ? '#9B0000' : '#1e293b'} />)}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: '8px', fontWeight: 'bold', textTransform: 'uppercase' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm h-[350px] flex flex-col">
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-6">Tipo (Virtual/Presencial)</h3>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={report.typeDist} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={5} dataKey="value">
                {report.typeDist.map((entry: any, index: number) => <Cell key={`cell-${index}`} fill={index === 0 ? '#10b981' : '#6366f1'} />)}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: '8px', fontWeight: 'bold', textTransform: 'uppercase' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[350px]">
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-6">Top 10 Turmas</h3>
          <div className="flex-1 overflow-y-auto pr-2 space-y-3">
            {report.classDist.map((c: any, idx: number) => (
              <div key={idx} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl">
                <span className="text-[10px] font-black text-slate-900 uppercase">{c.name}</span>
                <span className="text-[10px] font-black text-claro-red">{c.count} TÉCS.</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm">
        <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-6">Distribuição por UF</h3>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={report.ufDist}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 8, fill: '#94a3b8', fontWeight: 'bold' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 8, fill: '#94a3b8', fontWeight: 'bold' }} />
              <Tooltip cursor={{ fill: '#f8fafc' }} />
              <Bar dataKey="count" fill="#9B0000" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default OperationalDashboard;
