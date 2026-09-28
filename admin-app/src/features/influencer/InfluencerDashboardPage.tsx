import { STATUS_SAQUE } from "@/features/admin/influencers/InfluencerSaquesPage";
import { MiniCard, Pagination, Panel, Table } from "@/shared/components/admin";
import { api, qs } from "@/shared/lib/api";
import { brl, dataHora, num } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, Copy, Link2, Loader2, Receipt, UserPlus, Users, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type Painel = {
  nome: string; codigo: string; chavePix: string;
  regras: { cadastro: number; primeiroDeposito: number; percentual: number; saqueMinimo: number };
  inscritos: number; depositaram: number; totalDepositado: number;
  comissaoCadastro: number; comissaoPrimeiroDeposito: number; comissaoDepositos: number;
  ganho: number; sacado: number; saquePendente: number; disponivel: number;
  comissoes: { id: string; tipo: "cadastro" | "primeiro_deposito" | "deposito"; inscrito: string; base: number | null; valor: number; criadoEm: string }[];
  saques: { id: string; valor: number; chavePix: string; status: keyof typeof STATUS_SAQUE; motivo: string | null; criadoEm: string; decididoEm: string | null }[];
};
type Inscritos = { itens: { id: string; nome: string; criadoEm: string; depositou: boolean; depositado: number; comissao: number }[]; total: number };

const TIPO = { cadastro: "Inscrição", primeiro_deposito: "1º depósito", deposito: "Depósito" } as const;
const pct = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

