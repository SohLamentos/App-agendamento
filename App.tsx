
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

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(authService.isAuthenticated());
  const [currentUser, setCurrentUser] = useState(dataService.getCurrentUser());
  const [activeTab, setActiveTab] = useState('overview');
  const [, setUpdateTrigger] = useState(0);
  const [isInitializing, setIsInitializing] = useState(true);

  const handleRoleSwitch = (role: UserRole) => {
    if (currentUser.role === UserRole.ADMIN) {
      const user = dataService.getUsers().find(u => u.role === role);
      if (user) dataService.setCurrentUser(user);
    }
  };

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);

    // garante aprovação automática após login
    dataService.processAutoApprovals();

    setCurrentUser(dataService.getCurrentUser());
    setActiveTab('overview');
  };

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const initialize = async () => {
      await dataService.initializeFromCloud();

      // roda somente depois que a nuvem carregou
      if (authService.isAuthenticated()) {
        dataService.processAutoApprovals();
      }

      unsubscribe = dataService.subscribeToCloudUpdates();
      setCurrentUser(dataService.getCurrentUser());
      setIsInitializing(false);
    };

    initialize();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  useEffect(() => {
    const handleUpdate = () => {
      setUpdateTrigger(prev => prev + 1);
      setCurrentUser(dataService.getCurrentUser());
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
      case 'reports-operational': return <OperationalDashboard />;
      case 'reports-quality': return <QualityReport />;
      case 'reports-capacity-risk': return <CapacityRiskReport />;
      case 'reports-brazil-map': return <BrazilMapReport />;
      case 'admin': return <AdminManagement />;
      default: return <Dashboard user={currentUser} />;
    }
  };

  return (
    <Layout
      user={currentUser}
      onRoleSwitch={handleRoleSwitch}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
    >
      {renderContent()}
    </Layout>
  );
};

export default App;
