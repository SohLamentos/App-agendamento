import React, { useRef, useState } from 'react';
import { dataService } from '../services/dataService';

const PowerAppsImport: React.FC = () => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [resumo, setResumo] = useState<any>(null);

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const confirmar = confirm(
      'Confirmar importação dos resultados PowerApps?\n\nO app irá processar apenas linhas com:\nProcessadoNoApp = NÃO\nResultadoIntegracao = AGUARDANDO_APP'
    );

    if (!confirmar) return;

    try {
      setLoading(true);
      const resultado = await dataService.importarResultadoCertificacaoExcel(file);
      setResumo(resultado);

      alert(
        `Importação concluída.\n\n` +
        `Pendentes: ${resultado.pendentes}\n` +
        `Aprovados: ${resultado.aprovados}\n` +
        `Reprovados: ${resultado.reprovados}\n` +
        `No-show: ${resultado.noshow}\n` +
        `Não localizados: ${resultado.naoLocalizados}\n` +
        `Duplicados: ${resultado.duplicados}`
      );
    } catch (error) {
      console.error(error);
      alert('Erro ao importar resultados PowerApps.');
    } finally {
      setLoading(false);
      event.target.value = '';
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-8">
      <h1 className="text-xl font-black text-slate-900 uppercase mb-2">
        Importar Resultados PowerApps
      </h1>

      <p className="text-sm text-slate-500 mb-6">
        Baixe o Excel do SharePoint/OneDrive e importe aqui. O app processará somente os registros pendentes.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={handleFile}
      />

      <button
        disabled={loading}
        onClick={() => inputRef.current?.click()}
        className="bg-blue-600 text-white px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Importando...' : 'Selecionar Excel e Importar'}
      </button>

      {resumo && (
        <div className="mt-8 bg-slate-50 border border-slate-200 rounded-2xl p-5 text-sm">
          <div>Pendentes: <b>{resumo.pendentes}</b></div>
          <div>Aprovados: <b>{resumo.aprovados}</b></div>
          <div>Reprovados: <b>{resumo.reprovados}</b></div>
          <div>No-show: <b>{resumo.noshow}</b></div>
          <div>Não localizados: <b>{resumo.naoLocalizados}</b></div>
          <div>Duplicados: <b>{resumo.duplicados}</b></div>
        </div>
      )}
    </div>
  );
};

export default PowerAppsImport;
