import { MiniCard, Panel, Table } from "@/shared/components/admin";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/shared/components/ui/alert-dialog";
import { Button } from "@/shared/components/ui/button";
import { api, qs } from "@/shared/lib/api";
import { brl, dataHora, num } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound, Loader2, Megaphone, Plus, Search, Users, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export type InfluencerLinha = {
  id: string; nome: string; email: string; codigo: string; chavePix: string; ativo: boolean; criadoEm: string;
  inscritos: number; depositaram: number; totalDepositado: number; ganho: number; sacado: number; saquePendente: number; disponivel: number;
};

const inputCls = "h-10 w-full rounded-xl border border-border bg-white dark:bg-transparent px-3 text-sm text-foreground outline-none focus:border-primary placeholder:text-muted-foreground";
const VAZIO = { nome: "", email: "", cpf: "", celular: "", chavePix: "", senha: "" };
const CAMPOS: { k: keyof typeof VAZIO; label: string; tipo?: string; ph?: string }[] = [
  { k: "nome", label: "Nome", ph: "Nome do influencer" },
  { k: "email", label: "E-mail (login)", tipo: "email", ph: "email@exemplo.com" },
  { k: "cpf", label: "CPF", ph: "000.000.000-00" },
  { k: "celular", label: "Celular", ph: "(11) 99999-9999" },
  { k: "chavePix", label: "Chave PIX (pra receber)", ph: "CPF, e-mail, celular ou aleatória" },
  { k: "senha", label: "Senha inicial", ph: "8+ caracteres, letras e números" },
];
export const linkInfluencer = (codigo: string) => `${location.origin}/?inf=${codigo}`;

