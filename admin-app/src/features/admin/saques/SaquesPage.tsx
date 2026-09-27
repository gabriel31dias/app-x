import type { Periodo } from "@/features/admin/types";
import { DateFilter } from "@/shared/components/DateFilter";
import { MiniCard, Pagination, Panel, pillCls, Table } from "@/shared/components/admin";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/shared/components/ui/alert-dialog";
import { Button } from "@/shared/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { api, qs } from "@/shared/lib/api";
import { brl, dataHora, num } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, Check, Clock, Copy, Loader2, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type Saque = {
  id: string; email: string; nome: string; cpf: string; chavePix: string; valor: number; status: "pendente" | "aprovado" | "cancelado"; motivo: string | null;
  criadoEm: string; decididoEm: string | null; decididoPor: string | null; estornado: boolean;
  conferencia: { depositado: number; jaSacado: number; rodadas: number; resultadoJogos: number; saldoNoPedido: number | null; saldoAgora: number | null };
};
type Lista = { itens: Saque[]; total: number; soma: number; pendentes: { quantidade: number; valor: number } };

const STATUS = {
  pendente: { label: "Pendente", cls: "bg-[rgba(245,158,11,0.15)] text-[#F59E0B]" },
  aprovado: { label: "Aprovado", cls: "bg-[rgba(69,188,86,0.15)] text-[#45BC56]" },
  cancelado: { label: "Cancelado", cls: "bg-[rgba(204,8,84,0.1)] text-[#CC0854]" },
};
const cpfFmt = (c: string) => c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
const inputCls = "h-9 rounded-full border border-border bg-white dark:bg-transparent px-3 text-sm text-foreground outline-none focus:border-primary placeholder:text-muted-foreground";