/** o que o influencer vê ao entrar: link, regras, comissões, inscritos e saques */
export function InfluencerDashboardPage() {
  const qc = useQueryClient();
  const [pagina, setPagina] = useState(1);
  const [valor, setValor] = useState("");
  const { data: p, isLoading, error } = useQuery({ queryKey: ["influencer-me"], queryFn: () => api<Painel>("/influencer/me"), refetchInterval: 60_000 });
  const { data: insc } = useQuery({
    queryKey: ["influencer-inscritos", pagina],
    queryFn: () => api<Inscritos>(`/influencer/inscritos${qs({ pagina, porPagina: 20 })}`),
    placeholderData: keepPreviousData,
  });

  const sacar = useMutation({
    mutationFn: () => api("/influencer/saques", { method: "POST", body: JSON.stringify({ valor: Number(valor.replace(",", ".")) }) }),
    onSuccess: () => {
      toast.success("Saque pedido!", { description: "Assim que o PIX for feito, ele aparece como pago aqui." });
      setValor("");
      qc.invalidateQueries({ queryKey: ["influencer-me"] });
    },
    onError: (e) => toast.error("Não deu pra pedir o saque", { description: (e as Error).message }),
  });

  if (isLoading) return <div className="h-40 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (error || !p) return <p className="text-sm text-destructive">{(error as Error)?.message}</p>;

  const link = `${location.origin}/?inf=${p.codigo}`;
  const copiar = () => navigator.clipboard.writeText(link).then(() => toast.success("Link copiado"), () => toast.error("Não copiou"));
  const v = Number(valor.replace(",", "."));
  const podeSacar = v >= p.regras.saqueMinimo && v <= p.disponivel;

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <Panel title={`Olá, ${p.nome.split(" ")[0]}! Seu link`} icon={<Link2 className="h-5 w-5" />}>
        <div className="flex flex-wrap items-center gap-2">
          <code className="flex-1 min-w-[240px] truncate rounded-full border border-border bg-muted/40 px-4 py-2 text-sm">{link}</code>
          <button onClick={copiar} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-[#9B5BF8] hover:bg-[#884BE0] text-white text-sm font-semibold"><Copy className="h-4 w-4" />Copiar link</button>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Você ganha <b className="text-foreground">{brl(p.regras.cadastro)}</b> por inscrição feita pelo seu link, mais <b className="text-foreground">{brl(p.regras.primeiroDeposito)}</b> quando
          essa pessoa faz o primeiro depósito, e <b className="text-foreground">{pct(p.regras.percentual)}</b> de todo depósito que ela fizer.
        </p>
      </Panel>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MiniCard title="Inscritos" value={num(p.inscritos)} icon={<Users className="h-5 w-5" />} hint={`${num(p.depositaram)} já depositaram`} />
        <MiniCard title="Depositado pelos inscritos" value={brl(p.totalDepositado)} icon={<Receipt className="h-5 w-5" />} hint={`${pct(p.regras.percentual)} vira comissão`} />
        <MiniCard title="Total ganho" value={brl(p.ganho)} icon={<Wallet className="h-5 w-5" />}
          hint={`inscrições ${brl(p.comissaoCadastro)} · 1º depósito ${brl(p.comissaoPrimeiroDeposito)} · depósitos ${brl(p.comissaoDepositos)}`} />
        <MiniCard title="Disponível pra saque" value={brl(p.disponivel)} icon={<Banknote className="h-5 w-5" />} hint={`${brl(p.sacado)} recebidos${p.saquePendente ? ` · ${brl(p.saquePendente)} a caminho` : ""}`} />
      </div>

      <Panel title="Pedir saque" icon={<Banknote className="h-5 w-5" />}>
        <form className="flex flex-wrap items-center gap-3" onSubmit={(e) => { e.preventDefault(); if (podeSacar) sacar.mutate(); }}>
          <div className="flex items-center rounded-full border border-border bg-white dark:bg-transparent h-9 px-3 focus-within:border-primary">
            <span className="text-sm text-muted-foreground mr-1">R$</span>
            <input type="number" min={p.regras.saqueMinimo} max={p.disponivel} step="0.01" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} className="w-28 bg-transparent text-sm outline-none tabular-nums" aria-label="Valor do saque" />
          </div>
          <button type="button" onClick={() => setValor(String(p.disponivel))} className="text-sm text-primary hover:underline">Sacar tudo</button>
          <button type="submit" disabled={sacar.isPending || !podeSacar} className="h-9 px-5 rounded-full bg-[#9B5BF8] hover:bg-[#884BE0] text-white text-sm font-semibold disabled:opacity-50">
            {sacar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Pedir saque"}
          </button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">
          Mínimo {brl(p.regras.saqueMinimo)}. O PIX vai pra chave <b>{p.chavePix}</b> depois que a equipe aprovar. Pra trocar a chave, fale com o suporte.
        </p>
        {p.saques.length > 0 && (
          <div className="mt-4">
            <Table head={["Pedido", "Valor", "Status"]}>
              {p.saques.map((s) => (
                <tr key={s.id}>
                  <td className="!text-muted-foreground">{dataHora(s.criadoEm)}</td>
                  <td className="font-semibold tabular-nums">{brl(s.valor)}</td>
                  <td>
                    <span className={cn("inline-flex items-center justify-center px-4 py-1.5 rounded-full text-[11px] font-medium min-w-[100px]", STATUS_SAQUE[s.status].cls)}>{STATUS_SAQUE[s.status].label}</span>
                    {s.status === "cancelado" && s.motivo && <span className="ml-2 text-xs !text-muted-foreground">{s.motivo}</span>}
                  </td>
                </tr>
              ))}
            </Table>
          </div>
        )}
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Panel title="Últimas comissões" icon={<Wallet className="h-5 w-5" />}>
          <Table head={["Data", "Tipo", "Inscrito", "Comissão"]} empty={p.comissoes.length === 0}>
            {p.comissoes.map((c) => (
              <tr key={c.id}>
                <td className="!text-muted-foreground">{dataHora(c.criadoEm)}</td>
                <td>{TIPO[c.tipo]}{c.base != null && <span className="text-xs !text-muted-foreground"> de {brl(c.base)}</span>}</td>
                <td>{c.inscrito}</td>
                <td className="font-semibold text-[#45BC56] tabular-nums">+{brl(c.valor)}</td>
              </tr>
            ))}
          </Table>
        </Panel>

        <Panel title="Seus inscritos" icon={<UserPlus className="h-5 w-5" />}>
          <Table head={["Inscrição", "Nome", "Depositou", "Rendeu"]} empty={insc?.itens.length === 0}>
            {insc?.itens.map((i) => (
              <tr key={i.id}>
                <td className="!text-muted-foreground">{dataHora(i.criadoEm)}</td>
                <td>{i.nome}</td>
                <td className={cn("tabular-nums", !i.depositou && "!text-muted-foreground")}>{i.depositou ? brl(i.depositado) : "Ainda não"}</td>
                <td className="font-semibold tabular-nums">{brl(i.comissao)}</td>
              </tr>
            ))}
          </Table>
          <Pagination currentPage={pagina} totalPages={insc ? Math.ceil(insc.total / 20) : 0} onPageChange={setPagina} />
        </Panel>
      </div>
    </div>
  );
}
