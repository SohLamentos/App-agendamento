import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend
} from 'recharts';
import { dataService } from '../services/dataService';
import { User } from '../types';

interface ReportsProps {
  user: User;
  type: 'capacity' | 'performance';
}

const Reports: React.FC<ReportsProps> = ({ user, type }) => {
  const getLocalDateString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [startDate, setStartDate] = useState(() => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.setDate(diff));
    return getLocalDateString(monday);
  });

  const [endDate, setEndDate] = useState(() => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -2 : 5);
    const friday = new Date(now.setDate(diff));
    return getLocalDateString(friday);
  });

  const [reportData, setReportData] = useState<any[]>([]);

  useEffect(() => {
    const load = () => {
      const data = dataService.getDetailedIdleAnalysis(startDate, endDate);
      setReportData(data);
    };

    load();
    window.addEventListener('data-updated', load);
    return () => window.removeEventListener('data-updated', load);
  }, [startDate, endDate]);

  const handleExportExcel = () => {
    try {
      const schedules = (dataService as any).getSchedules?.() || [];
      const technicians = (dataService as any).getTechnicians?.() || [];
      const users = (dataService as any).getUsers?.() || [];

      const filteredSchedules = schedules.filter((s: any) => {
        if (!s?.datetime) return false;
        const dateOnly = String(s.datetime).split('T')[0];
        return dateOnly >= startDate && dateOnly <= endDate;
      });

      if (!filteredSchedules.length) {
        alert('Não há agendamentos no período selecionado para exportar.');
        return;
      }

      const getProvaUnificada = (shift: string) => {
        if (!shift) return 'N/D';
        const s = String(shift).toUpperCase();
        if (s.includes('MORNING') || s.includes('MANHA')) return '08:30';
        if (s.includes('AFTERNOON') || s.includes('TARDE')) return '13:30';
        return 'N/D';
      };

      const getCertificationTime = (schedule: any, typeValue: string, position: number) => {
        const isPresential = String(typeValue || '').toUpperCase().includes('PRES');

        if (isPresential) {
          if (position === 1) return schedule.shift?.toUpperCase().includes('MORNING') || schedule.shift?.toUpperCase().includes('MANHA') ? '09:00' : '14:00';
          if (position === 2) return schedule.shift?.toUpperCase().includes('MORNING') || schedule.shift?.toUpperCase().includes('MANHA') ? '10:00' : '15:00';
          if (position === 3) return schedule.shift?.toUpperCase().includes('MORNING') || schedule.shift?.toUpperCase().includes('MANHA') ? '11:00' : '16:00';
          return 'N/D';
        }

        if (position === 1) return schedule.shift?.toUpperCase().includes('MORNING') || schedule.shift?.toUpperCase().includes('MANHA') ? '09:30' : '14:30';
        if (position === 2) return schedule.shift?.toUpperCase().includes('MORNING') || schedule.shift?.toUpperCase().includes('MANHA') ? '10:30' : '15:30';

        return 'N/D';
      };

      const groupedPositionKey: Record<string, number> = {};
      const baseData = filteredSchedules
        .slice()
        .sort((a: any, b: any) => {
          const dateDiff = new Date(a?.datetime ?? '').getTime() - new Date(b?.datetime ?? '').getTime();
          if (dateDiff !== 0) return dateDiff;
          return String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
        })
        .map((s: any) => {
          const tech = technicians.find((t: any) => {
            const scheduleId = String(s?.id ?? '');
            const technicianId = String(
              s?.technicianId ??
              s?.techId ??
              s?.userId ??
              s?.technician?.id ??
              ''
            );

            const scheduleCpf = String(
              s?.cpf ??
              s?.technicianCpf ??
              s?.user?.cpf ??
              s?.technician?.cpf ??
              ''
            ).replace(/\D/g, '');

            const scheduleUniqueKey = String(
              s?.unique_key ??
              s?.uniqueKey ??
              s?.technicianUniqueKey ??
              s?.technician?.unique_key ??
              s?.technician?.uniqueKey ??
              ''
            );

            const tId = String(t?.id ?? '');
            const scheduledCertificationId = String(t?.scheduledCertificationId ?? '');
            const certificationScheduleId = String(t?.certificationScheduleId ?? '');
            const currentScheduleId = String(t?.scheduleId ?? '');
            const currentTechId = String(t?.technicianId ?? '');
            const techCpf = String(t?.cpf ?? '').replace(/\D/g, '');
            const techUniqueKey = String(t?.unique_key ?? t?.uniqueKey ?? '');

            return (
              (scheduleId && scheduledCertificationId === scheduleId) ||
              (scheduleId && certificationScheduleId === scheduleId) ||
              (scheduleId && currentScheduleId === scheduleId) ||
              (technicianId && tId === technicianId) ||
              (technicianId && currentTechId === technicianId) ||
              (scheduleCpf && techCpf === scheduleCpf) ||
              (scheduleUniqueKey && techUniqueKey === scheduleUniqueKey)
            );
          });

          const analyst = users.find((u: any) => String(u.id) === String(s.analystId));
          const analystName =
            analyst?.fullName ||
            analyst?.name ||
            s?.analystName ||
            s?.analystId ||
            'SEM ANALISTA';

          const technicianName =
            tech?.name ||
            tech?.fullName ||
            s?.technicianName ||
            s?.techName ||
            s?.name ||
            s?.user?.name ||
            s?.technician?.name ||
            'N/D';

          const company =
            tech?.company ||
            s?.company ||
            s?.technician?.company ||
            'N/D';

          const city =
            tech?.city ||
            s?.city ||
            s?.user?.city ||
            s?.technician?.city ||
            'N/D';

          const state =
            tech?.state ||
            s?.state ||
            s?.user?.state ||
            s?.technician?.state ||
            '';

          const cityState = `${city}${state ? ' / ' + state : ''}`;

          const dateObj = s?.datetime ? new Date(s.datetime) : null;
          const dateLabel = dateObj ? dateObj.toLocaleDateString('pt-BR') : 'N/D';

          const shiftValue = String(s?.shift ?? '').toUpperCase();
          const typeValue =
            String(s?.type ?? '').toUpperCase().includes('PRES')
              ? 'PRESENCIAL'
              : 'VIRTUAL';

          const key = [
            String(s?.analystId ?? ''),
            String(s?.datetime ?? '').split('T')[0],
            shiftValue,
            typeValue,
            String(s?.technology ?? '')
          ].join('|');

          groupedPositionKey[key] = (groupedPositionKey[key] || 0) + 1;
          const position = groupedPositionKey[key];

          const horarioCertificacao = getCertificationTime(s, typeValue, position);
          const provaUnificada = getProvaUnificada(s.shift);

          return {
            Analista: analystName,
            Data: dateLabel,
            DataISO: String(s?.datetime ?? '').split('T')[0],
            Número: position,
            Turma:
              s?.title ||
              s?.trainingName ||
              s?.className ||
              s?.technology ||
              'N/D',
            Técnico: technicianName,
            Empresa: company,
            Cidade: cityState,
            Tipo: typeValue,
            Tecnologia: s?.technology || 'N/D',
            'Horário Certificação': horarioCertificacao,
            'Prova Unificada': provaUnificada,
            Turno: s?.shift || 'N/D',
            Datetime: s?.datetime || ''
          };
        });

      const byAnalyst = baseData
        .slice()
        .sort((a, b) => {
          const analystDiff = String(a.Analista).localeCompare(String(b.Analista));
          if (analystDiff !== 0) return analystDiff;
          return String(a.Datetime).localeCompare(String(b.Datetime));
        })
        .map(({ DataISO, Datetime, ...rest }) => rest);

      const byDate = baseData
        .slice()
        .sort((a, b) => String(a.Datetime).localeCompare(String(b.Datetime)))
        .map(({ DataISO, Datetime, ...rest }) => rest);

      const byDayRows: any[] = [];
      const groupedByDay: Record<string, any[]> = {};

      baseData.forEach((row) => {
        if (!groupedByDay[row.Data]) groupedByDay[row.Data] = [];
        groupedByDay[row.Data].push(row);
      });

      Object.keys(groupedByDay)
        .sort((a, b) => {
          const [da, ma, ya] = a.split('/').map(Number);
          const [db, mb, yb] = b.split('/').map(Number);
          return new Date(ya, ma - 1, da).getTime() - new Date(yb, mb - 1, db).getTime();
        })
        .forEach((date) => {
          byDayRows.push({
            'Horário Certificação': `DATA: ${date}`,
            'Prova Unificada': '',
            Analista: '',
            Técnico: '',
            Empresa: '',
            Cidade: '',
            Tipo: ''
          });

          groupedByDay[date]
            .sort((a, b) => String(a.Datetime).localeCompare(String(b.Datetime)))
            .forEach((row) => {
              byDayRows.push({
                'Horário Certificação': row['Horário Certificação'],
                'Prova Unificada': row['Prova Unificada'],
                Analista: row.Analista,
                Técnico: row.Técnico,
                Empresa: row.Empresa,
                Cidade: row.Cidade,
                Tipo: row.Tipo
              });
            });
        });

      const wsAnalyst = XLSX.utils.json_to_sheet(byAnalyst);
      const wsDate = XLSX.utils.json_to_sheet(byDate);
      const wsDay = XLSX.utils.json_to_sheet(byDayRows);

      wsAnalyst['!cols'] = [
        { wch: 24 },
        { wch: 12 },
        { wch: 10 },
        { wch: 34 },
        { wch: 34 },
        { wch: 18 },
        { wch: 22 },
        { wch: 14 },
        { wch: 12 },
        { wch: 18 }
      ];

      wsDate['!cols'] = [
        { wch: 24 },
        { wch: 12 },
        { wch: 10 },
        { wch: 34 },
        { wch: 34 },
        { wch: 18 },
        { wch: 22 },
        { wch: 14 },
        { wch: 12 },
        { wch: 18 }
      ];

      wsDay['!cols'] = [
        { wch: 18 },
        { wch: 18 },
        { wch: 24 },
        { wch: 34 },
        { wch: 18 },
        { wch: 22 },
        { wch: 14 }
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, wsAnalyst, 'Por Analista');
      XLSX.utils.book_append_sheet(wb, wsDate, 'Por Data');
      XLSX.utils.book_append_sheet(wb, wsDay, 'Operacional');

      XLSX.writeFile(wb, `Agendados_${startDate}_${endDate}.xlsx`);
    } catch (error) {
      console.error('Erro ao exportar Excel:', error);
      alert('Erro ao exportar Excel.');
    }
  };

  const renderCapacityView = () => {
    const totals = reportData.reduce((acc, curr) => ({
      productive: acc.productive + curr.productiveHours,
      training: acc.training + curr.trainingHours,
      cert: acc.cert + curr.internalCertHours,
      off: acc.off + curr.offHours,
      empty: acc.empty + curr.emptyHours,
    }), { productive: 0, training: 0, cert: 0, off: 0, empty: 0 });

    const pieData = [
      { name: 'Produtividade (Certs)', value: totals.productive, fill: '#10b981' },
      { name: 'Treinamento', value: totals.training, fill: '#6366f1' },
      { name: 'Cert. Própria', value: totals.cert, fill: '#f59e0b' },
      { name: 'Folgas/Férias', value: totals.off, fill: '#94a3b8' },
      { name: 'Slots Vazios (Ociosos)', value: totals.empty, fill: '#9B0000' },
    ];

    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ociosidade Média G3</p>
            <p className="text-2xl font-black text-claro-red mt-1">
              {(reportData.reduce((acc, c) => acc + c.idlePercent, 0) / (reportData.length || 1)).toFixed(1)}%
            </p>
          </div>
          <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Carga Semanal Base</p>
            <p className="text-2xl font-black text-slate-900 mt-1">30 Horas</p>
          </div>
          <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tempo Efetivo Certif.</p>
            <p className="text-2xl font-black text-emerald-600 mt-1">{totals.productive.toFixed(1)}h</p>
          </div>
          <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Capacidade Ociosa</p>
            <p className="text-2xl font-black text-amber-500 mt-1">{totals.empty.toFixed(1)}h</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white p-10 rounded-[40px] border border-slate-200 shadow-sm h-[500px] flex flex-col items-center">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6 text-center">Distribuição 30h Semanais (6h/Dia)</h3>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={80} outerRadius={130} paddingAngle={5} dataKey="value">
                  {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
                </Pie>
                <Tooltip />
                <Legend verticalAlign="bottom" height={36}/>
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white p-10 rounded-[40px] border border-slate-200 shadow-sm h-[500px] flex flex-col">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6">Eficiência de Ocupação G3</h3>
            <div className="flex-1 space-y-4 overflow-y-auto pr-2">
              {reportData.map(r => (
                <div key={r.id} className="space-y-1">
                  <div className="flex justify-between text-[10px] font-black uppercase">
                    <span>{r.name}</span>
                    <span className={r.idlePercent > 60 ? 'text-claro-red' : 'text-emerald-600'}>{r.idlePercent.toFixed(1)}% OCIOSO</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-slate-900 transition-all duration-1000" style={{ width: `${Math.max(0, 100 - r.idlePercent)}%` }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-[40px] shadow-sm overflow-hidden">
          <div className="p-8 border-b border-slate-100 flex justify-between items-center">
             <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Detalhamento Granular (Virtual 1.5h | Presencial 1.0h)</h3>
             <span className="text-[10px] font-black text-slate-400 uppercase">Carga Horária do Analista: 30h</span>
          </div>
          <table className="w-full text-left text-[10px] uppercase">
            <thead className="bg-slate-50 font-black text-slate-400">
              <tr>
                <th className="px-8 py-4">Analista</th>
                <th className="px-8 py-4 text-center">Total Período</th>
                <th className="px-8 py-4 text-center">Produtivas</th>
                <th className="px-8 py-4 text-center">Bloqueios ADM</th>
                <th className="px-8 py-4 text-center">Vazias (Ociosas)</th>
                <th className="px-8 py-4 text-right">Ociosidade %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-bold text-slate-600">
              {reportData.map(r => (
                <tr key={r.id} className="hover:bg-slate-50/50 transition-all">
                  <td className="px-8 py-4 font-black text-slate-900">{r.name}</td>
                  <td className="px-8 py-4 text-center font-black">{r.totalHours.toFixed(1)}H</td>
                  <td className="px-8 py-4 text-center text-emerald-600">{r.productiveHours.toFixed(1)}H</td>
                  <td className="px-8 py-4 text-center text-indigo-600">{(r.trainingHours + r.internalCertHours + r.offHours).toFixed(1)}H</td>
                  <td className="px-8 py-4 text-center text-claro-red">{r.emptyHours.toFixed(1)}H</td>
                  <td className="px-8 py-4 text-right font-black text-slate-900">
                    <span className={`px-2 py-1 rounded-full ${r.idlePercent > 50 ? 'bg-claro-red/10 text-claro-red' : 'bg-emerald-100 text-emerald-700'}`}>
                      {r.idlePercent.toFixed(1)}%
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

  const renderPerformanceView = () => (
    <div className="p-20 text-center font-black text-slate-300 uppercase tracking-[0.2em]">Visão de Performance G3 em Desenvolvimento</div>
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm">
        <div>
          <h3 className="text-base font-black text-slate-900 uppercase tracking-widest">
            {type === 'capacity' ? 'Governança de Capacidade (6h/Dia - 30h/Semana)' : 'Performance G3'}
          </h3>
          <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 tracking-widest">Manhã: 09h-12h | Tarde: 13:30h-16:30h</p>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col">
            <span className="text-[9px] font-black text-slate-400 uppercase mb-2 ml-1">Período Selecionado:</span>
            <div className="flex gap-2">
              <input type="date" className="text-xs border-2 border-slate-50 rounded-2xl px-5 py-3 font-bold bg-slate-50 outline-none focus:border-claro-red" value={startDate} onChange={e => setStartDate(e.target.value)} />
              <input type="date" className="text-xs border-2 border-slate-50 rounded-2xl px-5 py-3 font-bold bg-slate-50 outline-none focus:border-claro-red" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>
          <button onClick={handleExportExcel} className="bg-slate-900 text-white text-[10px] font-black px-8 py-3.5 rounded-2xl uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg">Exportar Auditoria</button>
        </div>
      </div>
      {type === 'capacity' ? renderCapacityView() : renderPerformanceView()}
    </div>
  );
};

export default Reports;
