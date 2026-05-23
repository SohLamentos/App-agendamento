
import React, { useState, useEffect } from 'react';
import { User, AuditTicket } from '../types';
import { authService } from '../services/authService';
import { auditService } from '../services/auditService';

const ROLE_ADMIN = 'Admin';
const ROLE_MANAGER = 'Gestor';
const ROLE_ANALYST = 'Analista';

interface LayoutProps {
  user: User;
  onRoleSwitch: () => void;
  onGroupSwitch: (groupId: string) => void;
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const LogoDynamic = ({ groupId }: { groupId: string }) => {
  const prefix = groupId.charAt(0);
  const suffix = groupId.substring(1);
  return (
    <div className="flex items-center font-black tracking-tighter text-2xl">
      <span className="text-white">{prefix}</span>
      <span className="text-claro-red">{suffix}</span>
    </div>
  );
};

const Layout: React.FC<LayoutProps> = ({
  user,
  onRoleSwitch,
  onGroupSwitch,
  children,
  activeTab,
  setActiveTab
}) => {
  const [reportsExpanded, setReportsExpanded] = useState(activeTab.startsWith('reports-'));
  const [lastTickets, setLastTickets] = useState<AuditTicket[]>([]);
  const [highlightUpdates, setHighlightUpdates] = useState(false);
  const availableGroups = ['G1', 'G2', 'G3', 'G4', 'G5'];

  useEffect(() => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const loadLastTicket = () => {
    const allTickets = auditService.getTickets();

    const visibleTickets = allTickets
      .filter(t => user.role === ROLE_ADMIN || t.groupId === user.groupId)
      .filter(t => (t.action || '').toUpperCase() !== 'LOGIN REALIZADO (PRIMEIRO NOME)')
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

    const nextTickets = visibleTickets.slice(0, 3);

    setLastTickets(prev => {
      const previousFirst = prev[0]?.ticketId;
      const nextFirst = nextTickets[0]?.ticketId;

      if (previousFirst && nextFirst && previousFirst !== nextFirst) {
        setHighlightUpdates(true);

        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => setHighlightUpdates(false), 2200);
      }

      return nextTickets;
    });
  };

  loadLastTicket();

  window.addEventListener('audit-updated', loadLastTicket);

  return () => {
    window.removeEventListener('audit-updated', loadLastTicket);
    if (timeoutId) clearTimeout(timeoutId);
  };
}, [user]);

