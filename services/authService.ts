
import { User, UserRole } from '../types';
import { dataService } from './dataService';
import { auditService } from './auditService';

class AuthService {
  private maxAttempts = 5;
  private lockoutTime = 30000;

  private normalize(name: string): string {
    if (!name) return "";
    return name.trim().replace(/\s+/g, ' ').toUpperCase();
  }

  private extractFirstName(name: string): string {
    const normalized = this.normalize(name);
    return normalized.split(' ')[0];
  }

  async authenticate(username: string, password: string): Promise<User> {
    const loginFirstName = this.extractFirstName(username);
    
    // 1) ADMIN Rule
    if (loginFirstName === "ADMIN") {
      if (password === "2512") {
        const adminUser = dataService.getUsers().find(u => u.role === UserRole.ADMIN) || {
          id: 'u-admin',
          fullName: 'ADMINISTRADOR',
          normalizedLogin: 'ADMINISTRADOR',
          firstNameLogin: 'ADMIN',
          email: 'admin@claro.com.br',
          role: UserRole.ADMIN,
          groupId: 'G3',
          passwordHash: btoa('salt_2512_G3'),
          active: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        this.setSession(adminUser);
        return adminUser;
      }
      throw new Error("SENHA ADMINISTRATIVA INCORRETA.");
    }

    // 2) Manager/Analyst Rule
    if (password !== "Claro@123") {
      throw new Error("Senha inválida.");
    }

    const matchedUsers = dataService.getUsers().filter(u => 
      u.firstNameLogin === loginFirstName && 
      u.active === true && 
      (u.role === UserRole.MANAGER || u.role === UserRole.ANALYST)
    );

    if (matchedUsers.length === 0) {
      throw new Error("Usuário não cadastrado ou inativo.");
    }

    if (matchedUsers.length > 1) {
      throw new Error(`Login duplicado para ${loginFirstName}. Procure o ADMIN para ajustar (ex: ${loginFirstName} SILVA).`);
    }

    const user = matchedUsers[0];
    this.setSession(user);
    
    auditService.logTicket({
      user,
      action: 'Login Realizado (Primeiro Nome)',
      targetType: 'Sistema',
      targetValue: user.groupId,
      screen: 'Login'
    });

    return user;
  }

  logout() {
    localStorage.removeItem('certitech_user');
    localStorage.removeItem('certitech_session_active');
    window.location.reload();
  }

  isAuthenticated(): boolean {
    return localStorage.getItem('certitech_session_active') === 'true';
  }

  private setSession(user: User) {
    const firstName = user.firstNameLogin || user.fullName.split(' ')[0].toUpperCase();
    localStorage.setItem('certitech_user', JSON.stringify({
      userId: user.id,
      name: firstName,
      role: user.role,
      groupId: user.groupId,
      managerId: user.managerId
    }));
    localStorage.setItem('certitech_session_active', 'true');
  }
}

export const authService = new AuthService();
