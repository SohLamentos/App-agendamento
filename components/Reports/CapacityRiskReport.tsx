
import React, { useState, useEffect } from 'react';
import { dataService } from '../../services/dataService';

const CapacityRiskReport: React.FC = () => {
  const [report, setReport] = useState<any>(null);

  const loadData = () => setReport(dataService.getCapacityRiskReport());

  useEffect(() => {
    loadData();
    window.addEventListener('data-updated', loadData);
    return () => window.removeEventListener('data-updated', loadData);
  }, []);

  if (!report) return null;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Capacidade Presencial (10d)</p>
          <p className="text-3xl font-black text-slate-900">{report.summary.capacity} <span className="text-xs font-bold text-slate-300 uppercase">Slots</span></p>
        </div>
        <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Demanda Presencial Pendente</p>
          <p className="text-3xl font-black text-claro-red">{report.summary.demand} <span className="text-xs font-bold text-slate-300 uppercase">Técnicos</span></p>
        </div>
        <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Saldo Projetado</p>
          <p className={`text-3xl font-black ${report.summary.balance < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
            {report.summary.balance > 0 ? '+' : ''}{report.summary.balance}
          </p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-[40px] shadow-sm overflow-hidden">
        <div className="p-8 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">Análise de Risco e Pressão (IPP)</h3>
          <span className="text-[9px] font-black text-slate-400 uppercase">Base: Janela de 10 Dias Úteis</span>
        </div>
        <table className="w-full text-left text-xs uppercase">
          <thead className="bg-slate-50 font-black text-slate-400">
            <tr>
              <th className="px-8 py-4">Analista G3</th>
              <th className="px-8 py-4 text-center">Capacidade 10d</th>
              <th className="px-8 py-4 text-center">Demanda Pend.</th>
              <th className="px-8 py-4 text-center">Ocupação %</th>
              <th className="px-8 py-4 text-center">IPP (Score)</th>
              <th className="px-8 py-4 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-bold text-slate-600">
            {report.analysts.map((a: any) => (
              <tr key={a.id} className="hover:bg-slate-50/50">
                <td className="px-8 py-5 font-black text-slate-900">{a.name}</td>
                <td className="px-8 py-5 text-center">{a.capacity10d}</td>
                <td className="px-8 py-5 text-center">{a.demandP}</td>
                <td className="px-8 py-5 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full ${a.status === 'RED' ? 'bg-claro-red' : a.status === 'YELLOW' ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${a.occupation}%` }}></div>
                    </div>
                    <span>{a.occupation.toFixed(0)}%</span>
                  </div>
                </td>
                <td className="px-8 py-5 text-center font-black">{a.ipp}</td>
                <td className="px-8 py-5 text-right">
                  <span className={`px-2 py-1 rounded-full text-[8px] font-black ${
                    a.status === 'RED' ? 'bg-claro-red text-white' : 
                    a.status === 'YELLOW' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {a.status === 'RED' ? 'CRÍTICO' : a.status === 'YELLOW' ? 'ALERTA' : 'NORMAL'}
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
