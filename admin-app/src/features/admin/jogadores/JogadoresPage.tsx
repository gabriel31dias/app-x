import type { Pagina } from "@/features/admin/types";
import { baixarCsv, MiniCard, Pagination, Panel, pillCls, Table } from "@/shared/components/admin";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Button } from "@/shared/components/ui/button";
import { api, qs } from "@/shared/lib/api";
import { brl, dataHora, num, pct } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSessoesAoVivo, type Sessao } from "@/shared/lib/aoVivo";
import { formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowDownWideNarrow, Download, Loader2, Play, Radio, RotateCcw, Search, SlidersHorizontal, Users, Wallet, X } from "lucide-react";
import { AoVivoPlayer } from "./AoVivoPlayer";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type Jogador = { email: string; nome: string; saldo: number; criadoEm: string; atualizadoEm: string };
type JogadorRtpJogo = { jogo: string; nome: string; fabrica: number; globalRtp: number; rtp: number; especifico: number | null; atualizadoPor: string | null; atualizadoEm: string | null };
type JogadorRtpLista = { jogador: { email: string; nome: string }; min: number; max: number; jogos: JogadorRtpJogo[] };
const inputCls = "h-9 rounded-full border border-border bg-white dark:bg-transparent px-3 text-sm text-foreground outline-none focus:border-primary placeholder:text-muted-foreground";

