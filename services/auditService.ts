import { AuditTicket, User, UserRole } from '../types';

class AuditService {
  private tickets: AuditTicket[] = [];

  constructor() {
    try {
      const saved = localStorage.getItem('certitech_audit_tickets');
      this.tickets = saved ? JSON.parse(saved) : [];
    } catch {
      this.tickets = [];
    }
  }

  logTicket(params: {
    user?: User;
    action: string;
    targetType: AuditTicket['targetType'];
    targetValue: string;
    before?: string;
    after?: string;
    reason?: string;
    screen?: string;
    groupId?: string;
    subReason?: string;
    categoryReproof?: string;
    forcado?: boolean;
    regrasBurladas?: string[];
  }) {
    const safeUser = params.user || ({
      id: 'system',
      fullName: 'SISTEMA',
      role: UserRole.ADMIN,
      groupId: 'G3'
    } as User);

    const ticketId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `ticket-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const newTicket: AuditTicket = {
      ticketId,
      timestamp: new Date().toISOString(),
      userName: safeUser.fullName || 'SISTEMA',
      userRole: safeUser.role || UserRole.ADMIN,
      groupId: params.groupId || safeUser.groupId || 'G3',
      action: params.action,
      targetType: params.targetType,
      targetValue: params.targetValue,
      before: params.before || '',
      after: params.after || '',
      reason: params.reason || 'NÃO INFORMADO',
      screen: params.screen || 'SISTEMA',
      subReason: params.subReason,
      categoryReproof: params.categoryReproof,
      forcado: params.forcado,
      regrasBurladas: params.regrasBurladas
    };

    try {
      this.tickets.unshift(newTicket);
      localStorage.setItem('certitech_audit_tickets', JSON.stringify(this.tickets));
      window.dispatchEvent(new Event('audit-updated'));
    } catch (error) {
      console.error('CRITICAL: Falha ao gravar ticket de auditoria no armazenamento local.', error);
    }

    return newTicket;
  }

  getTickets() {
    return [...this.tickets];
  }

  exportToCSV() {
    const headers = [
      'TicketID',
      'DataHora',
      'Usuario',
      'Perfil',
      'Acao',
      'AlvoTipo',
      'AlvoValor',
      'Antes',
      'Depois',
      'Motivo',
      'Tela'
    ];

    const rows = this.tickets.map((t) => [
      t.ticketId,
      new Date(t.timestamp).toLocaleString('pt-BR'),
      t.userName || '',
      t.userRole || '',
      t.action || '',
      t.targetType || '',
      t.targetValue || '',
      `"${(t.before || '').replace(/"/g, '""')}"`,
      `"${(t.after || '').replace(/"/g, '""')}"`,
      `"${(t.reason || '').replace(/"/g, '""')}"`,
      t.screen || ''
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      headers.join(',') +
      '\n' +
      rows.map((e) => e.join(',')).join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `auditoria_tickets_${new Date().toISOString().split('T')[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

export const auditService = new AuditService();
