
import React, { useState, useEffect, useMemo } from 'react';
import { dataService } from '../../services/dataService';

// Simplified SVG paths for Brazil states (UF)
const BRAZIL_UF_PATHS: Record<string, string> = {
  "AC": "M115,310 L100,320 L90,340 L110,350 L130,340 L140,320 Z",
  "AL": "M550,230 L560,235 L565,245 L555,250 L545,245 Z",
  "AM": "M100,150 L250,150 L280,250 L200,320 L100,300 L80,200 Z",
  "AP": "M300,50 L340,60 L350,90 L320,100 L290,80 Z",
  "BA": "M450,220 L500,210 L530,250 L520,320 L480,350 L420,320 L410,250 Z",
  "CE": "M480,110 L520,120 L530,150 L500,170 L470,150 Z",
  "DF": "M395,315 L405,315 L405,325 L395,325 Z",
  "ES": "M510,380 L530,390 L525,410 L505,405 Z",
  "GO": "M350,280 L420,280 L440,350 L380,380 L340,350 Z",
  "MA": "M380,100 L440,110 L460,180 L420,220 L370,180 Z",
  "MG": "M420,340 L480,340 L510,380 L500,430 L440,440 L410,400 Z",
  "MS": "M280,360 L340,360 L360,420 L320,450 L270,420 Z",
  "MT": "M250,220 L350,220 L380,320 L320,360 L240,320 Z",
  "PA": "M250,80 L380,80 L410,200 L350,250 L240,220 Z",
  "PB": "M530,155 L560,160 L565,175 L535,180 Z",
  "PE": "M510,185 L560,190 L565,210 L500,215 Z",
  "PI": "M440,120 L480,120 L500,200 L460,240 L430,200 Z",
  "PR": "M280,460 L340,460 L350,500 L300,520 L270,500 Z",
  "RJ": "M480,435 L510,440 L505,460 L475,455 Z",
  "RN": "M530,125 L565,130 L570,150 L535,155 Z",
  "RO": "M150,280 L220,280 L240,340 L180,360 L140,330 Z",
  "RR": "M180,50 L260,60 L270,120 L200,140 L170,100 Z",
  "RS": "M270,540 L330,540 L340,600 L280,620 L250,590 Z",
  "SC": "M290,515 L345,515 L355,545 L300,555 Z",
  "SE": "M540,255 L555,260 L550,275 L535,270 Z",
  "SP": "M350,430 L420,430 L440,480 L380,500 L340,480 Z",
  "TO": "M380,190 L430,200 L440,280 L390,280 L370,230 Z"
};

