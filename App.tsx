import React, { useState, useEffect } from 'react';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Agenda from './components/Agenda';
import ClassesManagement from './components/ClassesManagement';
import AuditTickets from './components/AuditTickets';
import OperationalDashboard from './components/Reports/OperationalDashboard';
import QualityReport from './components/Reports/QualityReport';
import CapacityRiskReport from './components/Reports/CapacityRiskReport';
import BrazilMapReport from './components/Reports/BrazilMapReport';
import Login from './components/Login';
import AdminManagement from './components/AdminManagement';
import { dataService } from './services/dataService';
import { authService } from './services/authService';
import { UserRole, User } from './types';

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(authService.isAuthenticated());
  const [currentUser, setCurrentUser] = useState<User | undefined>(
    dataService.getCurrentUser() || dataService.getUsers()?.[0]
  );
  const [activeTab, setActiveTab] = useState('overview');
  const [, setUpdateTrigger] = useState(0);

  const handleRoleSwitch = (role: UserRole) => {
    if (!currentUser) return;

    if (currentUser.role === UserRole.ADMIN) {
      const user = dataService.getUsers().find((u) => u.role === role);
      if (user) {
        dataService.setCurrentUser(user);
        setCurrentUser(user);
      }
    }
  };

  const handleLoginSuccess = () => {
    const user = dataService.getCurrentUser() || dataService.getUsers()?.[0];
    setIsAuthenticated(true);
    setCurrentUser(user);
    setActiveTab('overview');
  };

  useEffect(() => {
    if (isAuthenticated) {
      dataService.processAutoApprovals();
    }

    const handleUpdate = () => {
      setUpdateTrigger((prev) => prev + 1);
      const updatedUser = dataService.getCurrentUser() || dataService.getUsers()?.[0];
      setCurrentUser(updatedUser);
    };

    window.addEventListener('data-updated', handleUpdate);
    return () => window.removeEventListener('data-updated', handleUpdate);
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  if (!currentUser) {
    return <div style={{ padding: 24 }}>Carregando usuário...</div>;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return <Dashboard user={currentUser} />;
      case 'agenda':
        return <Agenda user={currentUser} />;
      case 'classes':
        return <ClassesManagement user={currentUser} />;
      case 'audit':
        return <AuditTickets user={currentUser} />;
      case 'reports-operational':
        return <OperationalDashboard />;
      case 'reports-quality':
        return <QualityReport />;
      case 'reports-capacity-risk':
        return <CapacityRiskReport />;
      case 'reports-brazil-map':
        return <BrazilMapReport />;
      case 'admin':
        return <AdminManagement />;
      default:
        return <Dashboard user={currentUser} />;
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
