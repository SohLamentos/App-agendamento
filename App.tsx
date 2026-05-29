
import BaseCollectiveSchedule from './components/BaseCollectiveSchedule';
import { auditService } from './services/auditService';
import React, { useState, useEffect } from 'react';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Agenda from './components/Agenda';
import AdminBasesIntegration from './components/AdminBasesIntegration';
import ClassesManagement from './components/ClassesManagement';
import AuditTickets from './components/AuditTickets';
import ScoreBoard from './components/ScoreBoard';
import OperationalDashboard from './components/Reports/OperationalDashboard';
import QualityReport from './components/Reports/QualityReport';
import CapacityRiskReport from './components/Reports/CapacityRiskReport';
import BrazilMapReport from './components/Reports/BrazilMapReport';
import Login from './components/Login';
import AdminManagement from './components/AdminManagement';
import { dataService } from './services/dataService';
import { authService } from './services/authService';
import { UserRole } from './types';
import PowerAppsImport from './components/PowerAppsImport';


const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(authService.isAuthenticated());
  const [currentUser, setCurrentUser] = useState(authService.getCurrentUser());
  const [activeTab, setActiveTab] = useState('overview');
  const [, setUpdateTrigger] = useState(0);
  const [isInitializing, setIsInitializing] = useState(true);

  const handleRoleSwitch = () => {};
  const handleGroupSwitch = async (groupId: string) => {
  try {
    setIsInitializing(true);

    dataService.setActiveGroup(groupId);

    const loadedFromCloud = await dataService.initializeFromCloud();

    if (!loadedFromCloud) {
      alert(`Não foi possível carregar os dados do grupo ${groupId}.`);
      setIsInitializing(false);
      return;
    }

    await auditService.initialize(groupId);

    setCurrentUser(authService.getCurrentUser());
    setActiveTab('overview');

    window.dispatchEvent(new Event('data-updated'));
  } catch (error) {
    console.error('Erro ao trocar grupo:', error);
    alert('Erro ao trocar grupo. Tente novamente.');
  } finally {
    setIsInitializing(false);
  }
};

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);

    // garante aprovação automática após login
    // dataService.processAutoApprovals();

    setCurrentUser(authService.getCurrentUser());
    setActiveTab('overview');
  };

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const initialize = async () => {

      const loadedFromCloud = await dataService.initializeFromCloud();

if (!loadedFromCloud) {
  alert(
    'Não foi possível carregar os dados do Supabase. O app será bloqueado para evitar sobrescrever agendamentos.'
  );

  setIsInitializing(false);
  return;
}

const authUser = authService.getCurrentUser();

if (!authUser) {
  setIsAuthenticated(false);
  setIsInitializing(false);
  return;
}

await auditService.initialize(authUser.groupId);

      // roda somente depois que a nuvem carregou
      // if (authService.isAuthenticated()) {
        // dataService.processAutoApprovals();
      // }

      unsubscribe = dataService.subscribeToCloudUpdates();
      setCurrentUser(authUser);
      setIsInitializing(false);
    };

    initialize();



    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  useEffect(() => {
  const validateSession = async () => {
    const current = authService.getCurrentUser();

    if (!current) {
      setIsAuthenticated(false);
      return;
    }

    setCurrentUser(current);
  };

  validateSession();
}, []);

  useEffect(() => {
    const handleUpdate = () => {
      setUpdateTrigger(prev => prev + 1);
      setCurrentUser(authService.getCurrentUser());
    };

    window.addEventListener('data-updated', handleUpdate);
    return () => window.removeEventListener('data-updated', handleUpdate);
  }, []);

  useEffect(() => {
  let warningTimer: ReturnType<typeof setTimeout>;
  let reloadTimer: ReturnType<typeof setTimeout>;

  const resetInactivityTimers = () => {
    clearTimeout(warningTimer);
    clearTimeout(reloadTimer);

    warningTimer = setTimeout(() => {
      alert(
        'Sua tela ficou parada por muito tempo. Os dados serão sincronizados para evitar perda de agendamentos.'
      );
    }, 20 * 60 * 1000);

    reloadTimer = setTimeout(async () => {
      await dataService.initializeFromCloud();
const authUser = authService.getCurrentUser();

if (authUser) {
  await auditService.refresh(authUser.groupId);
}
window.dispatchEvent(new Event('data-updated'));
      
    }, 30 * 60 * 1000);
  };

  const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];

  events.forEach(event =>
    window.addEventListener(event, resetInactivityTimers)
  );

  resetInactivityTimers();

  return () => {
    clearTimeout(warningTimer);
    clearTimeout(reloadTimer);

    events.forEach(event =>
      window.removeEventListener(event, resetInactivityTimers)
    );
  };
}, []);

  if (isInitializing) {
    return <div>Carregando...</div>;
  }

  if (!isAuthenticated) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'overview': return <Dashboard user={currentUser} />;
      case 'agenda': return <Agenda user={currentUser} />;
      case 'classes': return <ClassesManagement user={currentUser} />;
      case 'score': return <ScoreBoard user={currentUser} />;
      case 'audit': return <AuditTickets user={currentUser} />;
      case 'bases-integration': return <AdminBasesIntegration user={currentUser} />;
        case 'agenda-settings':
  return <AgendaSettings user={currentUser} />;
      case 'base-collective-schedule':
  return (
    <BaseCollectiveSchedule
      bases={dataService.getIntegrationBases()}
      analysts={dataService.getUsers().filter((u: any) =>
        u.active === true &&
        (
          String(currentUser.role).toUpperCase() === 'ADMIN' ||
          u.groupId === currentUser.groupId
        )
      )}
    />
  );
      case 'reports-operational': return <OperationalDashboard />;
      case 'reports-quality': return <QualityReport />;
      case 'reports-capacity-risk': return <CapacityRiskReport />;
      case 'reports-brazil-map': return <BrazilMapReport />;
      case 'powerapps-import':
  return <PowerAppsImport />;
      case 'admin': return <AdminManagement />;
      default: return <Dashboard user={currentUser} />;
    }
  };

  return (
    <Layout
  user={currentUser}
  onRoleSwitch={handleRoleSwitch}
  onGroupSwitch={handleGroupSwitch}
  activeTab={activeTab}
  setActiveTab={setActiveTab}
>
      {renderContent()}
    </Layout>
  );
};

export default App;
