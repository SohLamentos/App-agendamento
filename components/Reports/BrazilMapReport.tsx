
import React, { useState, useEffect } from 'react';
import { dataService } from '../../services/dataService';

const BrazilMapReport: React.FC = () => {
  const [data, setData] = useState<any[]>([]);

  const loadData = () => setData(dataService.getBrazilMapData());

  useEffect(() => {
    loadData();
    window.addEventListener('data-updated', loadData);
    return () => window.removeEventListener('data-updated', loadData);
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm flex justify-between items-center">
        <div>
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">Mapa Executivo Nacional (Calor por UF)</h3>
          <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Volume de Certificações Geradas</p>
        </div>
        <div className="flex gap-4">
          <div className="flex items-center gap-1.5 text-[8px] font-black text-slate-400 uppercase"><div className="w-2.5 h-2.5 bg-slate-100 rounded-sm"></div> Baixo</div>
          <div className="flex items-center gap-1.5 text-[8px] font-black text-slate-400 uppercase"><div className="w-2.5 h-2.5 bg-claro-red rounded-sm opacity-50"></div> Médio</div>
          <div className="flex items-center gap-1.5 text-[8px] font-black text-slate-400 uppercase"><div className="w-2.5 h-2.5 bg-claro-red rounded-sm"></div> Alto</div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-9 gap-4">
        {data.map(item => (
          <div key={item.uf} className={`p-6 rounded-[28px] border-2 transition-all group relative overflow-hidden ${
            item.techs > 100 ? 'bg-claro-red border-claro-redHover text-white' : 
            item.techs > 30 ? 'bg-claro-red/20 border-claro-red/30 text-slate-900' : 'bg-white border-slate-50 text-slate-900'
          }`}>
            <p className="text-2xl font-black mb-1">{item.uf}</p>
            <p className="text-[10px] font-black opacity-60 uppercase">{item.techs} TÉCS</p>
            
            <div className="absolute inset-0 bg-slate-900/95 p-5 opacity-0 group-hover:opacity-100 transition-all flex flex-col justify-center gap-1">
              <p className="text-[8px] font-black text-white/50 uppercase">UF: {item.uf}</p>
              <div className="space-y-0.5">
                <p className="text-[9px] font-black text-white">CERT: {item.certs}</p>
                <p className="text-[9px] font-black text-rose-400">REPROV: {item.reprovedPct.toFixed(1)}%</p>
                <p className="text-[9px] font-black text-amber-400">NO-SHOW: {item.noShowPct.toFixed(1)}%</p>
              </div>
            </div>
          </div>
        ))}
        {data.length === 0 && (
          <div className="col-span-full py-20 text-center font-black text-slate-300 uppercase italic">Nenhum dado geográfico localizado no grupo ativo.</div>
        )}
      </div>
    </div>
  );
};

export default BrazilMapReport;