export function JogadoresPage() {
  const [busca, setBusca] = useState("");
  const [q, setQ] = useState("");
  const [ordem, setOrdem] = useState("saldo");
  const [pagina, setPagina] = useState(1);
  const [exportando, setExportando] = useState(false);
  const porPagina = 20;
  const { sessoes, conectado } = useSessoesAoVivo();
  const [assistindo, setAssistindo] = useState<Sessao | null>(null);
  const [rtpJogador, setRtpJogador] = useState<Jogador | null>(null);
  const aoVivoDe = (email: string) => sessoes.find((x) => x.jogador === email);

  useEffect(() => {
    const t = setTimeout(() => setQ(busca.trim()), 400);
    return () => clearTimeout(t);
  }, [busca]);
  useEffect(() => setPagina(1), [q, ordem]);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["jogadores", q, ordem, pagina],
    queryFn: () => api<Pagina<Jogador, number>>(`/admin/jogadores${qs({ q, ordem, pagina, porPagina })}`),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000, // saldo muda o tempo todo enquanto jogam
  });

  const exportar = async () => {
    setExportando(true);
    try {
      const linhas: Jogador[] = [];
      for (let p = 1; ; p++) {
        const r = await api<Pagina<Jogador, number>>(`/admin/jogadores${qs({ q, ordem, pagina: p, porPagina: 1000 })}`);
        linhas.push(...r.itens);
        if (linhas.length >= r.total || !r.itens.length) break;
      }
      baixarCsv("saldos_jogadores.csv", [["Nome", "E-mail", "Saldo", "Atualizado em"], ...linhas.map((j) => [j.nome, j.email, j.saldo.toFixed(2).replace(".", ","), dataHora(j.atualizadoEm)])]);
      toast.success(`${num(linhas.length)} jogadores exportados`);
    } catch (e) {
      toast.error("Não deu pra exportar", { description: (e as Error).message });
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MiniCard title="Jogadores" value={num(data?.total ?? 0)} icon={<Users className="h-5 w-5" />} hint={q ? "no filtro" : "que já abriram o site logados"} />
        <MiniCard title="Soma dos saldos" value={brl(data?.soma ?? 0)} icon={<Wallet className="h-5 w-5" />} hint="quanto os jogadores têm pra jogar ou sacar" />
        <MiniCard title="Saldo médio" value={brl(data?.total ? data.soma / data.total : 0)} icon={<Wallet className="h-5 w-5" />} />
      </div>

      <Panel title="Jogando agora" icon={<Radio className={cn("h-5 w-5", sessoes.length > 0 && "text-[#CC0854] animate-pulse")} />}
        actions={<span className={cn("text-xs", conectado ? "text-[#45BC56]" : "text-muted-foreground")}>{conectado ? "● conectado em tempo real" : "○ conectando…"}</span>}>
        {sessoes.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Ninguém com jogo aberto agora.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3">
            {sessoes.map((x) => (
              <div key={x.id} className="rounded-xl border border-border/60 p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-[#54052D] dark:text-foreground truncate">{x.jogadorNome ?? "Visitante"}</p>
                  <p className="text-xs text-muted-foreground truncate">{x.nome} · há {formatDistanceToNowStrict(new Date(x.desde), { locale: ptBR })}{x.assistindo > 0 && ` · ${x.assistindo} assistindo`}</p>
                </div>
                <button onClick={() => setAssistindo(x)} className="shrink-0 inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-[#9B5BF8] hover:bg-[#884BE0] text-white text-sm font-semibold">
                  <Play className="h-4 w-4 fill-current" />Assistir
                </button>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Saldo dos jogadores" icon={<Users className="h-5 w-5" />}
        actions={<button onClick={exportar} disabled={exportando || !data?.total} className={cn(pillCls, "inline-flex items-center text-primary disabled:opacity-50")}>
          {exportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Exportar CSV
        </button>}>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <label className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input className={cn(inputCls, "w-full pl-9")} placeholder="Buscar por nome ou e-mail" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar jogador" />
          </label>
          <Select value={ordem} onValueChange={setOrdem}>
            <SelectTrigger className={cn(pillCls, "w-[200px]")} aria-label="Ordenar"><ArrowDownWideNarrow className="h-4 w-4 text-primary shrink-0" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="saldo">Maior saldo</SelectItem>
              <SelectItem value="recente">Atualizado agora</SelectItem>
              <SelectItem value="nome">Nome (A–Z)</SelectItem>
            </SelectContent>
          </Select>
          {isFetching && !isLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
        </div>

        {error && <p className="my-3 text-sm text-destructive">{(error as Error).message}</p>}
        {isLoading ? (
          <div className="h-40 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <Table head={["Jogador", "E-mail", "Saldo", "RTP", "Agora", "Atualizado em", "Primeira vez"]} empty={data?.itens.length === 0}>
            {data?.itens.map((j) => (
              <tr key={j.email}>
                <td className="font-medium">{j.nome}</td>
                <td className="!text-muted-foreground">{j.email}</td>
                <td className="font-semibold">{brl(j.saldo)}</td>
                <td>
                  <button onClick={() => setRtpJogador(j)} className="inline-flex items-center gap-1.5 rounded-full bg-[#9B5BF8]/10 px-3 py-1 text-xs font-semibold !text-[#9B5BF8] hover:bg-[#9B5BF8]/20" title="Configurar RTP específico">
                    <SlidersHorizontal className="h-3 w-3" />RTP
                  </button>
                </td>
                <td>
                  {aoVivoDe(j.email) ? (
                    <button onClick={() => setAssistindo(aoVivoDe(j.email)!)} className="inline-flex items-center gap-1.5 rounded-full bg-[#CC0854]/10 px-3 py-1 text-xs font-semibold !text-[#CC0854] hover:bg-[#CC0854]/20" title="Assistir ao vivo">
                      <Play className="h-3 w-3 fill-current" />Ao vivo · {aoVivoDe(j.email)!.nome}
                    </button>
                  ) : <span className="!text-muted-foreground">—</span>}
                </td>
                <td className="!text-muted-foreground">{dataHora(j.atualizadoEm)}</td>
                <td className="!text-muted-foreground">{dataHora(j.criadoEm)}</td>
              </tr>
            ))}
          </Table>
        )}
        <Pagination currentPage={pagina} totalPages={data ? Math.ceil(data.total / porPagina) : 0} onPageChange={setPagina} />
        <p className="text-xs text-muted-foreground">
          O saldo fica no aparelho do jogador; aqui aparece o último valor que o site informou. Quem não abre o site desde esta mudança ainda não aparece.
        </p>
      </Panel>
      {assistindo && <AoVivoPlayer sessao={assistindo} onClose={() => setAssistindo(null)} />}
      {rtpJogador && <JogadorRtpDialog jogador={rtpJogador} onClose={() => setRtpJogador(null)} />}
    </div>
  );
}

function JogadorRtpDialog({ jogador, onClose }: { jogador: Jogador; onClose: () => void }) {
  const qc = useQueryClient();
  const [editado, setEditado] = useState<Record<string, string>>({});
  const email = encodeURIComponent(jogador.email);
  const lista = useQuery({ queryKey: ["jogador-rtp", jogador.email], queryFn: () => api<JogadorRtpLista>(`/admin/jogadores/${email}/rtp`) });

  const salvar = useMutation({
    mutationFn: ({ jogo, rtp }: { jogo: string; rtp: number }) => api(`/admin/jogadores/${email}/rtp/${jogo}`, { method: "PUT", body: JSON.stringify({ rtp }) }),
    onSuccess: (_, { jogo }) => {
      toast.success("RTP específico atualizado");
      setEditado(({ [jogo]: _x, ...resto }) => resto);
      qc.invalidateQueries({ queryKey: ["jogador-rtp", jogador.email] });
    },
    onError: (e) => toast.error("Não salvou", { description: (e as Error).message }),
  });

  const remover = useMutation({
    mutationFn: (jogo: string) => api(`/admin/jogadores/${email}/rtp/${jogo}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Jogador voltou ao RTP global");
      qc.invalidateQueries({ queryKey: ["jogador-rtp", jogador.email] });
    },
    onError: (e) => toast.error("Não removeu", { description: (e as Error).message }),
  });

  const cfg = lista.data;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-5xl max-h-[88vh] overflow-hidden rounded-2xl bg-background border border-border shadow-2xl flex flex-col">
        <div className="p-5 border-b border-border flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-[#54052D] dark:text-foreground">RTP específico do jogador</h2>
            <p className="text-sm text-muted-foreground">{jogador.nome} · {jogador.email}</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-muted" aria-label="Fechar"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-5 overflow-auto">
          <p className="text-sm text-muted-foreground mb-4">
            Quando houver valor específico, ele sobrescreve o RTP global só para este jogador. Remover volta a usar o global do jogo.
            {cfg && <> Limite permitido: <b className="text-foreground">{pct(cfg.min)}</b> a <b className="text-foreground">{pct(cfg.max)}</b>.</>}
          </p>
          {lista.isLoading && <div className="h-40 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}
          {lista.error && <p className="text-sm text-destructive">{(lista.error as Error).message}</p>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {cfg?.jogos.map((j) => {
              const valor = editado[j.jogo] ?? String(+(j.rtp * 100).toFixed(2));
              const novo = Number(valor) / 100;
              const mudou = valor !== "" && Math.abs(novo - j.rtp) > 1e-6;
              const fora = valor !== "" && (novo < cfg.min || novo > cfg.max);
              const busy = salvar.isPending || remover.isPending;
              return (
                <div key={j.jogo} className="rounded-2xl border border-border/60 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-[#54052D] dark:text-foreground truncate">{j.nome}</p>
                      <p className="text-xs text-muted-foreground">global {pct(j.globalRtp, 2)} · fábrica {pct(j.fabrica, 2)}</p>
                    </div>
                    <span className={cn("shrink-0 rounded-full px-3 py-1 text-[11px] font-medium", j.especifico != null ? "bg-[#CC0854]/10 text-[#CC0854]" : "bg-muted text-muted-foreground")}>
                      {j.especifico != null ? "específico" : "global"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={cn("flex items-center rounded-xl border bg-white dark:bg-transparent px-3 h-11 flex-1", fora ? "border-destructive" : "border-border focus-within:border-primary")}>
                      <input
                        type="number" inputMode="decimal" step="0.1" min={cfg.min * 100} max={cfg.max * 100} value={valor}
                        onChange={(e) => setEditado((s) => ({ ...s, [j.jogo]: e.target.value }))}
                        className="w-full bg-transparent text-lg font-bold text-[#54052D] dark:text-foreground outline-none tabular-nums"
                        aria-label={`RTP específico de ${j.nome} em %`} aria-invalid={fora}
                      />
                      <span className="text-muted-foreground font-semibold">%</span>
                    </div>
                    <Button disabled={!mudou || fora || busy} onClick={() => salvar.mutate({ jogo: j.jogo, rtp: novo })} className="h-11 rounded-xl bg-[#9B5BF8] hover:bg-[#884BE0] text-white font-bold px-4">Salvar</Button>
                    <Button variant="outline" disabled={j.especifico == null || busy} onClick={() => remover.mutate(j.jogo)} className="h-11 rounded-xl px-3" title="Voltar ao RTP global"><RotateCcw className="h-4 w-4" /></Button>
                  </div>
                  <p className="text-xs text-muted-foreground min-h-[16px]">
                    {fora ? <span className="text-destructive">Fora do limite de {pct(cfg.min)} a {pct(cfg.max)}</span>
                      : j.especifico != null ? `${j.atualizadoPor} · ${dataHora(j.atualizadoEm)}` : "Sem override para este jogador"}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
