import { Transform } from 'class-transformer';
import { ValidateBy, ValidationOptions } from 'class-validator';

export function cpfValido(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  for (const len of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < len; i++) soma += Number(cpf[i]) * (len + 1 - i);
    if (((soma * 10) % 11) % 10 !== Number(cpf[len])) return false;
  }
  return true;
}

export function idade(nascimento: Date, hoje = new Date()): number {
  const aniversarioPassou =
    hoje.getUTCMonth() > nascimento.getUTCMonth() ||
    (hoje.getUTCMonth() === nascimento.getUTCMonth() && hoje.getUTCDate() >= nascimento.getUTCDate());
  return hoje.getUTCFullYear() - nascimento.getUTCFullYear() - (aniversarioPassou ? 0 : 1);
}

export const IsCpf = (opts?: ValidationOptions) =>
  ValidateBy(
    { name: 'isCpf', validator: { validate: (v) => typeof v === 'string' && cpfValido(v), defaultMessage: () => 'CPF inválido' } },
    opts,
  );

export const IsAdult = (opts?: ValidationOptions) =>
  ValidateBy(
    {
      name: 'isAdult',
      validator: {
        validate: (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v)) && idade(new Date(v)) >= 18,
        defaultMessage: () => 'Só maiores de 18 anos',
      },
    },
    opts,
  );

/** "529.982.247-25" -> "52998224725" */
export const OnlyDigits = () => Transform(({ value }) => (typeof value === 'string' ? value.replace(/\D/g, '') : value));
export const Trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
export const LowerTrim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value));

export const SENHA_REGRA = /^(?=.*[A-Za-z])(?=.*\d).{8,128}$/;
export const SENHA_MSG = 'Mínimo 8 caracteres, com letras e números';