const BrazilMapReport: React.FC = () => {
  const [data, setData] = useState<any[]>([]);
  const [hoveredUF, setHoveredUF] = useState<string | null>(null);

  const loadData = () => setData(dataService.getBrazilMapData());

  useEffect(() => {
    loadData();
    window.addEventListener('data-updated', loadData);
    return () => window.removeEventListener('data-updated', loadData);
  }, []);

  const statsMap = useMemo(() => {
    const map: Record<string, any> = {};
    data.forEach(item => {
      map[item.uf] = item;
    });
    return map;
  }, [data]);

  const maxTechs = useMemo(() => {
    return Math.max(...data.map(d => d.techs), 1);
  }, [data]);

  const getColor = (uf: string) => {
    const techs = statsMap[uf]?.techs || 0;
    if (techs === 0) return '#f1f5f9'; // slate-100
    const intensity = Math.min(techs / maxTechs, 1);
    // Scale from light red to deep red
    return `rgba(155, 0, 0, ${0.1 + intensity * 0.9})`;
  };

  const hoveredData = hoveredUF ? statsMap[hoveredUF] : null;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">Mapa Executivo Nacional (Calor por UF)</h3>
          <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Volume de Técnicos Agendados por Estado</p>
        </div>
        <div className="flex gap-4">
          <div className="flex items-center gap-1.5 text-[8px] font-black text-slate-400 uppercase">
            <div className="w-2.5 h-2.5 bg-slate-100 rounded-sm border border-slate-200"></div> Baixo
          </div>
          <div className="flex items-center gap-1.5 text-[8px] font-black text-slate-400 uppercase">
            <div className="w-2.5 h-2.5 bg-claro-red/40 rounded-sm"></div> Médio
          </div>
          <div className="flex items-center gap-1.5 text-[8px] font-black text-slate-400 uppercase">
            <div className="w-2.5 h-2.5 bg-claro-red rounded-sm"></div> Alto
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Map Container */}
        <div className="lg:col-span-7 bg-white p-6 rounded-[40px] border border-slate-200 shadow-sm flex justify-center items-center min-h-[500px] relative overflow-hidden">
          <svg 
            viewBox="0 0 600 650" 
            className="w-full h-full max-w-[500px] drop-shadow-xl"
            style={{ filter: 'drop-shadow(0 10px 20px rgba(0,0,0,0.05))' }}
          >
            {Object.entries(BRAZIL_UF_PATHS).map(([uf, path]) => (
              <path
                key={uf}
                d={path}
                fill={getColor(uf)}
                stroke="#fff"
                strokeWidth="2"
                className="transition-all duration-300 cursor-pointer hover:stroke-slate-900 hover:stroke-[3px]"
                onMouseEnter={() => setHoveredUF(uf)}
                onMouseLeave={() => setHoveredUF(null)}
              />
            ))}
          </svg>

          {/* Floating Tooltip */}
          {hoveredUF && hoveredData && (
            <div className="absolute top-10 right-10 bg-slate-900 text-white p-4 rounded-2xl shadow-2xl border border-white/10 animate-in zoom-in-95 duration-200 z-10 w-48">
              <p className="text-[10px] font-black text-white/50 uppercase mb-1">Estado: {hoveredUF}</p>
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold">AGENDADOS</span>
                  <span className="text-xs font-black text-rose-400">{hoveredData.techs}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold">APROVADOS</span>
                  <span className="text-xs font-black text-emerald-400">{hoveredData.certs}</span>
                </div>
                <div className="h-px bg-white/10 my-2"></div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold">REPROV.</span>
                  <span className="text-[10px] font-black">{hoveredData.reprovedPct.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold">NO-SHOW</span>
                  <span className="text-[10px] font-black">{hoveredData.noShowPct.toFixed(1)}%</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Stats Sidebar */}
        <div className="lg:col-span-5 space-y-4 max-h-[600px] overflow-y-auto no-scrollbar pr-2">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 mb-4">Ranking por Volume</h4>
          {data.sort((a, b) => b.techs - a.techs).map((item, idx) => (
            <div 
              key={item.uf} 
              className={`p-4 rounded-2xl border transition-all flex items-center justify-between ${
                hoveredUF === item.uf ? 'bg-slate-900 border-slate-900 text-white scale-[1.02] shadow-lg' : 'bg-white border-slate-100 text-slate-900'
              }`}
              onMouseEnter={() => setHoveredUF(item.uf)}
              onMouseLeave={() => setHoveredUF(null)}
            >
              <div className="flex items-center gap-4">
                <span className={`text-[10px] font-black w-6 h-6 rounded-full flex items-center justify-center ${
                  hoveredUF === item.uf ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-400'
                }`}>
                  {idx + 1}
                </span>
                <div>
                  <p className="text-sm font-black uppercase">{item.uf}</p>
                  <p className={`text-[9px] font-bold uppercase ${hoveredUF === item.uf ? 'text-white/50' : 'text-slate-400'}`}>
                    {item.certs} Aprovados
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className={`text-lg font-black ${hoveredUF === item.uf ? 'text-rose-400' : 'text-claro-red'}`}>
                  {item.techs}
                </p>
                <p className={`text-[8px] font-black uppercase ${hoveredUF === item.uf ? 'text-white/30' : 'text-slate-300'}`}>
                  Agendados
                </p>
              </div>
            </div>
          ))}
          {data.length === 0 && (
            <div className="py-10 text-center font-black text-slate-300 uppercase italic text-xs">
              Nenhum dado localizado.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BrazilMapReport;
