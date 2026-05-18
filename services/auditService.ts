import { AuditTicket, User } from '../types';
import { supabase } from './supabase';

class AuditService {
  private tickets: AuditTicket[] = [];
  private initializedGroupId: string | null = null;

  private mapRowToTicket(row: any): AuditTicket {
    return {
      ticketId: row.ticket_id,
      timestamp: row.timestamp,
      userName: row.user_name,
      userRole: row.user_role,
      groupId: row.group_id,
      action: row.action,
      targetType: row.target_type,
      targetValue: row.target_value,
      before: row.before_value || '',
      after: row.after_value || '',
      reason: row.reason || '',
      screen: row.screen || 'SISTEMA',
      subReason: row.sub_reason || undefined,
      categoryReproof: row.category_reproof || undefined,
      forcado: row.forcado || false,
      regrasBurladas: row.regras_burladas || [],
    } as AuditTicket;
  }

  private mapTicketToRow(ticket: AuditTicket) {
    return {
      ticket_id: ticket.ticketId,
      timestamp: ticket.timestamp,
      user_name: ticket.userName,
      user_role: ticket.userRole,
      group_id: ticket.groupId,
      action: ticket.action,
      target_type: ticket.targetType,
      target_value: ticket.targetValue,
      before_value: ticket.before || '',
      after_value: ticket.after || '',
      reason: ticket.reason || '',
      screen: ticket.screen || 'SISTEMA',
      sub_reason: ticket.subReason || null,
      category_reproof: ticket.categoryReproof || null,
      forcado: ticket.forcado || false,
      regras_burladas: ticket.regrasBurladas || [],
    };
  }

  private buildDefaultReason(params: {
    action: string;
    targetType: string;
    targetValue: string;
    reason?: string;
  }) {
    if (params.reason && params.reason.trim()) return params.reason;
    return `${params.action} em ${params.targetType}: ${params.targetValue}`;
  }

  async initialize(groupId: string) {
    this.initializedGroupId = groupId;
    await this.refresh(groupId);
  }

  async refresh(groupId?: string) {
    const groupToLoad = groupId || this.initializedGroupId || 'G3';

    const { data, error } = await supabase
      .from('audit_tickets')
      .select('*')
      .eq('group_id', groupToLoad)
      .order('timestamp', { ascending: false })
      .limit(1000);

    if (error) {
      console.error('Erro ao carregar auditoria do Supabase:', error);

      const saved = localStorage.getItem('certitech_audit_tickets');
      this.tickets = saved ? JSON.parse(saved) : [];

      window.dispatchEvent(new Event('audit-updated'));
      return;
    }

    this.tickets = (data || []).map(row => this.mapRowToTicket(row));
    localStorage.setItem('certitech_audit_tickets', JSON.stringify(this.tickets));

    window.dispatchEvent(new Event('audit-updated'));
  }

  logTicket(params: {
    user: User;
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
    const newTicket: AuditTicket = {
      ticketId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      userName: params.user?.fullName || 'SYSTEM',
      userRole: params.user?.role || 'SYSTEM',
      groupId: params.groupId ?? params.user?.groupId ?? 'G3',
      action: params.action,
      targetType: params.targetType,
      targetValue: params.targetValue,
      before: params.before || '',
      after: params.after || '',
      reason: this.buildDefaultReason(params),
      screen: params.screen || 'SISTEMA',
      subReason: params.subReason,
      categoryReproof: params.categoryReproof,
      forcado: params.forcado,
      regrasBurladas: params.regrasBurladas || [],
    } as AuditTicket;

    this.tickets.unshift(newTicket);
    localStorage.setItem('certitech_audit_tickets', JSON.stringify(this.tickets));
    window.dispatchEvent(new Event('audit-updated'));

    supabase
      .from('audit_tickets')
      .insert([this.mapTicketToRow(newTicket)])
      .then(({ error }) => {
        if (error) {
          console.error('Erro ao gravar auditoria no Supabase:', error);
        }
      });

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
      'Grupo',
      'Acao',
      'AlvoTipo',
      'AlvoValor',
      'Antes',
      'Depois',
      'Motivo',
      'Tela',
    ];

    const rows = this.tickets.map(t => [
      t.ticketId,
      new Date(t.timestamp).toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
      }),
      t.userName,
      t.userRole,
      t.groupId,
      t.action,
      t.targetType,
      t.targetValue,
      `"${String(t.before || '').replace(/"/g, '""')}"`,
      `"${String(t.after || '').replace(/"/g, '""')}"`,
      `"${String(t.reason || '').replace(/"/g, '""')}"`,
      t.screen,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      headers.join(',') +
      '\n' +
      rows.map(e => e.join(',')).join('\n');

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
