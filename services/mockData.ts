
import { 
  User, UserRole, CertificationCity, AnalystProfile, ExpertiseType, 
  Technician, EventSchedule, TrainingClass, TrainingStatus, ParticipationStatus, ApprovalStatus, CertificationProcessStatus
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
    id: `city-${name}`, name, uf: 'RS', defaultType: ExpertiseType.PRESENTIAL, responsibleAnalystIds: ['ap1', 'ap3', 'ap7']
  })),
  // FLORIANÓPOLIS - SC
  ...['FLORIANOPOLIS', 'SAO JOSE', 'PALHOCA', 'BIGUACU'].map(name => ({
    id: `city-${name}`, name, uf: 'SC', defaultType: ExpertiseType.PRESENTIAL, responsibleAnalystIds: ['ap5', 'ap2']
  })),
  // JOINVILLE - SC
  ...['JOINVILLE', 'BLUMENAU', 'ITAJAI', 'BALNEARIO CAMBORIU', 'GUARAMIRIM', 'POMERODE'].map(name => ({
    id: `city-${name}`, name, uf: 'SC', defaultType: ExpertiseType.PRESENTIAL, responsibleAnalystIds: ['ap8']
  })),
  // CURITIBA - PR
  ...['CURITIBA', 'SAO JOSE DOS PINHAIS', 'COLOMBO', 'ALMIRANTE TAMANDARE', 'PINHAIS'].map(name => ({
    id: `city-${name}`, name, uf: 'PR', defaultType: ExpertiseType.PRESENTIAL, responsibleAnalystIds: ['ap4']
  })),
  // LONDRINA - PR
  ...['LONDRINA', 'ARAPONGAS', 'ROLANDIA', 'MARINGA', 'IBIPORA', 'CIANORTE', 'CAMBE'].map(name => ({
    id: `city-${name}`, name, uf: 'PR', defaultType: ExpertiseType.PRESENTIAL, responsibleAnalystIds: ['ap6']
  })),
  // BRASÍLIA - DF
  ...['BRASILIA', 'TAGUATINGA', 'VALPARAISO DE GOIAS', 'CEILANDIA', 'SOBRADINHO'].map(name => ({
    id: `city-${name}`, name, uf: 'DF', defaultType: ExpertiseType.PRESENTIAL, responsibleAnalystIds: ['ap13']
  })),
  // GOIÂNIA - GO
  ...['GOIANIA', 'APARECIDA DE GOIANIA', 'TRINDADE', 'ANAPOLIS', 'GOIANAPOLIS'].map(name => ({
    id: `city-${name}`, name, uf: 'GO', defaultType: ExpertiseType.PRESENTIAL, responsibleAnalystIds: ['ap12']
  })),
  // CUIABÁ - MT
  ...['CUIABA', 'CAMPO VERDE', 'VARZEA GRANDE'].map(name => ({
    id: `city-${name}`, name, uf: 'MT', defaultType: ExpertiseType.PRESENTIAL, responsibleAnalystIds: ['ap9']
  })),
  // MANAUS - AM
  { id: 'city-MANAUS', name: 'MANAUS', uf: 'AM', defaultType: ExpertiseType.PRESENTIAL, responsibleAnalystIds: ['ap10'] },
  // BELÉM - PA
  ...['BELEM', 'ANANINDEUA'].map(name => ({
    id: `city-${name}`, name, uf: 'PA', defaultType: ExpertiseType.PRESENTIAL, responsibleAnalystIds: ['ap11']
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

const generateCPF = (seed: number) => {
  const s = String(seed).padStart(9, '0');
  let d1 = 0;
  for (let i = 0; i < 9; i++) d1 += parseInt(s[i]) * (10 - i);
  d1 = 11 - (d1 % 11);
  if (d1 >= 10) d1 = 0;
  let d2 = d1 * 2;
  for (let i = 0; i < 9; i++) d2 += parseInt(s[i]) * (11 - i);
  d2 = 11 - (d2 % 11);
  if (d2 >= 10) d2 = 0;
  return `${s.substring(0, 3)}.${s.substring(3, 6)}.${s.substring(6, 9)}-${d1}${d2}`;
};

const firstNames = ["Lucas", "Gabriel", "Matheus", "Enzo", "Guilherme", "Nicolas", "Rafael", "Gustavo", "Felipe", "Samuel", "João", "Pedro", "Vitor", "Leonardo", "Bruno", "Tiago", "Rodrigo", "Fábio", "Marcelo", "André", "Ricardo", "Fernando", "Daniel", "Alexandre", "Roberto", "Marcos", "Paulo", "Carlos", "José", "Antônio", "Luiz", "Francisco", "Manoel", "Sebastião", "Jorge", "Mário", "Sérgio", "Cláudio", "Ronaldo", "Edson", "Adilson", "Valter", "Nilton", "Milton", "Ailton", "Gilberto", "Humberto", "Osvaldo", "Raimundo"];
const lastNames = ["Silva", "Santos", "Oliveira", "Souza", "Rodrigues", "Ferreira", "Alves", "Pereira", "Lima", "Gomes", "Costa", "Ribeiro", "Martins", "Carvalho", "Almeida", "Lopes", "Soares", "Fernandes", "Vieira", "Barbosa", "Rocha", "Dias", "Nascimento", "Andrade", "Moreira", "Nunes", "Marques", "Machado", "Mendes", "Freitas", "Cardoso", "Ramos", "Santana", "Teixeira", "Moura", "Cavalcanti", "Borges", "Melo", "Aragão", "Pinto", "Campos", "Coelho", "Bezerra", "Correia", "Tavares", "Garcia", "Fonseca", "Rezende", "Barros", "Guimarães"];
const cityList = ["PORTO ALEGRE", "CANOAS", "NOVO HAMBURGO", "FLORIANOPOLIS", "JOINVILLE", "CURITIBA", "LONDRINA", "BRASILIA", "GOIANIA", "CUIABA", "MANAUS", "BELEM"];

export const mockClasses: TrainingClass[] = [
  { id: 'class-test-001', groupId: 'G3', classNumber: 'TURMA-TESTE-001', title: 'GPON — TESTE — TURMA-TESTE-001', subcategory: 'TESTE', type: 'GPON', requiresCert: true, locationId: 'REMOTO', clientCompany: 'CLARO', startDate: now, endDate: now, responsibleAnalystId: 'u3', status: TrainingStatus.IN_PROGRESS, createdAt: now, createdBy: 'SISTEMA' },
  { id: 'class-test-002', groupId: 'G3', classNumber: 'TURMA-TESTE-002', title: 'HFC — TESTE — TURMA-TESTE-002', subcategory: 'TESTE', type: 'HFC', requiresCert: true, locationId: 'REMOTO', clientCompany: 'CLARO', startDate: now, endDate: now, responsibleAnalystId: 'u4', status: TrainingStatus.IN_PROGRESS, createdAt: now, createdBy: 'SISTEMA' },
  { id: 'class-test-003', groupId: 'G3', classNumber: 'TURMA-TESTE-003', title: 'GPON — TESTE — TURMA-TESTE-003', subcategory: 'TESTE', type: 'GPON', requiresCert: true, locationId: 'REMOTO', clientCompany: 'CLARO', startDate: now, endDate: now, responsibleAnalystId: 'u5', status: TrainingStatus.IN_PROGRESS, createdAt: now, createdBy: 'SISTEMA' },
  { id: 'class-test-004', groupId: 'G3', classNumber: 'TURMA-TESTE-004', title: 'OUTROS — TESTE — TURMA-TESTE-004', subcategory: 'TESTE', type: 'OUTROS', requiresCert: true, locationId: 'REMOTO', clientCompany: 'CLARO', startDate: now, endDate: now, responsibleAnalystId: 'u6', status: TrainingStatus.IN_PROGRESS, createdAt: now, createdBy: 'SISTEMA' },
  { id: 'class-test-005', groupId: 'G3', classNumber: 'TURMA-TESTE-005', title: 'GPON — TESTE — TURMA-TESTE-005', subcategory: 'TESTE', type: 'GPON', requiresCert: true, locationId: 'REMOTO', clientCompany: 'CLARO', startDate: now, endDate: now, responsibleAnalystId: 'u7', status: TrainingStatus.PLANNED, createdAt: now, createdBy: 'SISTEMA' },
];

const generateTechs = () => {
  const techs: Technician[] = [];
  const distributions = [
    { classId: 'class-test-001', count: 20 },
    { classId: 'class-test-002', count: 15 },
    { classId: 'class-test-003', count: 10 },
    { classId: 'class-test-004', count: 5 },
  ];

  let globalId = 1;
  distributions.forEach(dist => {
    for (let i = 0; i < dist.count; i++) {
      const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
      const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
      
      // Escolher cidade aleatória do mockCities para garantir coerência
      const cityObj = mockCities[Math.floor(Math.random() * mockCities.length)];
      const cpf = generateCPF(100000000 + globalId);
      
      const statusList = [
        CertificationProcessStatus.QUALIFIED_AWAITING,
        CertificationProcessStatus.BACKLOG_PENDING,
        CertificationProcessStatus.NOT_QUALIFIED_EAD,
        CertificationProcessStatus.QUALIFIED_AWAITING
      ];
      const processStatus = statusList[Math.floor(Math.random() * statusList.length)];

      techs.push({
        id: `tech-test-${globalId}`,
        groupId: 'G3',
        name: `${firstName} ${lastName}`,
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
        cpf: cpf,
        phone: `(11) 9${Math.floor(10000000 + Math.random() * 90000000)}`,
        city: cityObj.name,
        state: cityObj.uf,
        company: 'PARCEIRA TESTE',
        externalLogin: `LOGIN${globalId}`,
        solicitor: 'GESTOR TESTE',
        certificationType: Math.random() > 0.5 ? 'PRESENCIAL' : 'VIRTUAL',
        trainingClassId: dist.classId,
        participationStatus: ParticipationStatus.PRESENT,
        eadExamScore: 70 + Math.floor(Math.random() * 30),
        finalTrainingScore: 70 + Math.floor(Math.random() * 30),
        eadApprovalStatus: ApprovalStatus.APPROVED,
        generalApprovalStatus: ApprovalStatus.APPROVED,
        certificationProcessStatus: processStatus,
        certificationReproofCount: 0,
        generateCertification: true,
        unique_key: cpf,
        status_principal: processStatus === CertificationProcessStatus.BACKLOG_PENDING ? 'BACKLOG AGUARDANDO' : 'PENDENTE_CERTIFICAÇÃO'
      });
      globalId++;
    }
  });
  return techs;
};

export const mockTechnicians: Technician[] = generateTechs();
export const mockEvents: EventSchedule[] = [];
