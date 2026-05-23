import * as XLSX from 'xlsx';

export interface PowerAppsResult {
  NomeTecnico: string;
  StatusTecnico: string;
  Empresa?: string;
  Município?: string;
  UF?: string;
  AnalistaResponsavel?: string;
  DataCertificacao?: string;
  ProcessadoNoApp?: string;
  ResultadoIntegracao?: string;
}

export async function importPowerAppsExcel(file: File) {
  const buffer = await file.arrayBuffer();

  const workbook = XLSX.read(buffer, {
    type: 'array'
  });

  const sheet =
    workbook.Sheets['tbl_powerapps_emails'] ||
    workbook.Sheets[workbook.SheetNames[0]];

  const rows: PowerAppsResult[] =
    XLSX.utils.sheet_to_json(sheet);

  return rows.filter((row) => {
    const processado = String(
      row.ProcessadoNoApp || ''
    )
      .trim()
      .toUpperCase();

    const resultado = String(
      row.ResultadoIntegracao || ''
    )
      .trim()
      .toUpperCase();

    return (
      processado === 'NÃO' &&
      resultado === 'AGUARDANDO_APP'
    );
  });
}
