import { JOGOS, type Dashboard, type Periodo } from "@/features/admin/types";
import { DateFilter } from "@/shared/components/DateFilter";
import { MiniCard, Panel, pillCls, StatCard, StatusBadge, Table } from "@/shared/components/admin";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { api, qs } from "@/shared/lib/api";
import { brl, dataHora, doc, num, pct, ymd } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { subDays } from "date-fns";
import { BarChart3, Clock, Coins, Dices, Gamepad2, Gauge, Gift, HandCoins, Loader2, Percent, Receipt, RefreshCw, ShoppingCart, TrendingUp, UserCheck, Users, Wallet } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// o DateFilter da loja abre em "7 dias"
const PADRAO: Periodo = { startDate: ymd(subDays(new Date(), 6)), endDate: ymd(new Date()) };
const SERIES = [
  { key: "vendas", label: "Vendas", color: "#E91E63" },
  { key: "lucroLiquido", label: "Lucro líquido (jogos − bônus)", color: "#9B5BF8" },
] as const;

export function DashboardPage() {
  const [periodo, setPeriodo] = useState<Periodo>(PADRAO);
  const [jogo, setJogo] = useState("todos");
  const filtro = { de: periodo.startDate, ate: periodo.endDate, jogo: jogo === "todos" ? undefined : jogo };
  const { data: d, isLoading, isRefetching, refetch, error } = useQuery({
    queryKey: ["dashboard", filtro],
    queryFn: () => api<Dashboard>(`/admin/dashboard${qs(filtro)}`),
  });

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {/* filtros valem pra tela toda */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Select value={jogo} onValueChange={setJogo}>
          <SelectTrigger className={cn(pillCls, "w-[220px]")} aria-label="Filtrar por jogo">
            <Gamepad2 className="h-4 w-4 text-primary shrink-0" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os jogos</SelectItem>
            {Object.entries(JOGOS).map(([id, nome]) => <SelectItem key={id} value={id}>{nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <DateFilter onDateRangeChange={setPeriodo} />
        <button onClick={() => refetch()} disabled={isRefetching} aria-label="Atualizar"
          className="w-10 h-10 rounded-lg border border-border bg-white dark:bg-transparent hover:bg-muted flex items-center justify-center text-[#CC0854] transition-colors">
          <RefreshCw size={18} className={isRefetching ? "animate-spin" : ""} />
        </button>
      </div>

      {error && <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{(error as Error).message}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatCard loading={isLoading} title="Vendas (depósitos pagos)" value={brl(d?.vendas.valor ?? 0)} icon={<Wallet className="h-6 w-6" />} up={(d?.vendas.valor ?? 0) > 0}
          hint={d && `${num(d.vendas.quantidade)} vendas · líquido ${brl(d.vendas.liquido)}`} />
        {jogo === "todos" ? (
          <StatCard loading={isLoading} title="Lucro líquido" value={brl(d?.lucroLiquido ?? 0)} icon={<TrendingUp className="h-6 w-6" />} up={(d?.lucroLiquido ?? 0) >= 0}
            hint={d && `jogos ${brl(d.jogos.lucro)} − bônus ${brl(d.bonus.valor)}`} />
        ) : (
          <StatCard loading={isLoading} title={`Lucro · ${JOGOS[jogo]}`} value={brl(d?.jogos.lucro ?? 0)} icon={<TrendingUp className="h-6 w-6" />} up={(d?.jogos.lucro ?? 0) >= 0}
            hint={d && `apostado ${brl(d.jogos.apostado)} − prêmios ${brl(d.jogos.premios)} · bônus não entram por jogo`} />
        )}
      </div>

      <Grafico d={d} loading={isLoading} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-4">
        <MiniCard title="Quantidade de vendas" value={num(d?.vendas.quantidade ?? 0)} icon={<ShoppingCart className="h-5 w-5" />} />
        <MiniCard title="Ticket médio" value={brl(d?.vendas.ticketMedio ?? 0)} icon={<Receipt className="h-5 w-5" />} />
        <MiniCard title="Clientes que compraram" value={num(d?.vendas.clientes ?? 0)} icon={<Users className="h-5 w-5" />} />
        <MiniCard title="Conversão do PIX" value={pct(d?.vendas.conversao)} icon={<Percent className="h-5 w-5" />} hint="PIX gerados que foram pagos" />
        <MiniCard title="PIX pendentes" value={brl(d?.vendas.pendentes.valor ?? 0)} icon={<Clock className="h-5 w-5" />} hint={`${num(d?.vendas.pendentes.quantidade ?? 0)} aguardando`} />
        <MiniCard title="Total apostado" value={brl(d?.jogos.apostado ?? 0)} icon={<Coins className="h-5 w-5" />} />
        <MiniCard title="Prêmios pagos" value={brl(d?.jogos.premios ?? 0)} icon={<Gift className="h-5 w-5" />} />
        <MiniCard title="Lucro dos jogos" value={brl(d?.jogos.lucro ?? 0)} icon={<TrendingUp className="h-5 w-5" />} hint="apostado − prêmios, antes dos bônus" />
        {jogo === "todos" && (
          <Link to="/bonus" className="contents">
            <MiniCard title="Bônus concedidos" value={brl(d?.bonus.valor ?? 0)} icon={<HandCoins className="h-5 w-5" />}
              hint={d && `cadastro ${brl(d.bonus.cadastro.valor)} (${num(d.bonus.cadastro.quantidade)}) · diário ${brl(d.bonus.diario.valor)} (${num(d.bonus.diario.quantidade)}) · indicação ${brl(d.bonus.indicacao.valor)} (${num(d.bonus.indicacao.quantidade)})`} />
          </Link>
        )}
        <MiniCard title="RTP real" value={pct(d?.jogos.rtpReal, 2)} icon={<Gauge className="h-5 w-5" />} hint="prêmios ÷ apostado no período" />
        <MiniCard title="Rodadas" value={num(d?.jogos.rodadas ?? 0)} icon={<Dices className="h-5 w-5" />} />
        <MiniCard title="Jogadores logados" value={num(d?.jogos.jogadores ?? 0)} icon={<UserCheck className="h-5 w-5" />} hint="com conta no site" />
      </div>

      <Panel title="Lucro por jogo" icon={<Gamepad2 className="h-5 w-5" />}>
        <Table head={["Jogo", "Rodadas", "Apostado", "Prêmios", "Lucro", "RTP real", "RTP configurado"]} empty={d && d.porJogo.length === 0}>
          {d?.porJogo.map((j) => (
            <tr key={j.jogo}>
              <td className="font-medium">{j.nome}</td>
              <td>{num(j.rodadas)}</td>
              <td>{brl(j.apostado)}</td>
              <td>{brl(j.premios)}</td>
              <td className={cn("font-semibold", j.lucro > 0 && "!text-[#45BC56]", j.lucro < 0 && "!text-[#CC0854]")}>{brl(j.lucro)}</td>
              <td>{pct(j.rtpReal, 2)}</td>
              <td className="!text-muted-foreground">{pct(j.rtpConfig, 2)}</td>
            </tr>
          ))}
        </Table>
        <p className="mt-3 text-xs text-muted-foreground">Com poucas rodadas o RTP real varia muito; ele se aproxima do configurado com o volume.</p>
      </Panel>

      <Panel title="Últimas vendas" icon={<ShoppingCart className="h-5 w-5" />} actions={<Link to="/vendas" className="text-sm font-semibold text-[#9B5BF8] hover:underline">Ver todas</Link>}>
        <Table head={["Cliente", "CPF", "Valor", "Status", "Data"]} empty={d && d.ultimasVendas.length === 0}>
          {d?.ultimasVendas.map((v) => (
            <tr key={v.id}>
              <td className="font-medium">{v.nome}</td>
              <td className="!text-muted-foreground">{doc(v.documento)}</td>
              <td className="font-semibold">{brl(v.valor)}</td>
              <td><StatusBadge status={v.status} /></td>
              <td className="!text-muted-foreground">{dataHora(v.criadoEm)}</td>
            </tr>
          ))}
        </Table>
      </Panel>
    </div>
  );
}

// gráfico no mesmo estilo do SalesChart da loja, com as duas séries
function Grafico({ d, loading }: { d?: Dashboard; loading: boolean }) {
  const vazio = !d || d.serie.every((s) => !s.vendas && !s.lucroLiquido);
  return (
    <Panel title={d?.periodo.granularidade === "dia" ? "Vendas e lucro por dia" : "Vendas e lucro por hora"} icon={<BarChart3 className="h-5 w-5" />}
      actions={SERIES.map((s) => (
        <span key={s.key} className="flex items-center gap-1.5 text-xs text-muted-foreground"><i className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />{s.label}</span>
      ))}>
      {loading ? (
        <div className="h-[240px] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <div className="h-[240px] relative">
          {vazio && (
            <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
              <div className="bg-white/80 dark:bg-card/80 backdrop-blur-sm px-4 py-2 rounded-xl border border-[rgba(84,5,45,0.08)]">
                <span className="text-[#54052D]/60 dark:text-muted-foreground text-xs font-medium">Nenhuma venda ou rodada no período</span>
              </div>
            </div>
          )}
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={d?.serie ?? []} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                {SERIES.map((s) => (
                  <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={s.color} stopOpacity={0.15} />
                    <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.5} />
              <XAxis dataKey="rotulo" stroke="#8B7A7A" fontSize={10} tickLine={false} axisLine={false} minTickGap={8} tick={{ fill: "#8B7A7A" }} />
              <YAxis stroke="#8B7A7A" fontSize={10} tickLine={false} axisLine={false} width={56} tick={{ fill: "#8B7A7A" }} tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString("pt-BR")}k` : String(v))} />
              <Tooltip
                cursor={{ stroke: "#E91E63", strokeWidth: 1, strokeDasharray: "4 4" }}
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <div className="bg-white dark:bg-card border border-[rgba(84,5,45,0.08)] dark:border-border rounded-2xl px-3 py-2 text-[11px] space-y-1">
                      <div className="text-[rgba(84,5,45,0.4)] dark:text-muted-foreground">{label}</div>
                      {payload.map((p) => (
                        <div key={p.dataKey as string} className="flex items-center gap-2">
                          <i className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                          <span className="text-[rgba(84,5,45,0.6)] dark:text-muted-foreground">{SERIES.find((s) => s.key === p.dataKey)?.label}</span>
                          <b className="ml-auto pl-3 text-[#54052D] dark:text-foreground font-medium">{brl(p.value as number)}</b>
                        </div>
                      ))}
                    </div>
                  ) : null
                }
              />
              {SERIES.map((s) => (
                <Area key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2} fill={`url(#g-${s.key})`} dot={false} activeDot={{ r: 4, fill: s.color, stroke: "white", strokeWidth: 2 }} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
}
