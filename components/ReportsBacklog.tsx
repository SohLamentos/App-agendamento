
import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  Cell, Legend, LineChart, Line
} from 'recharts';
import { dataService } from '../services/dataService';
import { User } from '../types';

const ReportsBacklog: React.FC<{ user: User }> = ({ user }) => {
  const [forecast, setForecast] = useState<any>(null);

  useEffect(() => {
    const load = () => {
      setForecast(dataService.getBacklogForecasting());
    };
    load();
    window.addEventListener('data-updated', load);
    return () => window.removeEventListener('data-updated', load);
  }, []);

  if (!forecast) return <div className="p-10 text-center font-black text-slate-400 animate-pulse">PROCESSANDO INTELIGÊNCIA G3...</div>;

  const handleExportCSV = () => {
    const headers = ["Categoria", "Valor"];
    const rows = [
      ["Técnicos Elegíveis", forecast.kpis.totalEligible],
      ["Vencem em 2 dias", forecast.kpis.vencimento2d],
      ["Vencem em 5 dias", forecast.kpis.vencimento5d],
      ["Capacidade Presencial (10d)", forecast.kpis.capacityP],
      ["Capacidade Virtual (10d)", forecast.kpis.capacityV],
      ["Backlog Projetado", forecast.kpis.projectedBacklog]
    ];

    const csvContent = "data:text/csv;charset=utf-8," 
      + headers.join(",") + "\n"
      + rows.map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `G3_Previsao_Backlog_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* KPI Panel */}
      <div className="flex flex-col lg:flex-row justify-between items-center gap-6 bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm">
        <div className="flex-1">
          <h3 className="text-base font-black text-slate-900 uppercase tracking-widest">Previsibilidade de Backlog G3</h3>
          <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Capacidade Residual vs Demanda Projetada (10 Dias Úteis)</p>
        </div>
        <button onClick={handleExportCSV} className="bg-slate-900 text-white text-[10px] font-black px-8 py-3.5 rounded-2xl uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg shrink-0">Exportar Planejamento</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm relative overflow-hidden group">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Técnicos Elegíveis</p>
          <p className="text-3xl font-black text-slate-900 mt-2">{forecast.kpis.totalEligible}</p>
          <div className="mt-4 flex gap-2">
            <span className="text-[9px] font-black text-claro-red bg-claro-red/5 px-2 py-1 rounded-full uppercase">!! {forecast.kpis.vencimento2d} VENCEM EM 48H</span>
          </div>
        </div>
        <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Capacidade Residual</p>
          <div className="flex items-baseline gap-2 mt-2">
            <p className="text-3xl font-black text-emerald-600">{forecast.kpis.capacityP + forecast.kpis.capacityV}</p>
            <span className="text-[10px] font-black text-slate-400 uppercase">SLOTS</span>
          </div>
          <div className="mt-4 text-[9px] font-bold text-slate-500 uppercase flex justify-between">
            <span>P: {forecast.kpis.capacityP}</span>
            <span>V: {forecast.kpis.capacityV}</span>
          </div>
        </div>
        <div className="bg-white p-8 rounded-[32px] border-2 border-claro-red/20 shadow-sm bg-claro-red/5">
          <p className="text-[10px] font-black text-claro-red uppercase tracking-widest">Déficit Projetado</p>
          <p className="text-3xl font-black text-claro-red mt-2">{forecast.kpis.projectedBacklog}</p>
          <p className="text-[9px] font-bold text-claro-red/60 uppercase mt-2">NÃO CABERÃO NA JANELA</p>
        </div>
        <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Risco Crítico Turmas</p>
          <p className="text-3xl font-black text-amber-500 mt-2">{forecast.riskByClass.filter((r: any) => r.riskStatus === 'ALTO').length}</p>
          <p className="text-[9px] font-bold text-slate-400 uppercase mt-2">TURMAS COM IMPASSE</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {/* Tabela de Risco por Turma */}
        <div className="bg-white border border-slate-200 rounded-[40px] shadow-sm overflow-hidden flex flex-col h-[500px]">
          <div className="p-8 border-b border-slate-50">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Análise de Risco por Turma</h3>
          </div>
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left text-xs uppercase">
              <thead className="bg-slate-50 font-black text-slate-400 sticky top-0 z-10">
                <tr>
                  <th className="px-8 py-4">Turma/Cidade</th>
                  <th className="px-8 py-4 text-center">Técnicos</th>
                  <th className="px-8 py-4 text-center">Vencimento</th>
                  <th className="px-8 py-4 text-right">Risco</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {forecast.riskByClass.map((r: any, idx: number) => (
                  <tr key={idx} className="hover:bg-slate-50 font-bold text-slate-600">
                    <td className="px-8 py-5">
                      <p className="font-black text-slate-900">{r.turma}</p>
                      <p className="text-[9px] text-slate-400">{r.cidade} • {r.modalidade}</p>
                    </td>
                    <td className="px-8 py-5 text-center">{r.qtd}</td>
                    <td className="px-8 py-5 text-center text-slate-400">{new Date(r.maxDate).toLocaleDateString()}</td>
                    <td className="px-8 py-5 text-right">
                      <div className="flex flex-col items-end">
                        <span className={`px-2 py-1 rounded-full text-[8px] font-black ${r.riskStatus === 'ALTO' ? 'bg-claro-red text-white' : r.riskStatus === 'MÉDIO' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {r.riskStatus}
                        </span>
                        <span className="text-[7px] text-slate-400 mt-1">{r.reason}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Ranking de Pressão por Analista */}
        <div className="bg-white p-10 rounded-[40px] border border-slate-200 shadow-sm h-[500px] flex flex-col">
          <div className="mb-8">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Ranking de Pressão (IPP)</h3>
            <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">Demanda Presencial Pendente / Capacidade de 10 Dias</p>
          </div>
          <div className="flex-1 overflow-y-auto">
             <div className="space-y-6">
               {forecast.analystPressure.map((a: any) => (
                 <div key={a.id} className="space-y-2">
                   <div className="flex justify-between items-end">
                     <div>
                       <p className="text-[11px] font-black text-slate-900 uppercase">{a.name}</p>
                       <p className="text-[8px] text-slate-400 font-black uppercase truncate max-w-xs">{a.cities}</p>
                     </div>
                     <span className={`text-[10px] font-black ${a.level === 'ALTA' ? 'text-claro-red' : a.level === 'MÉDIA' ? 'text-amber-500' : 'text-emerald-500'}`}>
                       IPP: {a.ipp} ({a.level})
                     </span>
                   </div>
                   <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                     <div 
                        className={`h-full transition-all duration-1000 ${a.level === 'ALTA' ? 'bg-claro-red' : a.level === 'MÉDIA' ? 'bg-amber-500' : 'bg-emerald-500'}`}
                        style={{ width: `${Math.min(100, parseFloat(a.ipp) * 100)}%` }}
                     ></div>
                   </div>
                   {a.level === 'ALTA' && (
                     <p className="text-[7px] font-black text-claro-red uppercase tracking-widest">⚠️ RECOMENDAÇÃO: PRESERVAR ESTE ANALISTA DO VIRTUAL</p>
                   )}
                 </div>
               ))}
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportsBacklog;
