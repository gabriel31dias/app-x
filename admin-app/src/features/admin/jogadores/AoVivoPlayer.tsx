import { aoVivoSocket, type Sessao } from "@/shared/lib/aoVivo";
import { api } from "@/shared/lib/api";
import { ArrowDown, Loader2, Radio, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Replayer, type eventWithTime } from "rrweb";
import "rrweb/dist/style.css";
import { toast } from "sonner";

// player ao vivo: monta a tela do jogo a partir dos eventos do rrweb que o jogo transmite
export function AoVivoPlayer({ sessao, onClose }: { sessao: Sessao; onClose: () => void }) {
  const palco = useRef<HTMLDivElement>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"esperando" | "ao-vivo" | "fim">("esperando");
  const podeDerrubar = sessao.jogo === "crash" || sessao.jogo === "sapo" || sessao.jogo === "pato" || sessao.jogo === "barriga";
  const derrubar = useMutation({
    mutationFn: () => api(`/admin/ao-vivo/${encodeURIComponent(sessao.id)}/derrubar-crash`, { method: "POST" }),
    onSuccess: () => toast.success("Comando enviado", { description: "O personagem vai cair nessa sessão." }),
    onError: (e) => toast.error("Não deu pra derrubar", { description: (e as Error).message }),
  });

  useEffect(() => {
    const s = aoVivoSocket();
    const replayer = new Replayer([], { root: palco.current!, liveMode: true, UNSAFE_replayCanvas: true, mouseTail: false, showWarning: false });
    let iniciado = false;

    // encaixa a tela do jogo (tamanho do aparelho do jogador) na caixa do modal
    const encaixar = (d: { width: number; height: number }) => {
      const c = caixa.current, w = replayer.wrapper;
      if (!c || !d.width) return;
      const k = Math.min(c.clientWidth / d.width, c.clientHeight / d.height, 1);
      w.style.transform = `scale(${k})`;
      w.style.transformOrigin = "top left";
      w.style.marginLeft = `${(c.clientWidth - d.width * k) / 2}px`;
    };
    replayer.on("resize", (d) => encaixar(d as { width: number; height: number }));

    const onEv = ({ id, eventos }: { id: string; eventos: eventWithTime[] }) => {
      if (id !== sessao.id) return;
      for (const e of eventos) {
        if (!iniciado) {
          replayer.startLive(e.timestamp - 500); // meio segundo de folga pros lotes chegarem
          iniciado = true;
          setStatus("ao-vivo");
        }
        replayer.addEvent(e);
      }
    };
    const onFim = ({ id }: { id: string }) => id === sessao.id && setStatus("fim");
    s.on("ev", onEv).on("fim", onFim);
    s.emit("assistir", sessao.id);

    return () => {
      s.emit("parar");
      s.off("ev", onEv).off("fim", onFim);
      replayer.destroy();
    };
  }, [sessao.id]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`Assistindo ${sessao.jogadorNome ?? "visitante"}`} onClick={onClose}>
      <div className="w-full max-w-[1100px] h-[88vh] dark-card bg-white dark:bg-[#0C0E19] rounded-2xl border border-border/40 flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border/40">
          <div className="min-w-0">
            <p className="font-semibold text-[#54052D] dark:text-foreground truncate">{sessao.jogadorNome ?? "Visitante"} · {sessao.nome}</p>
            <p className="text-xs text-muted-foreground truncate">{sessao.jogador ?? "sem conta logada"}</p>
          </div>
          <div className="flex items-center gap-3">
            {podeDerrubar && (
              <button
                onClick={() => derrubar.mutate()}
                disabled={derrubar.isPending || status === "fim"}
                className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-3 py-1 text-xs font-semibold text-destructive hover:bg-destructive/20 disabled:opacity-50"
                title="Forçar o personagem a cair agora"
              >
                {derrubar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowDown className="h-3.5 w-3.5" />}Derrubar
              </button>
            )}
            {status === "ao-vivo" && <span className="flex items-center gap-1.5 rounded-full bg-[#CC0854]/10 px-3 py-1 text-xs font-semibold text-[#CC0854]"><Radio className="h-3.5 w-3.5 animate-pulse" />AO VIVO</span>}
            {status === "fim" && <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">Jogador saiu do jogo</span>}
            <button onClick={onClose} className="w-9 h-9 rounded-lg hover:bg-muted flex items-center justify-center text-[#9B5BF8]" aria-label="Fechar"><X className="h-5 w-5" /></button>
          </div>
        </div>
        <div ref={caixa} className="relative flex-1 overflow-hidden bg-[#050608]">
          {status === "esperando" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />Conectando na tela do jogador…
            </div>
          )}
          <div ref={palco} className="[&_.replayer-wrapper]:!relative" />
        </div>
      </div>
    </div>
  );
}
