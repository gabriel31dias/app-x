import type { User } from '../generated/prisma/client.js';
import { nivelDe } from './levels.js';

export const AVATAR_PADRAO = '/avatars/padrao.png';

/** o que o site pode ver do usuário: nunca devolve senhaHash/tokenVersion, CPF vai mascarado */
export function toProfile(u: User) {
  return {
    id: u.id,
    nome: u.nome,
    primeiroNome: u.nome.split(' ')[0],
    email: u.email,
    cpf: `***.${u.cpf.slice(3, 6)}.${u.cpf.slice(6, 9)}-**`,
    celular: u.celular,
    nascimento: u.nascimento.toISOString().slice(0, 10),
    avatarUrl: u.avatarUrl ?? AVATAR_PADRAO,
    ...nivelDe(u.xp),
    membroDesde: u.createdAt.toISOString(),
    ultimoLoginEm: u.ultimoLoginEm?.toISOString() ?? null,
  };
}
