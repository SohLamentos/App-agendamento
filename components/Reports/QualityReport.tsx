import React, { useState, useEffect, useMemo } from 'react';
import { dataService } from '../../services/dataService';
import { mockCities } from '../../services/mockData';
import ReportFilters from './ReportFilters';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';
import { CertificationProcessStatus, ParticipationStatus, Technician } from '../../types';

const QualityReport: React.FC = () => {
  const [filters, setFilters] = useState({ 
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
    partner: '', city: '', state: ''
  });

  const technicians = useMemo(() => dataService.getTechnicians(), []);
  const schedules = useMemo(() => dataService.getSchedules(), []);
  const cities = useMemo(() => dataService.getCities(), []);

  const partners = useMemo(() => {
    const p = new Set(technicians.map(t => t.company));
    return Array.from(p).filter(Boolean).sort();
  }, [technicians]);

  const report = useMemo(() => {
    const filtered = technicians.filter(t => {
      const partnerMatch = !filters.partner || t.company === filters.partner;
      const cityMatch = !filters.city || t.city === filters.city;
      const stateMatch = !filters.state || t.state === filters.state;
      return partnerMatch && cityMatch && stateMatch;
    });

    const inconsistencies: any[] = [];

    filtered.forEach(t => {
      // 1. AGENDADOS sem data válida
      if (t.status_principal === 'AGENDADOS' && !t.scheduledCertificationId) {
        inconsistencies.push({ id: t.id, name: t.name, cpf: t.cpf, type: 'AGENDADO SEM ID', detail: 'Status AGENDADO mas sem ID de agendamento' });
      } else if (t.status_principal === 'AGENDADOS' && t.scheduledCertificationId) {
        const sch = schedules.find(s => s.id === t.scheduledCertificationId);
        if (!sch) inconsistencies.push({ id: t.id, name: t.name, cpf: t.cpf, type: 'AGENDADO SEM OBJETO', detail: 'Agendamento não localizado na base de horários' });
      }

      // 2. Registros sem analista quando necessário (Agendados)
      if (t.status_principal === 'AGENDADOS' && t.scheduledCertificationId) {
        const sch = schedules.find(s => s.id === t.scheduledCertificationId);
        if (sch && !sch.analystId) inconsistencies.push({ id: t.id, name: t.name, cpf: t.cpf, type: 'SEM ANALISTA', detail: 'Agendamento sem analista vinculado' });
      }

      // 3. Registros sem tecnologia
      if (!t.technology) {
        inconsistencies.push({ id: t.id, name: t.name, cpf: t.cpf, type: 'SEM TECNOLOGIA', detail: 'Campo tecnologia (GPON/HFC) não preenchido' });
      }

      // 4. Registros sem tipo
      if (!t.certificationType) {
        inconsistencies.push({ id: t.id, name: t.name, cpf: t.cpf, type: 'SEM TIPO', detail: 'Tipo de certificação (Presencial/Virtual) ausente' });
      }

      // 5. Cidade/UF inconsistente
      const cityMatch = mockCities.find(mc => mc.name.toUpperCase() === t.city.toUpperCase());
      if (cityMatch && cityMatch.uf !== t.state) {
        inconsistencies.push({ id: t.id, name: t.name, cpf: t.cpf, type: 'UF INCONSISTENTE', detail: `Cidade ${t.city} pertence a ${cityMatch.uf}, mas está como ${t.state}` });
      }

      // 6. CPF ausente ou inconsistente
      if (!t.cpf || t.cpf.length < 11) {
        inconsistencies.push({ id: t.id, name: t.name, cpf: t.cpf, type: 'CPF INVÁLIDO', detail: 'CPF ausente ou com formato incorreto' });
      }

      // 7. Presencial incompatível com cidade/base e analista responsável
      if (t.certificationType === 'PRESENCIAL') {
        const cityConfig = cities.find(c => c.name.toUpperCase() === t.city.toUpperCase());
        if (t.status_principal === 'AGENDADOS' && t.scheduledCertificationId) {
          const sch = schedules.find(s => s.id === t.scheduledCertificationId);
          if (sch && cityConfig && !cityConfig.responsibleAnalystIds.includes(sch.analystId)) {
             // Note: In some cases this might be intentional (forced), but it's a quality flag
             inconsistencies.push({ id: t.id, name: t.name, cpf: t.cpf, type: 'ANALISTA NÃO RESPONSÁVEL', detail: `Analista agendado não é responsável pela cidade ${t.city}` });
          }
        }
      }
    });

    // 8. Duplicidades relevantes
    const cpfMap = new Map();
    filtered.forEach(t => {
      if (t.cpf) {
        const existing = cpfMap.get(t.cpf) || [];
        existing.push(t);
        cpfMap.set(t.cpf, existing);
      }
    });
    cpfMap.forEach((techs, cpf) => {
      if (techs.length > 1) {
        techs.forEach((t: any) => {
          inconsistencies.push({ id: t.id, name: t.name, cpf: t.cpf, type: 'DUPLICIDADE', detail: `CPF duplicado no sistema (${techs.length} ocorrências)` });
        });
      }
    });

    const kpis = {
      total: filtered.length,
      inconsistencies: inconsistencies.length,
      conformityPct: filtered.length > 0 ? ((filtered.length - new Set(inconsistencies.map(i => i.id)).size) / filtered.length) * 100 : 100,
      noShow: filtered.filter(t => t.participationStatus === ParticipationStatus.NO_SHOW).length,
      reprovedEad: filtered.filter(t => t.certificationProcessStatus === CertificationProcessStatus.NOT_QUALIFIED_EAD).length,
      reprovedVirtual: filtered.filter(t => t.certificationProcessStatus === CertificationProcessStatus.CERTIFIED_REPROVED_1 || t.certificationProcessStatus === CertificationProcessStatus.CERTIFIED_REPROVED_2).length,
    };

    const typeStats = Object.entries(
      inconsistencies.reduce((acc: any, curr) => {
        acc[curr.type] = (acc[curr.type] || 0) + 1;
        return acc;
      }, {})
    ).map(([name, value]) => ({ name, value }));

    return { kpis, inconsistencies, typeStats };
  }, [technicians, schedules, cities, filters]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <ReportFilters filters={filters} setFilters={setFilters} partners={partners} />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { label: 'Total Inconsistências', value: report.kpis.inconsistencies, color: 'claro-red' },
          { label: 'Índice de Conformidade', value: report.kpis.conformityPct.toFixed(1) + '%', color: report.kpis.conformityPct > 90 ? 'emerald' : 'amber' },
          { label: 'No-Show Acumulado', value: report.kpis.noShow, color: 'rose' },
          { label: 'Reprovações (EAD/Cert)', value: report.kpis.reprovedEad + report.kpis.reprovedVirtual, color: 'amber' },
        ].map((kpi, idx) => (
          <div key={idx} className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{kpi.label}</p>
            <p className={`text-3xl font-black ${kpi.color === 'claro-red' ? 'text-claro-red' : `text-${kpi.color}-600`}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm h-[400px] flex flex-col">
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-6">Tipos de Inconsistência</h3>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={report.typeStats} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value">
                {report.typeStats.map((entry: any, index: number) => <Cell key={`cell-${index}`} fill={['#9B0000', '#f59e0b', '#3b82f6', '#8b5cf6', '#64748b'][index % 5]} />)}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: '8px', fontWeight: 'bold', textTransform: 'uppercase' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-[40px] shadow-sm overflow-hidden flex flex-col h-[400px]">
          <div className="p-6 border-b border-slate-100">
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">Registros com Inconformidade</h3>
          </div>
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left text-[10px] uppercase">
              <thead className="bg-slate-50 font-black text-slate-400 sticky top-0">
                <tr>
                  <th className="px-6 py-3">Técnico</th>
                  <th className="px-6 py-3">Tipo</th>
                  <th className="px-6 py-3">Detalhe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-bold text-slate-600">
                {report.inconsistencies.slice(0, 50).map((inc, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50">
                    <td className="px-6 py-3 font-black text-slate-900">{inc.name}</td>
                    <td className="px-6 py-3">
                      <span className="px-2 py-0.5 bg-claro-red/10 text-claro-red rounded-full">{inc.type}</span>
                    </td>
                    <td className="px-6 py-3 text-slate-400">{inc.detail}</td>
                  </tr>
                ))}
                {report.inconsistencies.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-6 py-10 text-center font-black text-emerald-600 uppercase">Nenhuma inconsistência localizada</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QualityReport;
