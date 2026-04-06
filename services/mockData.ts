
import { 
  User, UserRole, CertificationCity, AnalystProfile, ExpertiseType, 
  Technician, EventSchedule
} from '../types';

const now = new Date().toISOString();

export const mockUsers: User[] = [
  // Fix User type errors by adding missing properties: firstNameLogin
  { id: 'u1', email: 'admin@certitech.com', fullName: 'ADMINISTRADOR SISTEMA', role: UserRole.ADMIN, normalizedLogin: 'ADMINISTRADOR', firstNameLogin: 'ADMINISTRADOR', passwordHash: btoa('salt_2512_G3'), groupId: 'G3', active: true, createdAt: now, updatedAt: now },
  { id: 'u2', email: 'denilson@certitech.com', fullName: 'DENILSON GESTOR', role: UserRole.MANAGER, normalizedLogin: 'DENILSON', firstNameLogin: 'DENILSON', passwordHash: btoa('salt_Claro@123_G3'), groupId: 'G3', active: true, createdAt: now, updatedAt: now },
  { id: 'u3', email: 'elton@certitech.com', fullName: 'ELTON MENDES', role: UserRole.ANALYST, analystProfileId: 'ap1', normalizedLogin: 'ELTON', firstNameLogin: 'ELTON', passwordHash: btoa('salt_Claro@123_G3'), groupId: 'G3', active: true, createdAt: now, updatedAt: now },
  { id: 'u4', email: 'fabio@certitech.com', fullName: 'FÁBIO BRENDLER', role: UserRole.ANALYST, analystProfileId: 'ap2', normalizedLogin: 'FABIO', firstNameLogin: 'FABIO', passwordHash: btoa('salt_Claro@123_G3'), groupId: 'G3', active: true, createdAt: now, updatedAt: now },
  { id: 'u5', email: 'juliano@certitech.com', fullName: 'JULIANO AGLIARDI', role: UserRole.ANALYST, analystProfileId: 'ap3', normalizedLogin: 'JULIANO', firstNameLogin: 'JULIANO', passwordHash: btoa('salt_Claro@123_G3'), groupId: 'G3', active: true, createdAt: now, updatedAt: now },
  { id: 'u6', email: 'reginaldo@certitech.com', fullName: 'REGINALDO MOURA', role: UserRole.ANALYST, analystProfileId: 'ap4', normalizedLogin: 'REGINALDO', firstNameLogin: 'REGINALDO', passwordHash: btoa('salt_Claro@123_G3'), groupId: 'G3', active: true, createdAt: now, updatedAt: now },
  { id: 'u7', email: 'ritierri@certitech.com', fullName: 'RITIERRI BORBA', role: UserRole.ANALYST, analystProfileId: 'ap5', normalizedLogin: 'RITIERRI', firstNameLogin: 'RITIERRI', passwordHash: btoa('salt_Claro@123_G3'), groupId: 'G3', active: true, createdAt: now, updatedAt: now },
  { id: 'u8', email: 'thiago@certitech.com', fullName: 'THIAGO ANDERSON', role: UserRole.ANALYST, analystProfileId: 'ap6', normalizedLogin: 'THIAGO', firstNameLogin: 'THIAGO', passwordHash: btoa('salt_Claro@123_G3'), groupId: 'G3', active: true, createdAt: now, updatedAt: now },
  { id: 'u9', email: 'rodrigo@certitech.com', fullName: 'RODRIGO SANTOS', role: UserRole.ANALYST, analystProfileId: 'ap7', normalizedLogin: 'RODRIGO', firstNameLogin: 'RODRIGO', passwordHash: btoa('salt_Claro@123_G3'), groupId: 'G3', active: true, createdAt: now, updatedAt: now },
  { id: 'u10', email: 'willian@certitech.com', fullName: 'WILLIAN BARBOSA', role: UserRole.ANALYST, analystProfileId: 'ap8', normalizedLogin: 'WILLIAN', firstNameLogin: 'WILLIAN', passwordHash: btoa('salt_Claro@123_G3'), groupId: 'G3', active: true, createdAt: now, updatedAt: now },
  { id: 'u11', email: 'enicio@certitech.com', fullName: 'ENICIO DOS SANTOS', role: UserRole.ANALYST, analystProfileId: 'ap9', normalizedLogin: 'ENICIO', firstNameLogin: 'ENICIO', passwordHash: btoa('salt_Claro@123_G3'), groupId: 'G3', active: true, createdAt: now, updatedAt: now },
  { id: 'u12', email: 'temistocles@certitech.com', fullName: 'TEMISTOCLES NETO', role: UserRole.ANALYST, analystProfileId: 'ap10', normalizedLogin: 'TEMISTOCLES', firstNameLogin: 'TEMISTOCLES', passwordHash: btoa('salt_Claro@123_G3'), groupId: 'G3', active: true, createdAt: now, updatedAt: now },
  { id: 'u13', email: 'marcio@certitech.com', fullName: 'MARCIO QUARESMA', role: UserRole.ANALYST, analystProfileId: 'ap11', normalizedLogin: 'MARCIO', firstNameLogin: 'MARCIO', passwordHash: btoa('salt_Claro@123_G3'), groupId: 'G3', active: true, createdAt: now, updatedAt: now },
  { id: 'u14', email: 'matheus@certitech.com', fullName: 'MATHEUS ELIAS', role: UserRole.ANALYST, analystProfileId: 'ap12', normalizedLogin: 'MATHEUS', firstNameLogin: 'MATHEUS', passwordHash: btoa('salt_Claro@123_G3'), groupId: 'G3', active: true, createdAt: now, updatedAt: now },
  { id: 'u15', email: 'antonyo@certitech.com', fullName: 'ANTONYO DYOGENES', role: UserRole.ANALYST, analystProfileId: 'ap13', normalizedLogin: 'ANTONYO', firstNameLogin: 'ANTONYO', passwordHash: btoa('salt_Claro@123_G3'), groupId: 'G3', active: true, createdAt: now, updatedAt: now },
];