export function SaquesPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("pendente");
  const [periodo, setPeriodo] = useState<Periodo | null>(null); // null = todo o período
  const [busca, setBusca] = useState("");
  const [q, setQ] = useState("");
  const [pagina, setPagina] = useState(1);
  const [aprovar, setAprovar] = useState<Saque | null>(null);
  const [cancelar, setCancelar] = useState<Saque | null>(null);
  const [motivo, setMotivo] = useState("");

  useEffect(() => { const t = setTimeout(() => setQ(busca.trim()), 400); return () => clearTimeout(t); }, [busca]);
  const filtro = { status: status === "todos" ? undefined : status, q, de: periodo?.startDate, ate: periodo?.endDate };
  useEffect(() => setPagina(1), [JSON.stringify(filtro)]);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["saques", filtro, pagina],
    queryFn: () => api<Lista>(`/admin/saques${qs({ ...filtro, pagina, porPagina: 20 })}`),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000, // pedido novo aparece sozinho
  });

  const decidir = useMutation({
    mutationFn: ({ s, acao }: { s: Saque; acao: "aprovar" | "cancelar" }) =>
      api(`/admin/saques/${s.id}/${acao}`, { method: "PUT", ...(acao === "cancelar" && { body: JSON.stringify({ motivo }) }) }),
    onSuccess: (_, { s, acao }) => {
      toast.success(acao === "aprovar" ? `Saque de ${brl(s.valor)} aprovado` : `Saque cancelado`, {
        description: acao === "cancelar" ? "O valor volta pro saldo do jogador quando ele abrir o site." : undefined,
      });
      setAprovar(null); setCancelar(null); setMotivo("");
      qc.invalidateQueries({ queryKey: ["saques"] });
    },
    onError: (e) => toast.error("Não deu certo", { description: (e as Error).message }),
  });

  const copiar = (t: string) => navigator.clipboard.writeText(t).then(() => toast.success("Chave PIX copiada"), () => toast.error("Não copiou"));

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MiniCard title="Pendentes" value={num(data?.pendentes.quantidade ?? 0)} icon={<Clock className="h-5 w-5" />} hint="esperando análise" />
        <MiniCard title="Valor pendente" value={brl(data?.pendentes.valor ?? 0)} icon={<Banknote className="h-5 w-5" />} hint="a pagar se aprovar tudo" />
        <MiniCard title="Valor no filtro" value={brl(data?.soma ?? 0)} icon={<Banknote className="h-5 w-5" />} hint={`${num(data?.total ?? 0)} saques`} />
      </div>

      <Panel title="Saques" icon={<Banknote className="h-5 w-5" />} actions={<DateFilter onDateRangeChange={setPeriodo} label={periodo ? undefined : "Todo o período"} />}>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <label className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input className={cn(inputCls, "w-full pl-9")} placeholder="Buscar por nome, e-mail ou CPF" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar saque" />
          </label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className={cn(pillCls, "w-[170px]")} aria-label="Status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pendente">Pendentes</SelectItem>
              <SelectItem value="aprovado">Aprovados</SelectItem>
              <SelectItem value="cancelado">Cancelados</SelectItem>
              <SelectItem value="todos">Todos</SelectItem>
            </SelectContent>
          </Select>
          {isFetching && !isLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
        </div>

        {error && <p className="my-3 text-sm text-destructive">{(error as Error).message}</p>}
        {isLoading ? (
          <div className="h-40 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <Table head={["Pedido", "Jogador", "Chave PIX (CPF)", "Valor", "Conferência", "Status", ""]} empty={data?.itens.length === 0}>
            {data?.itens.map((s) => {
              const c = s.conferencia;
              // sinal de alerta: pede mais do que já colocou + ganhou nos jogos
              const alerta = s.valor + c.jaSacado > c.depositado + Math.max(c.resultadoJogos, 0) + 0.01;
              return (
                <tr key={s.id} className="align-top">
                  <td className="!text-muted-foreground">{dataHora(s.criadoEm)}</td>
                  <td><p className="font-medium">{s.nome}</p><p className="text-xs !text-muted-foreground">{s.email}</p></td>
                  <td>
                    <button onClick={() => copiar(s.chavePix)} className="inline-flex items-center gap-1.5 font-mono text-xs hover:text-primary" title="Copiar chave PIX">
                      {cpfFmt(s.chavePix)}<Copy className="h-3.5 w-3.5" />
                    </button>
                  </td>
                  <td className="font-bold text-base">{brl(s.valor)}</td>
                  <td className="text-xs leading-5 !whitespace-normal min-w-[220px]">
                    <p>Depositou (pago): <b>{brl(c.depositado)}</b></p>
                    <p>Já sacou (aprovado): <b>{brl(c.jaSacado)}</b></p>
                    <p>Nos jogos: <b className={c.resultadoJogos > 0 ? "text-[#CC0854]" : "text-[#45BC56]"}>{c.resultadoJogos > 0 ? "ganhou " : "perdeu "}{brl(Math.abs(c.resultadoJogos))}</b> em {num(c.rodadas)} rodadas</p>
                    <p>Saldo no pedido: <b>{c.saldoNoPedido == null ? "—" : brl(c.saldoNoPedido)}</b> · agora: <b>{c.saldoAgora == null ? "—" : brl(c.saldoAgora)}</b></p>
                    {alerta && <p className="mt-1 font-semibold text-[#F59E0B]">⚠ Pede mais do que depositou + ganhou. Confira antes de pagar.</p>}
                  </td>
                  <td>
                    <span className={cn("inline-flex items-center justify-center px-4 py-1.5 rounded-full text-[11px] font-medium min-w-[100px]", STATUS[s.status].cls)}>{STATUS[s.status].label}</span>
                    {s.decididoPor && <p className="mt-1 text-[11px] !text-muted-foreground">{s.decididoPor}<br />{dataHora(s.decididoEm)}</p>}
                    {s.status === "cancelado" && <p className="text-[11px] !text-muted-foreground max-w-[180px] !whitespace-normal">{s.motivo}{s.estornado ? " · valor devolvido" : " · devolução pendente"}</p>}
                  </td>
                  <td>
                    {s.status === "pendente" && (
                      <div className="flex flex-col gap-2">
                        <button onClick={() => setAprovar(s)} className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-full bg-[#45BC56] hover:bg-[#3aa84a] text-white text-xs font-semibold"><Check className="h-3.5 w-3.5" />Aprovar</button>
                        <button onClick={() => setCancelar(s)} className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-full border border-[#CC0854]/40 text-[#CC0854] hover:bg-[#CC0854]/10 text-xs font-semibold"><X className="h-3.5 w-3.5" />Cancelar</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
        <Pagination currentPage={pagina} totalPages={data ? Math.ceil(data.total / 20) : 0} onPageChange={setPagina} />
        <p className="text-xs text-muted-foreground">O saque é manual: faça o PIX pro CPF do jogador e depois clique em Aprovar. O saldo fica no aparelho do jogador, então confira depósitos e rodadas antes de pagar.</p>
      </Panel>

      <AlertDialog open={!!aprovar} onOpenChange={(o) => !o && setAprovar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aprovar saque de {aprovar && brl(aprovar.valor)}?</AlertDialogTitle>
            <AlertDialogDescription>
              Confirme que você <b>já fez o PIX</b> de {aprovar && brl(aprovar.valor)} para a chave {aprovar && cpfFmt(aprovar.chavePix)} ({aprovar?.nome}). Depois de aprovado não dá pra cancelar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <Button disabled={decidir.isPending} onClick={() => aprovar && decidir.mutate({ s: aprovar, acao: "aprovar" })} className="bg-[#45BC56] hover:bg-[#3aa84a] text-white">Já paguei, aprovar</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!cancelar} onOpenChange={(o) => { if (!o) { setCancelar(null); setMotivo(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar saque de {cancelar && brl(cancelar.valor)}?</AlertDialogTitle>
            <AlertDialogDescription>O valor volta pro saldo de {cancelar?.nome} quando ele abrir o site. Ele vê o motivo.</AlertDialogDescription>
          </AlertDialogHeader>
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={300} placeholder="Motivo (ex.: dados não conferem)" aria-label="Motivo do cancelamento"
            className="w-full rounded-xl border border-border bg-transparent p-3 text-sm outline-none focus:border-primary" />
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <Button disabled={decidir.isPending || motivo.trim().length < 3} onClick={() => cancelar && decidir.mutate({ s: cancelar, acao: "cancelar" })} className="bg-[#CC0854] hover:bg-[#a80645] text-white">Cancelar saque</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
