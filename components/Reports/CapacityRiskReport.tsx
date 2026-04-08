import React, { useState, useEffect, useMemo } from 'react';
import { dataService } from '../../services/dataService';
import { UserRole, CertificationProcessStatus, ScheduleStatus } from '../../types';

const CapacityRiskReport: React.FC = () => {
  const [data, setData] = useState<any>(null);

  const technicians = useMemo(() => dataService.getTechnicians(), []);
  const analysts = useMemo(() => dataService.getUsers().filter(u => u.role === UserRole.ANALYST), []);
  const schedules = useMemo(() => dataService.getSchedules(), []);
  const cities = useMemo(() => dataService.getCities(), []);

  const report = useMemo(() => {
    const analystStats = analysts.map(analyst => {
      const metrics = dataService.getAnalystDemandMetrics(analyst.id);
      
      const assignedTechs = technicians.filter(t => {
        const cityConfig = cities.find(c => c.name.toUpperCase() === t.city.toUpperCase());
        return cityConfig?.responsibleAnalystIds.includes(analyst.analystProfileId || '');
      });

      const scheduledCount = schedules.filter(s => s.analystId === analyst.id && s.status === ScheduleStatus.CONFIRMED).length;
      const pendingCount = assignedTechs.filter(t => t.status_principal === 'PENDENTE_CERTIFICAÇÃO').length;
      const backlogCount = assignedTechs.filter(t => t.status_principal === 'BACKLOG AGUARDANDO').length;

      // Risk calculation: based on demand index and backlog
      let risk: 'NORMAL' | 'ATENÇÃO' | 'ALTO RISCO' = 'NORMAL';
      if (metrics.demandIndex > 80 || backlogCount > 10) risk = 'ALTO RISCO';
      else if (metrics.demandIndex > 50 || backlogCount > 5) risk = 'ATENÇÃO';

      return {
        id: analyst.id,
        name: analyst.fullName,
        total: assignedTechs.length,
        scheduled: scheduledCount,
        pending: pendingCount,
        backlog: backlogCount,
        demandIndex: metrics.demandIndex,
        risk
      };
    });

    const summary = {
      totalAnalysts: analysts.length,
      totalScheduled: schedules.filter(s => s.status === ScheduleStatus.CONFIRMED).length,
      totalBacklog: technicians.filter(t => t.status_principal === 'BACKLOG AGUARDANDO').length,
      highRiskCount: analystStats.filter(a => a.risk === 'ALTO RISCO').length
    };

    return { analystStats, summary };
  }, [technicians, analysts, schedules, cities]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { label: 'Total Analistas', value: report.summary.totalAnalysts, color: 'slate' },
          { label: 'Agendamentos Ativos', value: report.summary.totalScheduled, color: 'blue' },
          { label: 'Técnicos em Backlog', value: report.summary.totalBacklog, color: 'claro-red' },
          { label: 'Analistas em Alto Risco', value: report.summary.highRiskCount, color: report.summary.highRiskCount > 0 ? 'rose' : 'emerald' },
        ].map((kpi, idx) => (
          <div key={idx} className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{kpi.label}</p>
            <p className={`text-3xl font-black ${kpi.color === 'claro-red' ? 'text-claro-red' : `text-${kpi.color}-600`}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-[40px] shadow-sm overflow-hidden">
        <div className="p-8 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">Ranking de Pressão e Carga por Analista</h3>
          <span className="text-[9px] font-black text-slate-400 uppercase">Visão em Tempo Real</span>
        </div>
        <table className="w-full text-left text-[10px] uppercase">
          <thead className="bg-slate-50 font-black text-slate-400">
            <tr>
              <th className="px-8 py-4">Analista</th>
              <th className="px-8 py-4 text-center">Total Atribuído</th>
              <th className="px-8 py-4 text-center">Agendados</th>
              <th className="px-8 py-4 text-center">Pendentes</th>
              <th className="px-8 py-4 text-center">Backlog</th>
              <th className="px-8 py-4 text-center">Índice Demanda</th>
              <th className="px-8 py-4 text-right">Status de Risco</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-bold text-slate-600">
            {report.analystStats.sort((a, b) => b.demandIndex - a.demandIndex).map((a: any) => (
              <tr key={a.id} className="hover:bg-slate-50/50 transition-all">
                <td className="px-8 py-5 font-black text-slate-900">{a.name}</td>
                <td className="px-8 py-5 text-center">{a.total}</td>
                <td className="px-8 py-5 text-center text-blue-600">{a.scheduled}</td>
                <td className="px-8 py-5 text-center text-amber-600">{a.pending}</td>
                <td className="px-8 py-5 text-center text-claro-red">{a.backlog}</td>
                <td className="px-8 py-5 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full ${a.risk === 'ALTO RISCO' ? 'bg-claro-red' : a.risk === 'ATENÇÃO' ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(a.demandIndex, 100)}%` }}></div>
                    </div>
                    <span className="font-black">{a.demandIndex.toFixed(0)}</span>
                  </div>
                </td>
                <td className="px-8 py-5 text-right">
                  <span className={`px-3 py-1 rounded-full text-[8px] font-black ${
                    a.risk === 'ALTO RISCO' ? 'bg-claro-red text-white' : 
                    a.risk === 'ATENÇÃO' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {a.risk}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CapacityRiskReport;
