
import React, { useState, useEffect, useMemo } from 'react';
import { auditService } from '../services/auditService';
import { AuditTicket, User, UserRole } from '../types';

const AuditTickets: React.FC<{ user: User }> = ({ user }) => {
  const [tickets, setTickets] = useState<AuditTicket[]>(auditService.getTickets());
  const [filterUser, setFilterUser] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterTarget, setFilterTarget] = useState('');
  const [filterDateStart, setFilterDateStart] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  useEffect(() => {
  auditService.refresh(user.groupId);

  const refresh = () => setTickets(auditService.getTickets());

  window.addEventListener('audit-updated', refresh);

  return () => window.removeEventListener('audit-updated', refresh);
}, [user.groupId]);

  const filteredTickets = useMemo(() => {
  return tickets.filter(t => {
    const matchGroup =
      user.role === UserRole.ADMIN ||
      t.groupId === user.groupId;

    if (!matchGroup) return false;

    const isLoginTicket =
      (t.action || '').toUpperCase() === 'LOGIN REALIZADO (PRIMEIRO NOME)';

    if (isLoginTicket) return false;

    const matchUser = t.userName.toLowerCase().includes(filterUser.toLowerCase());
    const matchAction = t.action.toLowerCase().includes(filterAction.toLowerCase());
    const matchTarget =
      t.targetValue.toLowerCase().includes(filterTarget.toLowerCase()) ||
      t.targetType.toLowerCase().includes(filterTarget.toLowerCase());

    let matchDate = true;
    if (filterDateStart) {
      matchDate =
        matchDate &&
        new Date(t.timestamp) >= new Date(filterDateStart + 'T00:00:00');
    }
    if (filterDateEnd) {
      matchDate =
        matchDate &&
        new Date(t.timestamp) <= new Date(filterDateEnd + 'T23:59:59');
    }

    return matchUser && matchAction && matchTarget && matchDate;
  });
}, [tickets, filterUser, filterAction, filterTarget, filterDateStart, filterDateEnd, user]);

  const totalPages = Math.ceil(filteredTickets.length / itemsPerPage);
  const paginatedTickets = filteredTickets.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleExport = () => {
    auditService.exportToCSV();
  };
  const getActionBadgeClass = (action: string) => {
  const a = (action || '').toUpperCase();

  if (
    a.includes('CANCEL') ||
    a.includes('REPROV') ||
    a.includes('RESET') ||
    a.includes('REMOVER') ||
    a.includes('IMPORT_BACKUP') ||
    a.includes('LIMPAR')
  ) {
    return 'bg-rose-50 text-rose-700 border border-rose-200';
  }

  if (
    a.includes('AGENDAMENTO') ||
    a.includes('APROVACAO') ||
    a.includes('APROVADO') ||
    a.includes('EXPORT') ||
    a.includes('IMPORT_AGENDA') ||
    a.includes('LANCAR_TREINAMENTO') ||
    a.includes('LANCAR_FERIAS') ||
    a.includes('LANCAR_FERIADO')
  ) {
    return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
  }

  if (
    a.includes('AJUSTE') ||
    a.includes('UPDATE') ||
    a.includes('ALTER') ||
    a.includes('RESTORE') ||
    a.includes('IMPROVISO') ||
    a.includes('LANCAR_OUTROS')
  ) {
    return 'bg-amber-50 text-amber-700 border border-amber-200';
  }

  return 'bg-slate-100 text-slate-700 border border-slate-200';
};

  
  return (
    <div className="space-y-6">
      {/* Filtros de Auditoria */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="flex flex-col">
          <label className="text-[9px] font-black text-slate-400 uppercase mb-1">Usuário</label>
          <input 
            type="text" 
            className="text-xs border rounded-lg p-2 font-bold uppercase" 
            placeholder="Filtrar Usuário..." 
            value={filterUser} 
            onChange={e => setFilterUser(e.target.value)} 
          />
        </div>
        <div className="flex flex-col">
          <label className="text-[9px] font-black text-slate-400 uppercase mb-1">Ação</label>
          <input 
            type="text" 
            className="text-xs border rounded-lg p-2 font-bold uppercase" 
            placeholder="Filtrar Ação..." 
            value={filterAction} 
            onChange={e => setFilterAction(e.target.value)} 
          />
        </div>
        <div className="flex flex-col">
          <label className="text-[9px] font-black text-slate-400 uppercase mb-1">Alvo (CPF/Analista/Valor)</label>
          <input 
            type="text" 
            className="text-xs border rounded-lg p-2 font-bold uppercase" 
            placeholder="Filtrar Alvo..." 
            value={filterTarget} 
            onChange={e => setFilterTarget(e.target.value)} 
          />
        </div>
        <div className="flex flex-col">
          <label className="text-[9px] font-black text-slate-400 uppercase mb-1">Início</label>
          <input 
            type="date" 
            className="text-xs border rounded-lg p-2 font-bold uppercase" 
            value={filterDateStart} 
            onChange={e => setFilterDateStart(e.target.value)} 
          />
        </div>
        <div className="flex flex-col">
          <label className="text-[9px] font-black text-slate-400 uppercase mb-1">Fim</label>
          <input 
            type="date" 
            className="text-xs border rounded-lg p-2 font-bold uppercase" 
            value={filterDateEnd} 
            onChange={e => setFilterDateEnd(e.target.value)} 
          />
        </div>
      </div>

      <div className="flex justify-between items-center px-2">
        <p className="text-[10px] font-black text-slate-400 uppercase">Total de Registros: {filteredTickets.length}</p>
        <button 
          onClick={handleExport}
          className="bg-slate-900 text-white text-[10px] font-black px-4 py-2 rounded-lg uppercase shadow-lg hover:bg-slate-800 transition-all flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
          Exportar Excel (CSV)
        </button>
      </div>

      {/* Tabela de Tickets */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 font-black text-slate-400 uppercase">
            <tr>
              <th className="px-6 py-4">Data/Hora</th>
              <th className="px-6 py-4">Responsável</th>
              <th className="px-6 py-4">Ação</th>
              <th className="px-6 py-4">Alvo</th>
              <th className="px-6 py-4">Motivo</th>
              <th className="px-6 py-4 text-center">Ticket ID</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 uppercase">
            {paginatedTickets.map(t => (
              <tr key={t.ticketId} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4">
                  <p className="font-bold text-slate-900">
                    {new Date(t.timestamp).toLocaleString('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit'
})}
                  </p>
                  <p className="text-[9px] text-slate-400 font-black uppercase">{t.screen}</p>
                </td>
                <td className="px-6 py-4">
                  <p className="font-black text-slate-800">{t.userName}</p>
                  <p className="text-[9px] text-blue-600 font-black">{t.userRole}</p>
                </td>
                <td className="px-6 py-4">
  <span className={`inline-flex px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${getActionBadgeClass(t.action)}`}>
    {t.action}
  </span>
</td>
                <td className="px-6 py-4">
                  <p className="font-black text-slate-400 text-[9px]">{t.targetType}</p>
                  <p className="font-bold text-slate-600">{t.targetValue}</p>
                </td>
                <td className="px-6 py-4">
  <div className="max-w-[320px]" title={t.reason}>
    <p className="italic text-slate-500 font-medium leading-tight line-clamp-3">
      {t.reason}
    </p>
  </div>
</td>
                <td className="px-6 py-4 text-center">
                  <span className="text-[8px] bg-slate-100 px-2 py-1 rounded font-mono text-slate-400">{t.ticketId.split('-')[0]}...</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 py-4">
          <button 
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(prev => prev - 1)}
            className="px-4 py-2 border rounded-lg text-[10px] font-black uppercase hover:bg-slate-50 disabled:opacity-30"
          >
            Anterior
          </button>
          <span className="px-4 py-2 text-[10px] font-black text-slate-400">Página {currentPage} de {totalPages}</span>
          <button 
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(prev => prev + 1)}
            className="px-4 py-2 border rounded-lg text-[10px] font-black uppercase hover:bg-slate-50 disabled:opacity-30"
          >
            Próxima
          </button>
        </div>
      )}
    </div>
  );
};

export default AuditTickets;
