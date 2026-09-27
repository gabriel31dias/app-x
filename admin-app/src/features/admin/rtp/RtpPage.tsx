import type { RtpAlteracao, RtpJogo, RtpLista } from "@/features/admin/types";
import { IconBox, Panel, Table } from "@/shared/components/admin";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/shared/components/ui/alert-dialog";
import { Button } from "@/shared/components/ui/button";
import { api } from "@/shared/lib/api";
import { dataHora, pct } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gamepad2, History, Loader2, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { Config } from "@/features/admin/config/ConfiguracoesPage";
import { toast } from "sonner";

export function RtpPage() {
  const qc = useQueryClient();
  const lista = useQuery({ queryKey: ["rtp"], queryFn: () => api<RtpLista>("/admin/rtp") });
  const hist = useQuery({ queryKey: ["rtp-hist"], queryFn: () => api<RtpAlteracao[]>("/admin/rtp/historico") });
  const config = useQuery({ queryKey: ["config"], queryFn: () => api<Config>("/admin/config") });
  const travado = !!config.data?.balancoAtivo;
  const [editado, setEditado] = useState<Record<string, string>>({});
  const [confirmar, setConfirmar] = useState<{ jogo: RtpJogo; rtp: number } | null>(null);

  const salvar = useMutation({
    mutationFn: ({ jogo, rtp }: { jogo: string; rtp: number }) => api(`/admin/rtp/${jogo}`, { method: "PUT", body: JSON.stringify({ rtp }) }),
    onSuccess: (_, { jogo }) => {
      toast.success("RTP atualizado", { description: "Quem está jogando recebe em até 10 s, depois da rodada em andamento." });
      setEditado(({ [jogo]: _x, ...resto }) => resto);
      qc.invalidateQueries({ queryKey: ["rtp"] });
      qc.invalidateQueries({ queryKey: ["rtp-hist"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e) => toast.error("Não salvou", { description: (e as Error).message }),
  });

  const cfg = lista.data;
  const nomeDe = (id: string) => cfg?.jogos.find((j) => j.jogo === id)?.nome ?? id;

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {travado && (
        <div className="rounded-2xl border border-[#CC0854]/30 bg-[#CC0854]/10 p-4 text-sm text-[#CC0854]">
          <b>Auto-balanço ativo</b> desde {dataHora(config.data!.ativadoEm)}: a casa está negativa e todos os jogos estão no RTP mínimo. Os valores voltam sozinhos quando o lucro ficar positivo.
          Pra mudar na mão, desligue em <Link to="/configuracoes" className="underline font-semibold">Configurações</Link>.
        </div>
      )}
      <Panel title="RTP de cada jogo" icon={<SlidersHorizontal className="h-5 w-5" />}>
        <p className="text-sm text-muted-foreground mb-5 max-w-3xl">
          Quanto do total apostado volta pros jogadores, em média. Vale igual pra todos os jogadores e chega em até 10 s a quem está com o jogo aberto: a rodada ou partida em andamento termina com o valor antigo e o jogador vê um aviso.
          Os prêmios mudam na mesma proporção e a tabela de pagamentos mostrada no jogo acompanha.
          {cfg && <> Permitido entre <b className="text-foreground">{pct(cfg.min)}</b> e <b className="text-foreground">{pct(cfg.max)}</b>.</>}
        </p>
        {lista.isLoading && <div className="h-40 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}
        {lista.error && <p className="text-sm text-destructive">{(lista.error as Error).message}</p>}

        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
          {cfg?.jogos.map((j) => {
            const valor = editado[j.jogo] ?? String(+(j.rtp * 100).toFixed(2));
            const novo = Number(valor) / 100;
            const mudou = valor !== "" && Math.abs(novo - j.rtp) > 1e-6;
            const fora = valor !== "" && (novo < cfg.min || novo > cfg.max);
            return (
              <div key={j.jogo} className="rounded-2xl border border-border/60 p-5 flex flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <IconBox size={44}><Gamepad2 className="h-5 w-5" /></IconBox>
                    <div className="min-w-0">
                      <p className="font-semibold text-[#54052D] dark:text-foreground truncate">{j.nome}</p>
                      <p className="text-xs text-muted-foreground">fábrica {pct(j.fabrica)}</p>
                    </div>
                  </div>
                  <span className={cn("shrink-0 rounded-full px-3 py-1 text-[11px] font-medium", j.atualizadoPor ? "bg-[#9B5BF8]/10 text-[#9B5BF8]" : "bg-muted text-muted-foreground")}>
                    {j.atualizadoPor ? "ajustado" : "de fábrica"}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className={cn("flex items-center rounded-xl border bg-white dark:bg-transparent px-3 h-11 flex-1", fora ? "border-destructive" : "border-border focus-within:border-primary")}>
                    <input
                      type="number" inputMode="decimal" step="0.1" min={cfg.min * 100} max={cfg.max * 100} value={valor}
                      onChange={(e) => setEditado((s) => ({ ...s, [j.jogo]: e.target.value }))}
                      className="w-full bg-transparent text-lg font-bold text-[#54052D] dark:text-foreground outline-none tabular-nums"
                      aria-label={`RTP de ${j.nome} em %`} aria-invalid={fora}
                    />
                    <span className="text-muted-foreground font-semibold">%</span>
                  </div>
                  <Button disabled={!mudou || fora || salvar.isPending || travado} onClick={() => setConfirmar({ jogo: j, rtp: novo })}
                    className="h-11 rounded-xl bg-[#9B5BF8] hover:bg-[#884BE0] text-white font-bold px-5">Salvar</Button>
                </div>
                <p className="text-xs text-muted-foreground min-h-[16px]">
                  {fora ? <span className="text-destructive">Fora do limite de {pct(cfg.min)} a {pct(cfg.max)}</span>
                    : j.atualizadoPor ? `${j.atualizadoPor} · ${dataHora(j.atualizadoEm)}` : "Nunca alterado"}
                </p>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title="Histórico de alterações" icon={<History className="h-5 w-5" />}>
        <Table head={["Data", "Jogo", "De", "Para", "Quem"]} empty={hist.data?.length === 0}>
          {hist.data?.map((h) => (
            <tr key={h.id}>
              <td className="!text-muted-foreground">{dataHora(h.em)}</td>
              <td className="font-medium">{nomeDe(h.jogo)}</td>
              <td>{h.de == null ? "fábrica" : pct(h.de, 2)}</td>
              <td className="font-semibold">{pct(h.para, 2)}</td>
              <td className="!text-muted-foreground">{h.por}</td>
            </tr>
          ))}
        </Table>
      </Panel>

      <AlertDialog open={!!confirmar} onOpenChange={(o) => !o && setConfirmar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mudar o RTP de {confirmar?.jogo.nome}?</AlertDialogTitle>
            <AlertDialogDescription>
              De {pct(confirmar?.jogo.rtp, 2)} para {pct(confirmar?.rtp, 2)}. Todos os prêmios do jogo mudam na mesma proporção, pra todos os jogadores, inclusive quem está jogando agora (depois da rodada em andamento). A mudança fica registrada no histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-[#9B5BF8] hover:bg-[#884BE0]" onClick={() => confirmar && salvar.mutate({ jogo: confirmar.jogo.jogo, rtp: confirmar.rtp })}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
