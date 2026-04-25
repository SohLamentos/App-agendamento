
import React, { useState, useEffect } from 'react';
import { authService } from '../services/authService';

interface LoginProps {
  onLoginSuccess: () => void;
}

const LogoClaro = () => {
  const [imageError, setImageError] = useState(false);

  return (
    <div className="flex items-center justify-center">
      {!imageError ? (
        <img 
          src="/assets/logo_claro.png" 
          alt="Claro" 
          onError={() => setImageError(true)}
          className="w-full max-w-[140px] h-auto object-contain"
        />
      ) : (
        <div className="h-16 flex items-center justify-center">
          <span className="text-claro-red font-black text-2xl tracking-tighter">CLARO</span>
        </div>
      )}
    </div>
  );
};

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const savedCreds = localStorage.getItem('g3_stored_creds');
    if (savedCreds) {
      try {
        const { u, p } = JSON.parse(atob(savedCreds));
        setUsername(u);
        setPassword(p);
        setRememberMe(true);
      } catch (e) {
        localStorage.removeItem('g3_stored_creds');
      }
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await authService.authenticate(username, password);
      
      if (rememberMe) {
        const creds = btoa(JSON.stringify({ u: username, p: password }));
        localStorage.setItem('g3_stored_creds', creds);
      } else {
        localStorage.removeItem('g3_stored_creds');
      }

      onLoginSuccess();
    } catch (err: any) {
      setError(err.message || "ERRO INESPERADO. TENTE NOVAMENTE.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-[420px] bg-white rounded-[40px] shadow-[0_20px_50px_rgba(155,0,0,0.15)] overflow-hidden animate-in fade-in slide-in-from-bottom-8 duration-500">
        <div className="p-10 pb-6 text-center border-b border-slate-50">
          <LogoClaro />
          <h1 className="text-slate-900 text-sm font-black uppercase tracking-tight mt-6 italic">Acesso Nacional Unificado</h1>
          <p className="text-slate-400 text-[9px] font-bold uppercase mt-1 tracking-widest">Plataforma de Gestão ETN</p>
        </div>

        <div className="p-10 pt-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase ml-1 tracking-widest">Nome Completo (Login)</label>
              <input 
                type="text" 
                required
                autoComplete="username"
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-4 text-sm font-bold uppercase outline-none focus:border-claro-red transition-all"
                placeholder="DIGITE SEU NOME..."
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase ml-1 tracking-widest">Senha de Acesso</label>
              <input 
                type="password" 
                required
                autoComplete="current-password"
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-4 text-sm font-bold outline-none focus:border-claro-red transition-all"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-3 px-1">
              <div className="flex items-center gap-2.5">
                <input 
                  type="checkbox" 
                  id="remember" 
                  className="w-4 h-4 accent-claro-red cursor-pointer rounded"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <label htmlFor="remember" className="text-[10px] font-black text-slate-500 uppercase cursor-pointer select-none tracking-tight">
                  Salvar login e senha neste dispositivo
                </label>
              </div>
              
              {rememberMe && (
                <div className="flex items-start gap-2 bg-amber-50 p-3 rounded-xl border border-amber-100 animate-in slide-in-from-top-1 duration-300">
                  <span className="text-[10px]">⚠️</span>
                  <p className="text-[8px] font-black text-amber-700 uppercase leading-relaxed tracking-tighter">
                    ALERTA DE SEGURANÇA: Utilize esta opção apenas em dispositivos privados. Credenciais serão salvas localmente.
                  </p>
                </div>
              )}
            </div>

            {error && (
              <div className="bg-rose-50 border-2 border-claro-red/10 p-4 rounded-2xl flex items-center gap-3">
                <div className="w-1.5 h-1.5 bg-claro-red rounded-full"></div>
                <p className="text-[10px] font-black text-claro-red uppercase leading-tight tracking-tighter flex-1">{error}</p>
              </div>
            )}

            <button 
              type="submit" 
              disabled={isLoading}
              className="w-full bg-claro-red text-white font-black uppercase py-5 rounded-[24px] shadow-2xl hover:bg-claro-redHover transition-all transform active:scale-[0.98] disabled:opacity-50 mt-4 tracking-widest text-xs"
            >
              {isLoading ? "Validando Credenciais..." : "Entrar no Sistema"}
            </button>
          </form>

          <div className="mt-10 pt-6 border-t border-slate-100">
             <div className="flex justify-between items-center opacity-40">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Versão 3.1.0 Nacional</span>
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">© 2024 CLARO S.A.</span>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
