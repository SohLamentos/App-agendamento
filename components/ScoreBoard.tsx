import React, { useMemo, useEffect, useState } from 'react';
import { dataService } from '../services/dataService';
import { UserRole, User, VirtualScoreAdjustment } from '../types';

interface Props {
  user: User;
}

const ScoreBoard: React.FC<Props> = ({ user }) => {
  const [analysts, setAnalysts] = useState(
    dataService.getUsers().filter(
      u =>
        u.role === UserRole.ANALYST &&
        (user.role === UserRole.ADMIN || u.groupId === user.groupId)
    )
  );

  const [scoreAdjustments, setScoreAdjustments] = useState<VirtualScoreAdjustment[]>(
    dataService.getScoreAdjustments()
  );

  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
  const [selectedAnalystId, setSelectedAnalystId] = useState('');
  const [adjustmentValue, setAdjustmentValue] = useState(50);
  const [adjustmentReason, setAdjustmentReason] = useState('');

  const refresh = () => {
    setAnalysts(
      dataService.getUsers().filter(
        u =>
          u.role === UserRole.ANALYST &&
          (user.role === UserRole.ADMIN || u.groupId === user.groupId)
      )
    );
    setScoreAdjustments(dataService.getScoreAdjustments());
  };

  useEffect(() => {
    window.addEventListener('data-updated', refresh);
    return () => window.removeEventListener('data-updated', refresh);
  }, [user]);

  const activeAdjustments = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return scoreAdjustments.filter(
      a => a.active && today >= a.startDate && today <= a.endDate
    );
  }, [scoreAdjustments]);

  const analystDemandData = useMemo(() => {
    return analysts
      .map(a => {
        const metrics = dataService.getAnalystDemandMetrics(a.id);

        const totalPenalty = activeAdjustments
          .filter(ad => ad.analystId === a.id)
          .reduce((sum, ad) => sum + (ad.penalty || 0), 0);

        return {
          id: a.id,
          name: a.fullName.split(' ')[0],
          fullName: a.fullName,
          metrics,
          scoreFinal: metrics.demandIndex + totalPenalty,
          penalty: totalPenalty
        };
      })
      .sort((a, b) => b.scoreFinal - a.scoreFinal);
  }, [analysts, activeAdjustments]);

  const handleCreateAdjustment = () => {
    if (!selectedAnalystId) {
      alert('Selecione um analista.');
      return;
    }

    dataService.saveScoreAdjustment({
      groupId: user.groupId,
      analystId: selectedAnalystId,
      penalty: Number(adjustmentValue) || 0,
      reason: adjustmentReason || `Ajuste manual de prioridade +${adjustmentValue}`,
      active: true
    });

    setIsAdjustmentModalOpen(false);
    setSelectedAnalystId('');
    setAdjustmentValue(50);
    setAdjustmentReason('');
    refresh();
  };

  const addPriority = (analystId: string, value: number) => {
    dataService.saveScoreAdjustment({
      groupId: user.groupId,
      analystId,
      penalty: value,
      reason: `Ajuste manual de prioridade +${value}`,
      active: true
    });

    refresh();
  };

  const resetPriority = (analystId: string) => {
    dataService.resetScoreAdjustmentsByAnalyst(analystId);
    refresh();
  };
  const handleResetSelectedAdjustment = () => {
  if (!selectedAnalystId) {
    alert('Selecione um analista para zerar o score.');
    return;
  }

  const confirmed = window.confirm('Deseja zerar todos os ajustes de score deste analista?');
  if (!confirmed) return;

  dataService.resetScoreAdjustmentsByAnalyst(selectedAnalystId);

  setIsAdjustmentModalOpen(false);
  setSelectedAnalystId('');
  setAdjustmentValue(50);
  setAdjustmentReason('');
  refresh();
};

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="bg-white p-10 rounded-[40px] border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
          <div>
            <h3 className="text-base font-black text-slate-900 uppercase tracking-wider">
              Monitoramento de Capacidade {user.groupId}
            </h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">
              Cálculo de Prioridade Nacional
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setIsAdjustmentModalOpen(true)}
              className="bg-claro-red text-white px-5 py-2 rounded-full text-[8px] font-black uppercase tracking-widest shadow-lg hover:bg-claro-redHover transition-all"
            >
              Novo Ajuste de Score
            </button>

            <span className="flex items-center gap-1.5 text-[8px] font-black text-white bg-claro-red px-3 py-2 rounded-full uppercase tracking-widest">
              ALTA CARGA
            </span>

            <span className="flex items-center gap-1.5 text-[8px] font-black text-slate-900 bg-slate-100 px-3 py-2 rounded-full uppercase tracking-widest">
              CAPACIDADE LIVRE
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {analystDemandData.map((data) => (
            <div
              key={data.id}
              className="border-2 border-slate-50 rounded-[32px] p-6 bg-slate-50/30 hover:bg-white hover:border-slate-100 hover:shadow-xl transition-all group relative overflow-hidden"
            >
              {data.penalty > 0 && (
                <div className="absolute top-0 right-0 bg-claro-red text-white text-[8px] font-black px-4 py-1.5 rounded-bl-2xl shadow-lg">
                  PRIORIDADE +{data.penalty}
                </div>
              )}

              <div className="flex justify-between items-start mb-4">
                <div className="flex flex-col">
                  <span className="text-xs font-black text-slate-900 uppercase tracking-wider">
                    {data.name}
                  </span>
                  <span className="text-[7px] font-bold text-slate-400 uppercase tracking-widest">
                    {data.fullName}
                  </span>
                </div>

                <span
                  className={`text-[8px] font-black px-3 py-1 rounded-full uppercase tracking-widest ${
                    data.metrics.level === 'ALTA' || data.scoreFinal > 100
                      ? 'bg-claro-red text-white'
                      : data.metrics.level === 'MÉDIA' || data.scoreFinal > 40
                      ? 'bg-slate-900 text-white'
                      : 'bg-emerald-500 text-white'
                  }`}
                >
                  {data.scoreFinal > 100
                    ? 'ALTA PRESSÃO'
                    : data.scoreFinal > 40
                    ? 'CARGA MÉDIA'
                    : 'NORMAL'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-[8px] text-slate-400 font-black uppercase">Território</p>
                  <p className="text-sm font-black text-slate-700">{data.metrics.cityCount}</p>
                </div>

                <div className="text-center">
                  <p className="text-[8px] text-slate-400 font-black uppercase">Pendentes</p>
                  <p className="text-sm font-black text-slate-700">
                    {data.metrics.pendingPresentialCount}
                  </p>
                </div>

                <div className="text-center">
                  <p className="text-[8px] text-slate-400 font-black uppercase">Score Final</p>
                  <p className="text-sm font-black text-claro-red">{data.scoreFinal}</p>
                </div>
              </div>

              <div className="mt-5 w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-1000 ${
                    data.scoreFinal > 100
                      ? 'bg-claro-red'
                      : data.scoreFinal > 40
                      ? 'bg-slate-900'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, (data.scoreFinal / 150) * 100)}%` }}
                />
              </div>

              <div className="mt-5 grid grid-cols-3 gap-2">
                <button
                  onClick={() => addPriority(data.id, 50)}
                  className="bg-claro-red text-white rounded-xl py-2 text-[8px] font-black uppercase tracking-widest hover:bg-claro-redHover transition-all"
                >
                  +50
                </button>

                <button
                  onClick={() => addPriority(data.id, 100)}
                  className="bg-slate-900 text-white rounded-xl py-2 text-[8px] font-black uppercase tracking-widest hover:bg-black transition-all"
                >
                  +100
                </button>

                <button
                  onClick={() => resetPriority(data.id)}
                  className="bg-slate-100 text-slate-700 rounded-xl py-2 text-[8px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
                >
                  Zerar
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {isAdjustmentModalOpen && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-slate-900 p-6 text-white">
              <h3 className="text-lg font-black uppercase">
                Novo Ajuste de Score
              </h3>
              <p className="text-[10px] font-bold uppercase opacity-60 mt-1">
                Prioridade manual do analista
              </p>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase">
                  Analista
                </label>
                <select
                  value={selectedAnalystId}
                  onChange={(e) => setSelectedAnalystId(e.target.value)}
                  className="w-full mt-1 bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-xs font-bold uppercase outline-none focus:border-claro-red"
                >
                  <option value="">SELECIONE</option>
                  {analysts.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.fullName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase">
                  Prioridade
                </label>
                <input
                  type="number"
                  value={adjustmentValue}
                  onChange={(e) => setAdjustmentValue(Number(e.target.value))}
                  className="w-full mt-1 bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-xs font-bold uppercase outline-none focus:border-claro-red"
                />
              </div>

              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase">
                  Motivo
                </label>
                <input
                  type="text"
                  value={adjustmentReason}
                  onChange={(e) => setAdjustmentReason(e.target.value)}
                  placeholder="EX: DEMANDA PRESENCIAL FUTURA"
                  className="w-full mt-1 bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-xs font-bold uppercase outline-none focus:border-claro-red"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 p-6 pt-0">
  <button
    onClick={() => setIsAdjustmentModalOpen(false)}
    className="py-3 rounded-2xl bg-slate-100 text-slate-500 text-[10px] font-black uppercase"
  >
    Cancelar
  </button>

  <button
    onClick={handleResetSelectedAdjustment}
    disabled={!selectedAnalystId}
    className={`py-3 rounded-2xl text-[10px] font-black uppercase transition-all ${
      selectedAnalystId
        ? 'bg-slate-900 text-white hover:bg-black'
        : 'bg-slate-100 text-slate-300 cursor-not-allowed'
    }`}
  >
    Zerar
  </button>

  <button
    onClick={handleCreateAdjustment}
    className="py-3 rounded-2xl bg-claro-red text-white text-[10px] font-black uppercase"
  >
    Salvar
  </button>
</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScoreBoard;
