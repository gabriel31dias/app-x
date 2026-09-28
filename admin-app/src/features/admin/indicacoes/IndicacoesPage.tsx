import type { Indicacao, IndicacaoSoma, Pagina } from "@/features/admin/types";
import { baixarCsv, MiniCard, Pagination, Panel, pillCls, StatusBadge, Table } from "@/shared/components/admin";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { api, qs } from "@/shared/lib/api";
import { brl, dataHora, num } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { BadgeCheck, Clock, Download, Handshake, Loader2, Search, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const inputCls = "h-9 rounded-full border border-border bg-white dark:bg-transparent px-3 text-sm text-foreground outline-none focus:border-primary placeholder:text-muted-foreground";
const STATUS = { pendente: "Pendente", liberada: "Liberada", recebida: "Paga" } as const;

/**
 * "Indique e ganhe": quem indicou quem, o que o indicado já fez (depósito pago e rodadas) e se o prêmio já foi pago.
 * Pendente = falta depositar/jogar · Liberada = cumpriu, entra no saldo do indicador quando ele abrir o site · Paga = já entrou.
 */
export function IndicacoesPage() {
  const [status, setStatus] = useState("todos");
  const [q, setQ] = useState("");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const [exportando, setExportando] = useState(false);
  const porPagina = 20;

  useEffect(() => {
    const t = setTimeout(() => setQ(busca.trim()), 400);
    return () => clearTimeout(t);
  }, [busca]);

  const filtro = { status: status === "todos" ? undefined : status, q };
  useEffect(() => setPagina(1), [JSON.stringify(filtro)]);
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["indicacoes", filtro, pagina],
    queryFn: () => api<Pagina<Indicacao, IndicacaoSoma>>(`/admin/indicacoes${qs({ ...filtro, pagina, porPagina })}`),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });

  const exportar = async () => {
    setExportando(true);
    try {
      const linhas: Indicacao[] = [];
      for (let p = 1; ; p++) {
        const r = await api<Pagina<Indicacao, IndicacaoSoma>>(`/admin/indicacoes${qs({ ...filtro, pagina: p, porPagina: 1000 })}`);
        linhas.push(...r.itens);
        if (linhas.length >= r.total || !r.itens.length) break;
      }
      const br = (v: number | null) => (v == null ? "" : v.toFixed(2).replace(".", ","));
      baixarCsv(`indicacoes.csv`, [
        ["Data", "Indicador", "E-mail indicador", "Código", "Indicado", "E-mail indicado", "Depositado", "Rodadas", "Status", "Prêmio", "Liberada em", "Paga em"],
        ...linhas.map((i) => [dataHora(i.criadoEm), i.indicadorNome, i.indicador, i.codigo, i.indicadoNome, i.indicado, br(i.depositado), String(i.rodadas), STATUS[i.status], br(i.valor), i.liberadaEm ? dataHora(i.liberadaEm) : "", i.creditadoEm ? dataHora(i.creditadoEm) : ""]),
      ]);
      toast.success(`${num(linhas.length)} indicações exportadas`);
    } catch (e) {
      toast.error("Não deu pra exportar", { description: (e as Error).message });
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MiniCard title="Indicações" value={num(data?.total ?? 0)} icon={<Handshake className="h-5 w-5" />} hint="contas criadas por link (no filtro)" />
        <MiniCard title="Pendentes" value={num(data?.soma.pendentes ?? 0)} icon={<Clock className="h-5 w-5" />} hint="falta depositar ou jogar" />
        <MiniCard title="Liberadas" value={num(data?.soma.liberadas ?? 0)} icon={<BadgeCheck className="h-5 w-5" />} hint="cumpriram; entram quando o indicador abrir o site" />
        <MiniCard title="Pago em indicações" value={brl(data?.soma.valorPago ?? 0)} icon={<Wallet className="h-5 w-5" />} hint={`${num(data?.soma.pagas ?? 0)} prêmios · sai do lucro no dashboard`} />
      </div>

      <Panel title="Indicações" icon={<Handshake className="h-5 w-5" />}
        actions={
          <button onClick={exportar} disabled={exportando || !data?.total} className={cn(pillCls, "inline-flex items-center text-primary disabled:opacity-50")}>
            {exportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Exportar CSV
          </button>
        }>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <label className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input className={cn(inputCls, "w-full pl-9")} placeholder="E-mail de quem indicou ou do indicado, nome ou código" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar indicação" />
          </label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className={cn(pillCls, "w-[190px]")} aria-label="Status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              <SelectItem value="pendente">Pendentes</SelectItem>
              <SelectItem value="liberada">Liberadas</SelectItem>
              <SelectItem value="recebida">Pagas</SelectItem>
            </SelectContent>
          </Select>
          {isFetching && !isLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
        </div>

        {error && <p className="my-3 text-sm text-destructive">{(error as Error).message}</p>}
        {isLoading ? (
          <div className="h-40 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <Table head={["Data", "Quem indicou", "Indicado", "Depositou", "Rodadas", "Status", "Prêmio"]} empty={data?.itens.length === 0}>
            {data?.itens.map((i) => (
              <tr key={i.id}>
                <td className="!text-muted-foreground whitespace-nowrap">{dataHora(i.criadoEm)}</td>
                <td>
                  <div className="font-medium">{i.indicadorNome ?? "—"}</div>
                  <div className="text-xs !text-muted-foreground">{i.indicador} · {i.codigo}</div>
                </td>
                <td>
                  <div className="font-medium">{i.indicadoNome}</div>
                  <div className="text-xs !text-muted-foreground">{i.indicado}</div>
                </td>
                <td className={cn("tabular-nums", i.depositado > 0 ? "font-semibold" : "!text-muted-foreground")}>{i.depositado > 0 ? brl(i.depositado) : "Não"}</td>
                <td className="tabular-nums">{num(i.rodadas)}</td>
                <td>
                  <StatusBadge status={i.status} />
                  {(i.creditadoEm || i.liberadaEm) && <div className="mt-1 text-[11px] !text-muted-foreground whitespace-nowrap">{dataHora((i.creditadoEm ?? i.liberadaEm)!)}</div>}
                </td>
                <td className="font-semibold !text-[#CC0854] tabular-nums">{i.valor != null ? brl(i.valor) : "—"}</td>
              </tr>
            ))}
          </Table>
        )}
        <Pagination currentPage={pagina} totalPages={data ? Math.ceil(data.total / porPagina) : 0} onPageChange={setPagina} />
      </Panel>
    </div>
  );
}
