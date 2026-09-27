export type Periodo = { startDate: string; endDate: string };

export type Venda = { id: string; nome: string; documento: string; email: string | null; celular: string; valor: number; liquido: number | null; status: "pago" | "pendente" | "falhou"; statusBruto: string; criadoEm: string; pagoEm: string | null };

export type Dashboard = {
  periodo: { de: string; ate: string; granularidade: "hora" | "dia" };
  vendas: { valor: number; liquido: number; quantidade: number; ticketMedio: number; clientes: number; pendentes: { quantidade: number; valor: number }; falhas: { quantidade: number; valor: number }; conversao: number | null };
  jogos: { apostado: number; premios: number; lucro: number; rtpReal: number | null; rodadas: number; jogadores: number };
  bonus: { valor: number; quantidade: number; cadastro: BonusResumo; diario: BonusResumo };
  lucroLiquido: number; // lucro dos jogos − bônus
  serie: { rotulo: string; vendas: number; quantidade: number; apostado: number; lucro: number; bonus: number; lucroLiquido: number }[];
  porJogo: { jogo: string; nome: string; apostado: number; premios: number; lucro: number; rtpReal: number | null; rtpConfig: number; rodadas: number }[];
  ultimasVendas: Venda[];
};

export type Pagina<T, S> = { itens: T[]; total: number; pagina: number; porPagina: number; soma: S };

export type BonusResumo = { quantidade: number; valor: number };
export type Bonus = { id: number; tipo: "cadastro" | "diario"; jogador: string; nome: string | null; valor: number; criadoEm: string };
export type BonusSoma = { valor: number; cadastro: BonusResumo; diario: BonusResumo };

export type Rodada = { id: number; jogo: string; nome: string; jogador: string | null; aposta: number; premio: number; lucro: number; criadoEm: string };

export type RtpJogo = { jogo: string; nome: string; fabrica: number; rtp: number; atualizadoPor: string | null; atualizadoEm: string | null };
export type RtpLista = { min: number; max: number; jogos: RtpJogo[] };
export type RtpAlteracao = { id: number; jogo: string; de: number | null; para: number; por: string; em: string };

// ids e nomes dos jogos com motor próprio (mesma lista da API, api/src/rtp/rtp.controller.ts)
export const JOGOS: Record<string, string> = {
  capivara: "Capivara da Sorte", gatinho: "Gatinho Flash", papagaio: "Papagaio Gay", macaco: "Macaco Pelado", raspa: "Raspadinha Premiada",
  bichos: "Bichos da Sorte", crash: "Galinha Angola Crash", truco: "Truco Aposta", sinuca: "Sinuca Aposta", velha: "Jogo da Velha Aposta", perereca: "Perereca Suicida", sapo: "Sapinho Pulador Crash",
};
