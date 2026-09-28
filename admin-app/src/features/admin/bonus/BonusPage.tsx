import type { Bonus, BonusSoma, Pagina, Periodo } from "@/features/admin/types";
import { DateFilter } from "@/shared/components/DateFilter";
import { baixarCsv, MiniCard, Pagination, Panel, pillCls, StatusBadge, Table } from "@/shared/components/admin";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { api, qs } from "@/shared/lib/api";
import { brl, dataHora, num, ymd } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { subDays } from "date-fns";
import { CalendarCheck, Download, Gift, Handshake, Loader2, Search, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const PADRAO: Periodo = { startDate: ymd(subDays(new Date(), 6)), endDate: ymd(new Date()) };
const inputCls = "h-9 rounded-full border border-border bg-white dark:bg-transparent px-3 text-sm text-foreground outline-none focus:border-primary placeholder:text-muted-foreground";
const TIPOS = { cadastro: "Cadastro", diario: "Diário", indicacao: "Indicação" } as const;

/** bônus que a casa deu (cadastro, diário e indicação): é dinheiro nosso, por isso o dashboard desconta do lucro */
export function BonusPage() {
  const [periodo, setPeriodo] = useState(PADRAO);
  const [tipo, setTipo] = useState("todos");
  const [q, setQ] = useState("");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const [exportando, setExportando] = useState(false);
  const porPagina = 20;

  useEffect(() => {
    const t = setTimeout(() => setQ(busca.trim()), 400);
    return () => clearTimeout(t);
  }, [busca]);

  const filtro = { de: periodo.startDate, ate: periodo.endDate, tipo: tipo === "todos" ? undefined : tipo, q };
  useEffect(() => setPagina(1), [JSON.stringify(filtro)]);
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["bonus", filtro, pagina],
    queryFn: () => api<Pagina<Bonus, BonusSoma>>(`/admin/bonus${qs({ ...filtro, pagina, porPagina })}`),
    placeholderData: keepPreviousData,
  });

  const exportar = async () => {
    setExportando(true);
    try {
      const linhas: Bonus[] = [];
      for (let p = 1; ; p++) {
        const r = await api<Pagina<Bonus, BonusSoma>>(`/admin/bonus${qs({ ...filtro, pagina: p, porPagina: 1000 })}`);
        linhas.push(...r.itens);
        if (linhas.length >= r.total || !r.itens.length) break;
      }
      const br = (v: number) => v.toFixed(2).replace(".", ",");
      baixarCsv(`bonus_${filtro.de}_${filtro.ate}.csv`, [["Data", "Tipo", "Jogador", "E-mail", "Valor"], ...linhas.map((b) => [dataHora(b.criadoEm), TIPOS[b.tipo], b.nome, b.jogador, br(b.valor)])]);
      toast.success(`${num(linhas.length)} bônus exportados`);
    } catch (e) {
      toast.error("Não deu pra exportar", { description: (e as Error).message });
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MiniCard title="Total em bônus" value={brl(data?.soma.valor ?? 0)} icon={<Gift className="h-5 w-5" />} hint={`${num(data?.total ?? 0)} bônus · sai do lucro no dashboard`} />
        <MiniCard title="Bônus de cadastro" value={brl(data?.soma.cadastro.valor ?? 0)} icon={<UserPlus className="h-5 w-5" />} hint={`${num(data?.soma.cadastro.quantidade ?? 0)} contas novas`} />
        <MiniCard title="Bônus diário" value={brl(data?.soma.diario.valor ?? 0)} icon={<CalendarCheck className="h-5 w-5" />} hint={`${num(data?.soma.diario.quantidade ?? 0)} resgates`} />
        <MiniCard title="Indicações" value={brl(data?.soma.indicacao?.valor ?? 0)} icon={<Handshake className="h-5 w-5" />} hint={`${num(data?.soma.indicacao?.quantidade ?? 0)} amigos que depositaram e jogaram`} />
      </div>

      <Panel title="Bônus concedidos" icon={<Gift className="h-5 w-5" />}
        actions={<>
          <DateFilter onDateRangeChange={setPeriodo} />
          <button onClick={exportar} disabled={exportando || !data?.total} className={cn(pillCls, "inline-flex items-center text-primary disabled:opacity-50")}>
            {exportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Exportar CSV
          </button>
        </>}>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <label className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input className={cn(inputCls, "w-full pl-9")} placeholder="Nome ou e-mail do jogador" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar jogador" />
          </label>
          <Select value={tipo} onValueChange={setTipo}>
            <SelectTrigger className={cn(pillCls, "w-[190px]")} aria-label="Tipo de bônus"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os tipos</SelectItem>
              <SelectItem value="cadastro">Cadastro</SelectItem>
              <SelectItem value="diario">Diário</SelectItem>
              <SelectItem value="indicacao">Indicação</SelectItem>
            </SelectContent>
          </Select>
          {isFetching && !isLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
        </div>

        {error && <p className="my-3 text-sm text-destructive">{(error as Error).message}</p>}
        {isLoading ? (
          <div className="h-40 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <Table head={["Data", "Tipo", "Jogador", "E-mail", "Valor"]} empty={data?.itens.length === 0}>
            {data?.itens.map((b) => (
              <tr key={b.id}>
                <td className="!text-muted-foreground">{dataHora(b.criadoEm)}</td>
                <td><StatusBadge status={b.tipo} /></td>
                <td className="font-medium">{b.nome ?? "—"}</td>
                <td className="!text-muted-foreground">{b.jogador}</td>
                <td className="font-semibold !text-[#CC0854]">{brl(b.valor)}</td>
              </tr>
            ))}
          </Table>
        )}
        <Pagination currentPage={pagina} totalPages={data ? Math.ceil(data.total / porPagina) : 0} onPageChange={setPagina} />
      </Panel>
    </div>
  );
}