const formatHeaderTicketTime = (value?: string) => {
  if (!value) return 'SEM DATA';

  try {
    return new Date(value).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return value;
  }
};

  const tabs = [
  { id: 'overview', label: 'Visão Geral', icon: '📊', roles: [ROLE_ADMIN, ROLE_MANAGER, ROLE_ANALYST] },
  { id: 'agenda', label: 'Agenda', icon: '📅', roles: [ROLE_ADMIN, ROLE_MANAGER, ROLE_ANALYST] },
  { id: 'classes', label: 'Turmas e Técnicos', icon: '👥', roles: [ROLE_ADMIN, ROLE_MANAGER, ROLE_ANALYST] },

  // NOVO MENU
  { id: 'score', label: 'Score / Carga', icon: '📈', roles: [ROLE_ADMIN, ROLE_MANAGER, ROLE_ANALYST] },

  { id: 'audit', label: 'Tickets (Auditoria)', icon: '🛡️', roles: [ROLE_ADMIN, ROLE_MANAGER, ROLE_ANALYST] },
    { id: 'powerapps-import', label: 'Importar Resultados', icon: '📥', roles: [ROLE_ADMIN, ROLE_MANAGER] },
];

  const reportSubTabs = [
    { id: 'reports-operational', label: 'Dashboard Operacional', icon: '📈' },
    { id: 'reports-quality', label: 'Qualidade & Conformidade', icon: '✅' },
    { id: 'reports-capacity-risk', label: 'Capacidade & Risco', icon: '🔋' },
    { id: 'reports-brazil-map', label: 'Mapa Brasil', icon: '🗺️' },
  ];

  const handleLogout = () => {
    if (confirm("Deseja realmente sair do sistema?")) {
      authService.logout();
    }
  };

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">
      <aside className="w-64 bg-slate-900 text-white flex flex-col">
        <div className="p-8 border-b border-white/5 flex flex-col items-center">
          <LogoDynamic groupId={user.groupId} />
          <h1 className="text-[10px] font-black tracking-tight text-white/40 mt-2 uppercase text-center">ETN {user.groupId} - Treinamento CLARO</h1>
        </div>

        <nav className="flex-1 px-4 py-8 space-y-1.5 overflow-y-auto">
          {tabs.filter(t => t.roles.includes(user.role)).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center px-4 py-3.5 text-xs font-black rounded-xl transition-all uppercase tracking-wider ${
                activeTab === tab.id 
                  ? 'bg-claro-red text-white shadow-[0_10px_20px_rgba(155,0,0,0.3)]' 
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <span className="mr-3 text-lg opacity-80">{tab.icon}</span>
              {tab.label}
            </button>
          ))}

          {(user.role === ROLE_ADMIN ||
  user.role === ROLE_MANAGER ||
  user.role === ROLE_ANALYST) && (
            <div className="pt-4">
              <button 
                onClick={() => setReportsExpanded(!reportsExpanded)}
                className={`w-full flex items-center justify-between px-4 py-3.5 text-xs font-black rounded-xl transition-all uppercase tracking-wider ${
                  activeTab.startsWith('reports-') ? 'text-white' : 'text-slate-500 hover:text-white'
                }`}
              >
                <div className="flex items-center">
                  <span className="mr-3 text-lg opacity-80">📈</span>
                  RELATÓRIOS
                </div>
                <span className={`text-[10px] transition-transform ${reportsExpanded ? 'rotate-180' : ''}`}>▼</span>
              </button>
              
              {reportsExpanded && (
                <div className="mt-1 space-y-1 ml-4 border-l-2 border-white/5">
                  {reportSubTabs.map(sub => (
                    <button
                      key={sub.id}
                      onClick={() => setActiveTab(sub.id)}
                      className={`w-full flex items-center px-4 py-3 text-[10px] font-black rounded-xl transition-all uppercase tracking-widest ${
                        activeTab === sub.id 
                          ? 'text-claro-red' 
                          : 'text-slate-500 hover:text-white'
                      }`}
                    >
                      <span className="mr-2 opacity-80">{sub.icon}</span>
                      {sub.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {(user.role === ROLE_ADMIN || user.role === ROLE_MANAGER) && (
  <div className="pt-4 border-t border-white/10 mt-4 space-y-1.5">
    <button
      onClick={() => setActiveTab('bases-integration')}
      className={`w-full flex items-center px-4 py-3.5 text-xs font-black rounded-xl transition-all uppercase tracking-wider ${
        activeTab === 'bases-integration'
          ? 'bg-claro-red text-white shadow-lg'
          : 'text-red-300 hover:bg-claro-red/10 hover:text-white'
      }`}
    >
      <span className="mr-3 text-lg opacity-80">🏢</span>
      BASES & INTEGRAÇÃO
    </button>
    <button
  onClick={() => setActiveTab('base-collective-schedule')}
  className={`w-full flex items-center px-4 py-3.5 text-xs font-black rounded-xl transition-all uppercase tracking-wider ${
    activeTab === 'base-collective-schedule'
      ? 'bg-blue-600 text-white shadow-lg'
      : 'text-blue-300 hover:bg-blue-500/10 hover:text-white'
  }`}
>
  <span className="mr-3 text-lg opacity-80">📍</span>
  DATAS FIXAS
</button>

    {user.role === ROLE_ADMIN && (
      <button
        onClick={() => setActiveTab('admin')}
        className={`w-full flex items-center px-4 py-3.5 text-xs font-black rounded-xl transition-all uppercase tracking-wider ${
          activeTab === 'admin'
            ? 'bg-emerald-600 text-white shadow-lg'
            : 'text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300'
        }`}
      >
        <span className="mr-3 text-lg opacity-80">🛡️</span>
        ADMINISTRAÇÃO
      </button>
    )}
  </div>
)}
</nav>
        <div className="p-6 border-t border-white/5 bg-black/20">
          <div className="space-y-4">
            <div>
              <label className="text-[8px] font-black text-slate-500 uppercase block mb-1.5 tracking-widest">Identidade Ativa</label>
              <div className="bg-white/5 rounded-xl py-2.5 px-3 text-[10px] text-slate-200 font-black border border-white/5 truncate">
                {user.fullName.split(' ')[0].toUpperCase()}
              </div>
            </div>
           <div>
  <label className="text-[8px] font-black text-slate-500 uppercase block mb-1.5 tracking-widest">
    Grupo Ativo
  </label>

  {user.isGlobalAdmin ? (
    <select
      value={user.groupId}
      onChange={(e) => onGroupSwitch(e.target.value)}
      className="w-full bg-claro-red/10 rounded-xl py-2.5 px-3 text-[10px] text-claro-red font-black border border-claro-red/20 uppercase outline-none cursor-pointer"
    >
      {availableGroups.map(group => (
        <option key={group} value={group}>
          {group} - ADMIN GLOBAL
        </option>
      ))}
    </select>
  ) : (
    <div className="bg-claro-red/10 rounded-xl py-2.5 px-3 text-[10px] text-claro-red font-black border border-claro-red/20 uppercase">
      {user.groupId} - {user.role}
    </div>
  )}
</div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-10 shrink-0">
  <h2 className="text-sm font-black text-slate-900 uppercase tracking-[0.2em]">
  {activeTab === 'admin'
  ? 'Painel de Controle Nacional'
  : activeTab === 'bases-integration'
? 'Bases & Integração PowerApps'
: activeTab === 'base-collective-schedule'
? 'Datas Fixas Presenciais por Base'
  : activeTab === 'score'
  ? 'Monitoramento de Score'
  : 'Gestão Operacional'}
</h2>

  <div className="flex items-center space-x-6">
    <div
  className={`hidden xl:flex items-start gap-3 border rounded-2xl px-4 py-3 max-w-[520px] transition-all duration-500 ${
    highlightUpdates
      ? 'bg-emerald-50 border-emerald-300 shadow-[0_0_0_4px_rgba(16,185,129,0.10)] scale-[1.02]'
      : 'bg-slate-50 border-slate-200'
  }`}
>
  
  <span
  className={`w-2 h-2 rounded-full mt-1 transition-all duration-300 ${
    highlightUpdates ? 'bg-emerald-500 animate-ping' : 'bg-emerald-500 animate-pulse'
  }`}
></span>

  <div className="min-w-0 flex-1">
    
    <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">
      Últimas atualizações
    </div>

    {lastTickets.length === 0 && (
      <div className="text-[10px] text-slate-500 font-bold">
        Nenhuma movimentação
      </div>
    )}

    <div className="space-y-1">
      {lastTickets.map((t, index) => (
        <div key={index} className="text-[10px] text-slate-700 font-bold truncate">
          <span className="text-slate-900">
            {formatHeaderTicketTime(t.timestamp)}
          </span>
          {' • '}
          <span className="uppercase">
            {(t.userName || 'SISTEMA').split(' ')[0]}
          </span>
          {' - '}
          <span className="text-slate-500">
            {t.reason}
          </span>
        </div>
      ))}
    </div>

  </div>
</div>

    <div className="flex flex-col items-end">
      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
        {user.groupId} Central de Comando
      </span>
      <span className="text-[10px] font-black text-emerald-600 uppercase flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
        Sincronizado Nacional
      </span>
    </div>

    <button
      onClick={handleLogout}
      className="bg-slate-900 text-white text-[10px] font-black px-6 py-2.5 rounded-xl uppercase tracking-widest hover:bg-claro-red transition-all shadow-lg"
    >
      Logout
    </button>
  </div>
</header>
        <div className="flex-1 overflow-y-auto p-10 bg-slate-50">
          <div className="max-w-[1600px] mx-auto">{children}</div>
        </div>
      </main>
    </div>
  );
};

export default Layout;