/** influencers: o admin cria a conta (login no mesmo painel, onde o influencer só vê o dashboard dele) e acompanha os números */
export function InfluencersPage() {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [q, setQ] = useState("");
  const [novo, setNovo] = useState(false);
  const [form, setForm] = useState(VAZIO);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [senhaDe, setSenhaDe] = useState<InfluencerLinha | null>(null);
  const [senhaNova, setSenhaNova] = useState("");

  useEffect(() => { const t = setTimeout(() => setQ(busca.trim()), 400); return () => clearTimeout(t); }, [busca]);
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["influencers", q],
    queryFn: () => api<InfluencerLinha[]>(`/admin/influencers${qs({ q })}`),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });

  const criar = useMutation({
    mutationFn: () => api<{ id: string; codigo: string }>("/admin/influencers", { method: "POST", body: JSON.stringify(form) }),
    onSuccess: (r) => {
      toast.success(`${form.nome} criado`, { description: `Link: ${linkInfluencer(r.codigo)} · login: ${form.email}` });
      setNovo(false); setForm(VAZIO); setErros({});
      qc.invalidateQueries({ queryKey: ["influencers"] });
    },
    onError: (e) => toast.error("Não deu pra criar", { description: (e as Error).message }),
  });
  const atualizar = useMutation({
    mutationFn: ({ id, ...d }: { id: string; ativo?: boolean; senha?: string }) => api(`/admin/influencers/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
    onSuccess: (_, d) => {
      toast.success(d.senha ? "Senha trocada — as sessões abertas dele caíram" : d.ativo ? "Influencer reativado" : "Influencer desativado — link e login param de valer");
      setSenhaDe(null); setSenhaNova("");
      qc.invalidateQueries({ queryKey: ["influencers"] });
    },
    onError: (e) => toast.error("Não deu certo", { description: (e as Error).message }),
  });

  const validar = () => {
    const e: Record<string, string> = {};
    if (form.nome.trim().length < 3) e.nome = "Nome muito curto";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "E-mail inválido";
    if (form.cpf.replace(/\D/g, "").length !== 11) e.cpf = "CPF inválido";
    if (form.celular.replace(/\D/g, "").length < 10) e.celular = "Celular inválido";
    if (form.chavePix.trim().length < 3) e.chavePix = "Informe a chave PIX";
    if (!/^(?=.*[A-Za-z])(?=.*\d).{8,72}$/.test(form.senha)) e.senha = "8+ caracteres, com letras e números";
    setErros(e);
    return !Object.keys(e).length;
  };
  const copiar = (t: string, o: string) => navigator.clipboard.writeText(t).then(() => toast.success(`${o} copiado`), () => toast.error("Não copiou"));
  const tot = (k: keyof InfluencerLinha) => (data ?? []).reduce((a, i) => a + (i[k] as number), 0);

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MiniCard title="Influencers" value={num(data?.filter((i) => i.ativo).length ?? 0)} icon={<Megaphone className="h-5 w-5" />} hint={`${num(data?.length ?? 0)} no total`} />
        <MiniCard title="Inscritos pelos links" value={num(tot("inscritos"))} icon={<Users className="h-5 w-5" />} hint={`${num(tot("depositaram"))} depositaram · ${brl(tot("totalDepositado"))}`} />
        <MiniCard title="Comissões geradas" value={brl(tot("ganho"))} icon={<Wallet className="h-5 w-5" />} hint={`${brl(tot("sacado"))} já pagos`} />
        <MiniCard title="A pagar" value={brl(tot("disponivel") + tot("saquePendente"))} icon={<Wallet className="h-5 w-5" />} hint={`${brl(tot("saquePendente"))} em saques pedidos`} />
      </div>

      <Panel title="Influencers" icon={<Megaphone className="h-5 w-5" />}
        actions={<button onClick={() => setNovo(true)} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-[#9B5BF8] hover:bg-[#884BE0] text-white text-sm font-semibold"><Plus className="h-4 w-4" />Novo influencer</button>}>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <label className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input className={cn(inputCls, "h-9 rounded-full pl-9")} placeholder="Nome, e-mail ou código" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar influencer" />
          </label>
          {isFetching && !isLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
        </div>

        {error && <p className="my-3 text-sm text-destructive">{(error as Error).message}</p>}
        {isLoading ? (
          <div className="h-40 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <Table head={["Influencer", "Link", "Inscritos", "Depositado", "Comissões", "Disponível", "Status", ""]} empty={data?.length === 0}>
            {data?.map((i) => (
              <tr key={i.id} className={cn("align-top", !i.ativo && "opacity-60")}>
                <td><p className="font-medium">{i.nome}</p><p className="text-xs !text-muted-foreground">{i.email}</p><p className="text-[11px] !text-muted-foreground">PIX: {i.chavePix}</p></td>
                <td>
                  <button onClick={() => copiar(linkInfluencer(i.codigo), "Link")} className="inline-flex items-center gap-1.5 font-mono text-xs hover:text-primary" title="Copiar link">
                    ?inf={i.codigo}<Copy className="h-3.5 w-3.5" />
                  </button>
                </td>
                <td className="tabular-nums">{num(i.inscritos)}<p className="text-[11px] !text-muted-foreground">{num(i.depositaram)} depositaram</p></td>
                <td className="tabular-nums">{brl(i.totalDepositado)}</td>
                <td className="tabular-nums font-semibold">{brl(i.ganho)}<p className="text-[11px] font-normal !text-muted-foreground">{brl(i.sacado)} pagos</p></td>
                <td className="tabular-nums">{brl(i.disponivel)}{i.saquePendente > 0 && <p className="text-[11px] text-[#F59E0B]">{brl(i.saquePendente)} pedido</p>}</td>
                <td>
                  <button role="switch" aria-checked={i.ativo} aria-label={i.ativo ? "Desativar influencer" : "Ativar influencer"} disabled={atualizar.isPending}
                    onClick={() => atualizar.mutate({ id: i.id, ativo: !i.ativo })}
                    className={cn("relative shrink-0 h-7 w-12 rounded-full border-2 border-[#9B5BF8] transition-colors disabled:opacity-50", i.ativo ? "bg-[#9B5BF8]" : "bg-transparent")}>
                    <span className={cn("absolute top-0.5 h-5 w-5 rounded-full transition-all", i.ativo ? "left-[22px] bg-white" : "left-0.5 bg-[#9B5BF8]")} />
                  </button>
                  <p className="mt-1 text-[11px] !text-muted-foreground">desde {dataHora(i.criadoEm).split(" ")[0]}</p>
                </td>
                <td>
                  <button onClick={() => setSenhaDe(i)} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-border text-xs hover:bg-muted" title="Trocar senha"><KeyRound className="h-3.5 w-3.5" />Senha</button>
                </td>
              </tr>
            ))}
          </Table>
        )}
        <p className="text-xs text-muted-foreground">
          O influencer entra no painel com o e-mail e a senha daqui e vê só o dashboard dele (comissões, inscritos e saques). Desativado, o link para de contar inscrições novas e o login dele cai.
        </p>
      </Panel>

      <AlertDialog open={novo} onOpenChange={(o) => { if (!o) { setNovo(false); setErros({}); } }}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Novo influencer</AlertDialogTitle>
            <AlertDialogDescription>Cria o login dele no painel e o link de inscrição. Passe o e-mail e a senha pra ele.</AlertDialogDescription>
          </AlertDialogHeader>
          <form id="form-influencer" className="grid grid-cols-1 sm:grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); if (validar()) criar.mutate(); }}>
            {CAMPOS.map((c) => (
              <label key={c.k} className={cn("text-sm font-medium", (c.k === "nome" || c.k === "chavePix") && "sm:col-span-2")}>
                {c.label}
                <input type={c.tipo ?? "text"} value={form[c.k]} placeholder={c.ph} onChange={(e) => setForm({ ...form, [c.k]: e.target.value })} className={cn(inputCls, "mt-1", erros[c.k] && "border-[#CC0854]")} />
                {erros[c.k] && <span className="text-xs text-[#CC0854]">{erros[c.k]}</span>}
              </label>
            ))}
          </form>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <Button type="submit" form="form-influencer" disabled={criar.isPending} className="bg-[#9B5BF8] hover:bg-[#884BE0] text-white">{criar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar"}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!senhaDe} onOpenChange={(o) => { if (!o) { setSenhaDe(null); setSenhaNova(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Nova senha de {senhaDe?.nome}</AlertDialogTitle>
            <AlertDialogDescription>As sessões abertas dele caem e ele entra de novo com a senha nova.</AlertDialogDescription>
          </AlertDialogHeader>
          <input type="text" value={senhaNova} onChange={(e) => setSenhaNova(e.target.value)} placeholder="8+ caracteres, letras e números" className={inputCls} aria-label="Nova senha" />
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <Button disabled={atualizar.isPending || !/^(?=.*[A-Za-z])(?=.*\d).{8,72}$/.test(senhaNova)} onClick={() => senhaDe && atualizar.mutate({ id: senhaDe.id, senha: senhaNova })} className="bg-[#9B5BF8] hover:bg-[#884BE0] text-white">Trocar senha</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
