
import React, { useState, useMemo, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  Cell, PieChart, Pie, Legend
} from 'recharts';
import { dataService } from '../services/dataService';
import { User, UserRole } from '../types';

interface ReportsProps {
  user: User;
  type: 'capacity' | 'performance';
}

const Reports: React.FC<ReportsProps> = ({ user, type }) => {
  // Função auxiliar para obter data local em formato YYYY-MM-DD sem desvios de UTC
  const getLocalDateString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Inicialização robusta: Segunda e Sexta da semana atual em horário LOCAL
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

  const handleExportCSV = () => {
    const filename = type === 'capacity' ? 'G3_Ociosidade_30H_Analista' : 'G3_Performance';
    const headers = type === 'capacity' 
      ? ["Analista", "Total Horas (6h/dia)", "Produtivas", "Treinamento", "Cert. Própria", "Folgas", "Vazias", "Ociosidade (%)"]
      : ["Analista", "Certs Concluidas", "Eficiência"];
      
    const rows = reportData.map(r => type === 'capacity' 
      ? [r.name, r.totalHours, r.productiveHours.toFixed(1), r.trainingHours, r.internalCertHours, r.offHours, r.emptyHours.toFixed(1), r.idlePercent.toFixed(1)]
      : [r.name, r.productiveHours, "100%"]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + headers.join(",") + "\n"
      + rows.map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
          <button onClick={handleExportCSV} className="bg-slate-900 text-white text-[10px] font-black px-8 py-3.5 rounded-2xl uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg">Exportar Auditoria</button>
        </div>
      </div>
      {type === 'capacity' ? renderCapacityView() : renderPerformanceView()}
    </div>
  );
};

export default Reports;
