import { JOGOS, type Pagina, type Periodo, type Rodada } from "@/features/admin/types";
import { DateFilter } from "@/shared/components/DateFilter";
import { baixarCsv, MiniCard, Pagination, Panel, pillCls, StatusBadge, Table } from "@/shared/components/admin";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { api, qs } from "@/shared/lib/api";
import { brl, dataHora, num, ymd } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { subDays } from "date-fns";
import { Coins, Dices, Download, Gamepad2, Gift, Loader2, Search, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type Soma = { apostado: number; premios: number; lucro: number };
const PADRAO: Periodo = { startDate: ymd(subDays(new Date(), 6)), endDate: ymd(new Date()) };
const inputCls = "h-9 rounded-full border border-border bg-white dark:bg-transparent px-3 text-sm text-foreground outline-none focus:border-primary placeholder:text-muted-foreground";

export function RodadasPage() {
  const [periodo, setPeriodo] = useState(PADRAO);
  const [jogo, setJogo] = useState("todos");
  const [resultado, setResultado] = useState("todos");
  const [jogador, setJogador] = useState("");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const [exportando, setExportando] = useState(false);
  const porPagina = 20;

  useEffect(() => {
    const t = setTimeout(() => setJogador(busca.trim()), 400);
    return () => clearTimeout(t);
  }, [busca]);

  const filtro = { de: periodo.startDate, ate: periodo.endDate, jogo: jogo === "todos" ? undefined : jogo, resultado: resultado === "todos" ? undefined : resultado, jogador };
  useEffect(() => setPagina(1), [JSON.stringify(filtro)]);
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["rodadas", filtro, pagina],
    queryFn: () => api<Pagina<Rodada, Soma>>(`/admin/rodadas${qs({ ...filtro, pagina, porPagina })}`),
    placeholderData: keepPreviousData,
  });

  const exportar = async () => {
    setExportando(true);
    try {
      const linhas: Rodada[] = [];
      for (let p = 1; ; p++) {
        const r = await api<Pagina<Rodada, Soma>>(`/admin/rodadas${qs({ ...filtro, pagina: p, porPagina: 1000 })}`);
        linhas.push(...r.itens);
        if (linhas.length >= r.total || !r.itens.length) break;
      }
      const br = (v: number) => v.toFixed(2).replace(".", ",");
      baixarCsv(`rodadas_${filtro.de}_${filtro.ate}.csv`, [["Data", "Jogo", "Jogador", "Aposta", "Prêmio", "Lucro da casa"], ...linhas.map((r) => [dataHora(r.criadoEm), r.nome, r.jogador, br(r.aposta), br(r.premio), br(r.lucro)])]);
      toast.success(`${num(linhas.length)} rodadas exportadas`);
    } catch (e) {
      toast.error("Não deu pra exportar", { description: (e as Error).message });
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MiniCard title="Rodadas" value={num(data?.total ?? 0)} icon={<Dices className="h-5 w-5" />} />
        <MiniCard title="Apostado" value={brl(data?.soma.apostado ?? 0)} icon={<Coins className="h-5 w-5" />} />
        <MiniCard title="Prêmios pagos" value={brl(data?.soma.premios ?? 0)} icon={<Gift className="h-5 w-5" />} />
        <MiniCard title="Lucro da casa" value={brl(data?.soma.lucro ?? 0)} icon={<TrendingUp className="h-5 w-5" />} hint={data?.soma.apostado ? `RTP real ${((data.soma.premios / data.soma.apostado) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%` : undefined} />
      </div>

      <Panel title="Rodadas dos jogos" icon={<Dices className="h-5 w-5" />}
        actions={<>
          <DateFilter onDateRangeChange={setPeriodo} />
          <button onClick={exportar} disabled={exportando || !data?.total} className={cn(pillCls, "inline-flex items-center text-primary disabled:opacity-50")}>
            {exportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Exportar CSV
          </button>
        </>}>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <label className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input className={cn(inputCls, "w-full pl-9")} placeholder="E-mail do jogador" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar jogador" />
          </label>
          <Select value={jogo} onValueChange={setJogo}>
            <SelectTrigger className={cn(pillCls, "w-[210px]")} aria-label="Jogo"><Gamepad2 className="h-4 w-4 text-primary shrink-0" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os jogos</SelectItem>
              {Object.entries(JOGOS).map(([id, nome]) => <SelectItem key={id} value={id}>{nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={resultado} onValueChange={setResultado}>
            <SelectTrigger className={cn(pillCls, "w-[200px]")} aria-label="Resultado"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os resultados</SelectItem>
              <SelectItem value="ganhou">Com prêmio</SelectItem>
              <SelectItem value="perdeu">Sem prêmio</SelectItem>
            </SelectContent>
          </Select>
          {isFetching && !isLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
        </div>

        {error && <p className="my-3 text-sm text-destructive">{(error as Error).message}</p>}
        {isLoading ? (
          <div className="h-40 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <Table head={["Data", "Jogo", "Jogador", "Aposta", "Prêmio", "Lucro da casa", "Resultado"]} empty={data?.itens.length === 0}>
            {data?.itens.map((r) => (
              <tr key={r.id}>
                <td className="!text-muted-foreground">{dataHora(r.criadoEm)}</td>
                <td className="font-medium">{r.nome}</td>
                <td className="!text-muted-foreground">{r.jogador ?? "visitante"}</td>
                <td>{brl(r.aposta)}</td>
                <td>{brl(r.premio)}</td>
                <td className={cn("font-semibold", r.lucro > 0 && "!text-[#45BC56]", r.lucro < 0 && "!text-[#CC0854]")}>{brl(r.lucro)}</td>
                <td><StatusBadge status={r.premio > 0 ? "ganhou" : "perdeu"} /></td>
              </tr>
            ))}
          </Table>
        )}
        <Pagination currentPage={pagina} totalPages={data ? Math.ceil(data.total / porPagina) : 0} onPageChange={setPagina} />
        <p className="text-xs text-muted-foreground">As rodadas são informadas pelo próprio jogo no navegador; os números ficam confiáveis quando o sorteio passar pro servidor.</p>
      </Panel>
    </div>
  );
}
