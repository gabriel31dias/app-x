import { io, type Socket } from "socket.io-client";
import { useEffect, useState } from "react";
import { session } from "./api";

export type Sessao = { id: string; jogo: string; nome: string; jogador: string | null; jogadorNome: string | null; desde: string; assistindo: number };

// uma conexão só pro painel todo (lista de quem está jogando + player)
let socket: Socket | null = null;
export function aoVivoSocket() {
  if (!socket) {
    socket = io(location.origin + "/ao-vivo", { path: "/api/socket.io", auth: { papel: "admin", token: session.token() } });
  }
  return socket;
}

/** sessões de jogo abertas agora, atualizadas pelo servidor em tempo real */
export function useSessoesAoVivo() {
  const [sessoes, setSessoes] = useState<Sessao[]>([]);
  const [conectado, setConectado] = useState(false);
  useEffect(() => {
    const s = aoVivoSocket();
    const on = () => setConectado(true), off = () => setConectado(false);
    s.on("sessoes", setSessoes).on("connect", on).on("disconnect", off);
    if (s.connected) on();
    return () => { s.off("sessoes", setSessoes).off("connect", on).off("disconnect", off); };
  }, []);
  return { sessoes, conectado };
}
