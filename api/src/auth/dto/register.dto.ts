import { Equals, IsEmail, IsISO8601, IsString, Length, Matches } from 'class-validator';
import { IsAdult, IsCpf, LowerTrim, OnlyDigits, SENHA_MSG, SENHA_REGRA, Trim } from '../../common/validators.js';

export class RegisterDto {
  @Trim()
  @IsString()
  @Length(3, 100, { message: 'Nome deve ter entre 3 e 100 letras' })
  @Matches(/\S+\s+\S+/, { message: 'Digite nome e sobrenome' })
  nome: string;

  @OnlyDigits()
  @IsCpf()
  cpf: string;

  @LowerTrim()
  @IsEmail({}, { message: 'E-mail inválido' })
  email: string;

  @OnlyDigits()
  @Matches(/^\d{10,11}$/, { message: 'Celular inválido' })
  celular: string;

  @IsISO8601({ strict: true }, { message: 'Data de nascimento inválida (use AAAA-MM-DD)' })
  @IsAdult()
  nascimento: string;

  @IsString()
  @Matches(SENHA_REGRA, { message: SENHA_MSG })
  senha: string;

  @Equals(true, { message: 'Confirme que tem 18+ e aceita os termos' })
  aceitouTermos: boolean;
}
