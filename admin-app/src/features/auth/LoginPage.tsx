import { Logo } from "@/shared/components/Logo";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { api, session, type AdminUser } from "@/shared/lib/api";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import wallpaper from "../../../../assets/hero_banner.png";

const inputCls =
  "h-12 rounded-xl border-[#E5E7EB] bg-[#FBFBFC] px-4 text-sm font-medium text-[#1F1F24] placeholder:text-[#8C8C96] focus-visible:ring-[#9B5BF8] [&:-webkit-autofill]:[box-shadow:0_0_0_1000px_#FBFBFC_inset]";

// copiado do LoginPage/LoginForm da loja: arte à esquerda, cartão de login à direita
export function LoginPage() {
  const navigate = useNavigate();
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const root = document.documentElement;
    const antes = root.className;
    root.classList.remove("dark");
    root.classList.add("light");
    return () => { root.className = antes; };
  }, []);

  if (session.token()) return <Navigate to="/dashboard" replace />;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setIsLoading(true);
    setError("");
    try {
      const r = await api<{ accessToken: string; user: AdminUser }>("/auth/login", { method: "POST", body: JSON.stringify({ login, senha }) });
      session.save(r.accessToken, { nome: r.user.nome, email: r.user.email });
      await api("/admin/rtp"); // 403 = conta existe mas não é admin
      navigate("/dashboard", { replace: true });
    } catch (err) {
      session.clear();
      setError((err as { status?: number }).status === 403 ? "Essa conta não tem acesso ao painel admin." : (err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F7FA] text-[#1F1F24] lg:grid lg:grid-cols-[minmax(0,1.08fr)_minmax(440px,0.92fr)]">
      <div className="relative hidden min-h-screen overflow-hidden lg:block">
        <img src={wallpaper} alt="" className="h-full w-full object-cover object-right" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(16,12,28,0.85)_0%,rgba(16,12,28,0.35)_54%,rgba(16,12,28,0.22)_100%)]" />
        <div className="absolute left-12 top-10">
          <Logo size="lg" />
        </div>
        <div className="absolute bottom-12 left-12 max-w-[520px]">
          <h1 className="text-5xl font-bold leading-tight text-white">Painel Orama Games</h1>
          <p className="mt-5 max-w-[440px] text-base font-medium leading-7 text-white/70">
            Acompanhe vendas, lucro por jogo e o RTP de cada jogo em um só lugar.
          </p>
        </div>
      </div>

      <div className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8 lg:px-12">
        <div className="w-full max-w-[460px] animate-fade-in">
          <div className="mb-10 lg:hidden">
            <Logo size="md" />
          </div>
          <div className="mb-9">
            <h1 className="text-3xl font-bold leading-tight text-[#1F1F24] sm:text-4xl">Faça login</h1>
            <p className="mt-3 text-sm font-medium leading-6 text-[#73737D]">Área restrita aos administradores.</p>
          </div>

          <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-[0_18px_60px_rgba(31,31,36,0.08)] sm:p-8">
            <form onSubmit={onSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="login" className="text-sm font-semibold leading-[140%] text-[#1F1F24]">E-mail ou CPF</Label>
                <Input id="login" autoComplete="username" placeholder="exemplo@gmail.com" className={inputCls} value={login} onChange={(e) => setLogin(e.target.value)} disabled={isLoading} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="senha" className="text-sm font-semibold leading-[140%] text-[#1F1F24]">Senha</Label>
                <div className="relative">
                  <Input id="senha" autoComplete="current-password" type={showPassword ? "text" : "password"} placeholder="Digite sua senha" className={`${inputCls} pr-12`} value={senha} onChange={(e) => setSenha(e.target.value)} disabled={isLoading} required />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Esconder senha" : "Mostrar senha"} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#9B5BF8] transition-colors hover:text-[#884BE0]">
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg" role="alert">
                  <p className="text-sm text-destructive text-center">{error}</p>
                </div>
              )}

              <Button type="submit" disabled={isLoading} className="h-12 w-full rounded-xl border border-[#9B5BF8]/10 bg-[#9B5BF8] px-6 py-3 text-base font-bold leading-[140%] text-white shadow-sm shadow-[#9B5BF8]/25 transition-colors hover:bg-[#884BE0]">
                {isLoading ? (<><Loader2 className="mr-2 h-5 w-5 animate-spin" />Entrando...</>) : "Entrar"}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
