// XP acumulado pra chegar no nível n: 0, 1000, 3000, 6000, 10000, 15000...
export const xpParaNivel = (n: number) => 500 * n * (n - 1);

export function nivelDe(xp: number) {
  let nivel = 1;
  while (xpParaNivel(nivel + 1) <= xp) nivel++;
  const inicio = xpParaNivel(nivel), fim = xpParaNivel(nivel + 1);
  return {
    nivel,
    vip: nivel >= 8 ? 'Diamante' : nivel >= 5 ? 'Ouro' : nivel >= 3 ? 'Prata' : 'Bronze',
    xp,
    xpNivelAtual: xp - inicio,
    xpProximoNivel: fim - inicio,
    progresso: Math.floor(((xp - inicio) / (fim - inicio)) * 100),
  };
}