// Mapeamento exato conforme imagem fornecida
export const mockCities: CertificationCity[] = [
  // PORTO ALEGRE - RS
  ...['PORTO ALEGRE', 'CANOAS', 'NOVO HAMBURGO', 'GUAIBA', 'CACHOEIRINHA', 'SAO LEOPOLDO', 'VIAMAO'].map(name => ({
    id: `city-${name}`, name, defaultType: ExpertiseType.PRESENTIAL, responsibleAnalystIds: ['ap1', 'ap3', 'ap7']
  })),
  // FLORIANÓPOLIS - SC
  ...['FLORIANOPOLIS', 'SAO JOSE', 'PALHOCA', 'BIGUACU'].map(name => ({
    id: `city-${name}`, name, defaultType: ExpertiseType.PRESENTIAL, responsibleAnalystIds: ['ap5', 'ap2']
  })),
  // JOINVILLE - SC
  ...['JOINVILLE', 'BLUMENAU', 'ITAJAI', 'BALNEARIO CAMBORIU', 'GUARAMIRIM', 'POMERODE'].map(name => ({
    id: `city-${name}`, name, defaultType: ExpertiseType.PRESENTIAL, responsibleAnalystIds: ['ap8']
  })),
  // CURITIBA - PR
  ...['CURITIBA', 'SAO JOSE DOS PINHAIS', 'COLOMBO', 'ALMIRANTE TAMANDARE', 'PINHAIS'].map(name => ({
    id: `city-${name}`, name, defaultType: ExpertiseType.PRESENTIAL, responsibleAnalystIds: ['ap4']
  })),
  // LONDRINA - PR
  ...['LONDRINA', 'ARAPONGAS', 'ROLANDIA', 'MARINGA', 'IBIPORA', 'CIANORTE', 'CAMBE'].map(name => ({
    id: `city-${name}`, name, defaultType: ExpertiseType.PRESENTIAL, responsibleAnalystIds: ['ap6']
  })),
  // BRASÍLIA - DF
  ...['BRASILIA', 'TAGUATINGA', 'VALPARAISO DE GOIAS', 'CEILANDIA', 'SOBRADINHO'].map(name => ({
    id: `city-${name}`, name, defaultType: ExpertiseType.PRESENTIAL, responsibleAnalystIds: ['ap13']
  })),
  // GOIÂNIA - GO
  ...['GOIANIA', 'APARECIDA DE GOIANIA', 'TRINDADE', 'ANAPOLIS', 'GOIANAPOLIS'].map(name => ({
    id: `city-${name}`, name, defaultType: ExpertiseType.PRESENTIAL, responsibleAnalystIds: ['ap12']
  })),
  // CUIABÁ - MT
  ...['CUIABA', 'CAMPO VERDE', 'VARZEA GRANDE'].map(name => ({
    id: `city-${name}`, name, defaultType: ExpertiseType.PRESENTIAL, responsibleAnalystIds: ['ap9']
  })),
  // MANAUS - AM
  { id: 'city-MANAUS', name: 'MANAUS', defaultType: ExpertiseType.PRESENTIAL, responsibleAnalystIds: ['ap10'] },
  // BELÉM - PA
  ...['BELEM', 'ANANINDEUA'].map(name => ({
    id: `city-${name}`, name, defaultType: ExpertiseType.PRESENTIAL, responsibleAnalystIds: ['ap11']
  })),
];

export const mockAnalystProfiles: AnalystProfile[] = mockUsers
  .filter(u => u.role === UserRole.ANALYST)
  .map(u => ({
    id: u.analystProfileId!,
    userId: u.id,
    expertiseType: ExpertiseType.BOTH,
    coveredCityIds: mockCities.filter(c => c.responsibleAnalystIds.includes(u.analystProfileId!)).map(c => c.id)
  }));

export const mockClasses: any[] = [];
export const mockTechnicians: Technician[] = [];
export const mockEvents: EventSchedule[] = [];
