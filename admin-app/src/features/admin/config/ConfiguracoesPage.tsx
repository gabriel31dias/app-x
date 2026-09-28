import { Panel } from "@/shared/components/admin";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { api } from "@/shared/lib/api";
import { brl, dataHora } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Banknote, Clock, Gift, Handshake, Loader2, Scale } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export type Config = { saqueExigeDeposito: boolean; saqueMinimo: number; bonusDiarioAtivo: boolean; bonusDiario: number; indicacaoAtiva: boolean; indicacao: number; indicacaoMinRodadas: number; autoBalanco: boolean; janelaHoras: number; metaHoraAtiva: boolean; metaHora: number; lucroHora: number; motivoBalanco: string | null; balancoAtivo: boolean; ativadoEm: string | null; atualizadoPor: string | null; atualizadoEm: string; lucroJanela: number };
const JANELAS = [{ h: 24, label: "Últimas 24 horas" }, { h: 168, label: "Últimos 7 dias" }, { h: 720, label: "Últimos 30 dias" }];

export function ConfiguracoesPage() {
  const qc = useQueryClient();
  const { data: c, isLoading, error } = useQuery({ queryKey: ["config"], queryFn: () => api<Config>("/admin/config"), refetchInterval: 30_000 });
  const salvar = useMutation({
    mutationFn: (dto: Partial<Pick<Config, "autoBalanco" | "janelaHoras" | "metaHoraAtiva" | "metaHora" | "saqueExigeDeposito" | "saqueMinimo" | "bonusDiarioAtivo" | "bonusDiario" | "indicacaoAtiva" | "indicacao" | "indicacaoMinRodadas">>) => api<Config>("/admin/config", { method: "PUT", body: JSON.stringify({ autoBalanco: c!.autoBalanco, janelaHoras: c!.janelaHoras, ...dto }) }),
    onSuccess: (novo) => {
      qc.setQueryData(["config"], novo);
      qc.invalidateQueries({ queryKey: ["rtp"] });
      qc.invalidateQueries({ queryKey: ["rtp-hist"] });
      toast.success("Configuração salva", {
        description: novo.balancoAtivo ? `${novo.motivoBalanco === "hora" ? "Última hora abaixo da meta" : "Casa negativa"}: todos os jogos estão no RTP mínimo.` : undefined,
      });
    },
    onError: (e) => toast.error("Não salvou", { description: (e as Error).message }),
  });

  const [meta, setMeta] = useState("");
  useEffect(() => { if (c) setMeta(String(c.metaHora)); }, [c?.metaHora]);
  const [bonus, setBonus] = useState("");
  useEffect(() => { if (c) setBonus(String(c.bonusDiario)); }, [c?.bonusDiario]);
  const [indicacao, setIndicacao] = useState("");
  useEffect(() => { if (c) setIndicacao(String(c.indicacao)); }, [c?.indicacao]);
  const [minRodadas, setMinRodadas] = useState("");
  useEffect(() => { if (c) setMinRodadas(String(c.indicacaoMinRodadas)); }, [c?.indicacaoMinRodadas]);
  const [minSaque, setMinSaque] = useState("");
  useEffect(() => { if (c) setMinSaque(String(c.saqueMinimo)); }, [c?.saqueMinimo]);

  if (isLoading) return <div className="h-40 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (error || !c) return <p className="text-sm text-destructive">{(error as Error)?.message}</p>;

  return (
    <div className="space-y-6 animate-fade-in pb-10 max-w-3xl">
      <Panel title="Saques" icon={<Banknote className="h-5 w-5" />}>
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-sm font-medium text-[#54052D] dark:text-foreground">Exigir depósito antes do saque</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Só pode pedir saque quem já tem pelo menos um depósito <b className="text-foreground">pago</b> no CPF da conta. Quem nunca depositou (só jogou com bônus ou saldo inicial)
              vê "Para sacar, faça pelo menos um depósito na sua conta."
            </p>
          </div>
          <button role="switch" aria-checked={c.saqueExigeDeposito} aria-label="Exigir depósito antes do saque" disabled={salvar.isPending}
            onClick={() => salvar.mutate({ saqueExigeDeposito: !c.saqueExigeDeposito })}
            className={cn("relative shrink-0 h-7 w-12 rounded-full border-2 border-[#9B5BF8] transition-colors disabled:opacity-50", c.saqueExigeDeposito ? "bg-[#9B5BF8]" : "bg-transparent")}>
            <span className={cn("absolute top-0.5 h-5 w-5 rounded-full transition-all", c.saqueExigeDeposito ? "left-[22px] bg-white" : "left-0.5 bg-[#9B5BF8]")} />
          </button>
        </div>
        <form className="mt-5 flex flex-wrap items-center gap-3" onSubmit={(e) => { e.preventDefault(); salvar.mutate({ saqueMinimo: Number(minSaque) }); }}>
          <label htmlFor="saque-minimo" className="text-sm font-medium text-[#54052D] dark:text-foreground">Valor mínimo de saque</label>
          <div className="flex items-center rounded-full border border-border bg-white dark:bg-transparent h-9 px-3 focus-within:border-primary">
            <span className="text-sm text-muted-foreground mr-1">R$</span>
            <input id="saque-minimo" type="number" min={1} step="0.01" inputMode="decimal" value={minSaque} onChange={(e) => setMinSaque(e.target.value)} className="w-24 bg-transparent text-sm outline-none tabular-nums" />
          </div>
          <button type="submit" disabled={salvar.isPending || !(Number(minSaque) >= 1) || Number(minSaque) === c.saqueMinimo}
            className="h-9 px-5 rounded-full bg-[#9B5BF8] hover:bg-[#884BE0] text-white text-sm font-semibold disabled:opacity-50">Salvar mínimo</button>
          <span className="text-xs text-muted-foreground">O site mostra e valida esse valor no modal de saque.</span>
        </form>
      </Panel>

      <Panel title="Bônus diário" icon={<Gift className="h-5 w-5" />}>
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-sm font-medium text-[#54052D] dark:text-foreground">Liberar bônus diário no perfil</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Cada conta pode resgatar <b className="text-foreground">uma vez por dia</b> (fuso de Brasília), e só depois de ter <b className="text-foreground">apostado hoje</b> em
              pelo menos uma rodada. Desligado, o botão some do perfil.
            </p>
          </div>
          <button role="switch" aria-checked={c.bonusDiarioAtivo} aria-label="Liberar bônus diário" disabled={salvar.isPending}
            onClick={() => salvar.mutate({ bonusDiarioAtivo: !c.bonusDiarioAtivo })}
            className={cn("relative shrink-0 h-7 w-12 rounded-full border-2 border-[#9B5BF8] transition-colors disabled:opacity-50", c.bonusDiarioAtivo ? "bg-[#9B5BF8]" : "bg-transparent")}>
            <span className={cn("absolute top-0.5 h-5 w-5 rounded-full transition-all", c.bonusDiarioAtivo ? "left-[22px] bg-white" : "left-0.5 bg-[#9B5BF8]")} />
          </button>
        </div>
        <form className="mt-5 flex flex-wrap items-center gap-3" onSubmit={(e) => { e.preventDefault(); salvar.mutate({ bonusDiario: Number(bonus) }); }}>
          <label htmlFor="bonus" className="text-sm font-medium text-[#54052D] dark:text-foreground">Valor do bônus</label>
          <div className="flex items-center rounded-full border border-border bg-white dark:bg-transparent h-9 px-3 focus-within:border-primary">
            <span className="text-sm text-muted-foreground mr-1">R$</span>
            <input id="bonus" type="number" min={0.01} max={1000} step="0.01" inputMode="decimal" value={bonus} onChange={(e) => setBonus(e.target.value)} className="w-28 bg-transparent text-sm outline-none tabular-nums" />
          </div>
          <button type="submit" disabled={salvar.isPending || !(Number(bonus) > 0) || Number(bonus) === c.bonusDiario}
            className="h-9 px-5 rounded-full bg-[#9B5BF8] hover:bg-[#884BE0] text-white text-sm font-semibold disabled:opacity-50">Salvar valor</button>
        </form>
      </Panel>

      <Panel title="Indique e ganhe" icon={<Handshake className="h-5 w-5" />}>
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-sm font-medium text-[#54052D] dark:text-foreground">Link de indicação no perfil</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Cada jogador tem um link. Quem cria a conta por ele só libera o prêmio de quem indicou depois de fazer <b className="text-foreground">1 depósito pago</b> e
              <b className="text-foreground"> jogar</b> o mínimo de rodadas abaixo. O valor entra no saldo do indicador uma vez por amigo e aparece em Bônus. Desligado, o link some do perfil.
            </p>
          </div>
          <button role="switch" aria-checked={c.indicacaoAtiva} aria-label="Ligar indique e ganhe" disabled={salvar.isPending}
            onClick={() => salvar.mutate({ indicacaoAtiva: !c.indicacaoAtiva })}
            className={cn("relative shrink-0 h-7 w-12 rounded-full border-2 border-[#9B5BF8] transition-colors disabled:opacity-50", c.indicacaoAtiva ? "bg-[#9B5BF8]" : "bg-transparent")}>
            <span className={cn("absolute top-0.5 h-5 w-5 rounded-full transition-all", c.indicacaoAtiva ? "left-[22px] bg-white" : "left-0.5 bg-[#9B5BF8]")} />
          </button>
        </div>
        <form className="mt-5 flex flex-wrap items-center gap-3" onSubmit={(e) => { e.preventDefault(); salvar.mutate({ indicacao: Number(indicacao), indicacaoMinRodadas: Number(minRodadas) }); }}>
          <label htmlFor="indicacao" className="text-sm font-medium text-[#54052D] dark:text-foreground">Ganho por indicação</label>
          <div className="flex items-center rounded-full border border-border bg-white dark:bg-transparent h-9 px-3 focus-within:border-primary">
            <span className="text-sm text-muted-foreground mr-1">R$</span>
            <input id="indicacao" type="number" min={0.01} max={1000} step="0.01" inputMode="decimal" value={indicacao} onChange={(e) => setIndicacao(e.target.value)} className="w-28 bg-transparent text-sm outline-none tabular-nums" />
          </div>
          <label htmlFor="min-rodadas" className="text-sm font-medium text-[#54052D] dark:text-foreground">Rodadas mínimas do indicado</label>
          <div className="flex items-center rounded-full border border-border bg-white dark:bg-transparent h-9 px-3 focus-within:border-primary">
            <input id="min-rodadas" type="number" min={0} max={1000} step="1" inputMode="numeric" value={minRodadas} onChange={(e) => setMinRodadas(e.target.value)} className="w-16 bg-transparent text-sm outline-none tabular-nums" />
          </div>
          <button type="submit" disabled={salvar.isPending || !(Number(indicacao) > 0) || !Number.isInteger(Number(minRodadas)) || minRodadas === "" || (Number(indicacao) === c.indicacao && Number(minRodadas) === c.indicacaoMinRodadas)}
            className="h-9 px-5 rounded-full bg-[#9B5BF8] hover:bg-[#884BE0] text-white text-sm font-semibold disabled:opacity-50">Salvar</button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">Mudar o valor vale pras indicações liberadas daqui pra frente; as já liberadas mantêm o valor de quando liberaram.</p>
      </Panel>

      <Panel title="Auto-balanço do RTP" icon={<Scale className="h-5 w-5" />}>
        <div className="flex items-start justify-between gap-6">
          <p className="text-sm text-muted-foreground">
            Se o lucro dos jogos (apostado − prêmios) ficar <b className="text-foreground">negativo</b> na janela escolhida, todos os jogos vão pro RTP mínimo.
            Quando o lucro voltar a ficar <b className="text-foreground">positivo</b>, cada jogo volta pro RTP que tinha antes. Confere a cada minuto; vale igual pra todos os
            jogadores e quem está jogando vê o aviso e a tabela nova depois da rodada em andamento.
          </p>
          {/* switch no estilo do "Lembrar-me" da loja */}
          <button role="switch" aria-checked={c.autoBalanco} aria-label="Ligar auto-balanço" disabled={salvar.isPending}
            onClick={() => salvar.mutate({ autoBalanco: !c.autoBalanco })}
            className={cn("relative shrink-0 h-7 w-12 rounded-full border-2 border-[#9B5BF8] transition-colors disabled:opacity-50", c.autoBalanco ? "bg-[#9B5BF8]" : "bg-transparent")}>
            <span className={cn("absolute top-0.5 h-5 w-5 rounded-full transition-all", c.autoBalanco ? "left-[22px] bg-white" : "left-0.5 bg-[#9B5BF8]")} />
          </button>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-[#54052D] dark:text-foreground">Calcular o lucro com</span>
          <Select value={String(c.janelaHoras)} onValueChange={(v) => salvar.mutate({ janelaHoras: +v })}>
            <SelectTrigger className="h-9 w-[200px] rounded-full"><SelectValue /></SelectTrigger>
            <SelectContent>{JANELAS.map((j) => <SelectItem key={j.h} value={String(j.h)}>{j.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-xl border border-border/60 p-4">
            <p className="text-xs text-muted-foreground">Lucro da casa na janela</p>
            <p className={cn("mt-1 text-xl font-bold", c.lucroJanela < 0 ? "text-[#CC0854]" : "text-[#45BC56]")}>{brl(c.lucroJanela)}</p>
          </div>
          <div className="rounded-xl border border-border/60 p-4">
            <p className="text-xs text-muted-foreground">Situação</p>
            <p className={cn("mt-1 text-base font-semibold", c.balancoAtivo ? "text-[#CC0854]" : "text-[#54052D] dark:text-foreground")}>
              {c.balancoAtivo ? `RTP mínimo em todos os jogos desde ${dataHora(c.ativadoEm)}` : c.autoBalanco || c.metaHoraAtiva ? "Vigiando: RTPs normais" : "Desligado"}
            </p>
            {c.balancoAtivo && c.motivoBalanco && (
              <p className="mt-1 text-xs text-muted-foreground">
                Motivo: {{ janela: "casa negativa na janela", hora: "última hora abaixo da meta", "janela+hora": "casa negativa e última hora abaixo da meta" }[c.motivoBalanco] ?? c.motivoBalanco}
              </p>
            )}
          </div>
        </div>

        <div className="mt-5 flex gap-3 rounded-xl border border-[#F59E0B]/30 bg-[#F59E0B]/10 p-4 text-xs text-[#b77400] dark:text-[#F5B94B]">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <p>
            Com dinheiro de verdade, jogo que muda o RTP conforme o resultado da casa costuma ser proibido em mercado regulado (a SPA exige RTP fixo e certificado por jogo).
            Confirme com o jurídico antes de ligar. O lucro vem das rodadas informadas pelos próprios jogos no navegador.
          </p>
        </div>
        {c.atualizadoPor && <p className="mt-3 text-xs text-muted-foreground">Última mudança: {c.atualizadoPor} · {dataHora(c.atualizadoEm)}</p>}
      </Panel>

      <Panel title="Meta de lucro por hora" icon={<Clock className="h-5 w-5" />}>
        <div className="flex items-start justify-between gap-6">
          <p className="text-sm text-muted-foreground">
            Se o lucro da <b className="text-foreground">última hora</b> ficar abaixo da meta, todos os jogos também vão pro RTP mínimo; voltam quando a última hora
            bater a meta (e a janela acima estiver positiva, se o auto-balanço estiver ligado). Com meta R$ 0, a hora precisa não dar prejuízo; hora sem nenhuma rodada não baixa.
          </p>
          <button role="switch" aria-checked={c.metaHoraAtiva} aria-label="Ligar meta de lucro por hora" disabled={salvar.isPending}
            onClick={() => salvar.mutate({ metaHoraAtiva: !c.metaHoraAtiva })}
            className={cn("relative shrink-0 h-7 w-12 rounded-full border-2 border-[#9B5BF8] transition-colors disabled:opacity-50", c.metaHoraAtiva ? "bg-[#9B5BF8]" : "bg-transparent")}>
            <span className={cn("absolute top-0.5 h-5 w-5 rounded-full transition-all", c.metaHoraAtiva ? "left-[22px] bg-white" : "left-0.5 bg-[#9B5BF8]")} />
          </button>
        </div>
        <form className="mt-5 flex flex-wrap items-center gap-3" onSubmit={(e) => { e.preventDefault(); salvar.mutate({ metaHora: Number(meta) }); }}>
          <label htmlFor="meta" className="text-sm font-medium text-[#54052D] dark:text-foreground">Meta por hora</label>
          <div className="flex items-center rounded-full border border-border bg-white dark:bg-transparent h-9 px-3 focus-within:border-primary">
            <span className="text-sm text-muted-foreground mr-1">R$</span>
            <input id="meta" type="number" min={0} step="0.01" inputMode="decimal" value={meta} onChange={(e) => setMeta(e.target.value)} className="w-28 bg-transparent text-sm outline-none tabular-nums" />
          </div>
          <button type="submit" disabled={salvar.isPending || meta === "" || Number(meta) === c.metaHora}
            className="h-9 px-5 rounded-full bg-[#9B5BF8] hover:bg-[#884BE0] text-white text-sm font-semibold disabled:opacity-50">Salvar meta</button>
        </form>
        <div className="mt-5 rounded-xl border border-border/60 p-4 max-w-xs">
          <p className="text-xs text-muted-foreground">Lucro da última hora</p>
          <p className={cn("mt-1 text-xl font-bold", c.lucroHora < c.metaHora ? "text-[#CC0854]" : "text-[#45BC56]")}>{brl(c.lucroHora)}</p>
          <p className="text-xs text-muted-foreground">meta {brl(c.metaHora)}</p>
        </div>
      </Panel>
    </div>
  );
}
