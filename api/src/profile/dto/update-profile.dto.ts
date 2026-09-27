import { IsOptional, IsString, Length, Matches } from 'class-validator';
import { OnlyDigits, Trim } from '../../common/validators.js';

// CPF, e-mail e nascimento não mudam por aqui (identidade da conta)
export class UpdateProfileDto {
  @IsOptional()
  @Trim()
  @IsString()
  @Length(3, 100, { message: 'Nome deve ter entre 3 e 100 letras' })
  @Matches(/\S+\s+\S+/, { message: 'Digite nome e sobrenome' })
  nome?: string;

  @IsOptional()
  @OnlyDigits()
  @Matches(/^\d{10,11}$/, { message: 'Celular inválido' })
  celular?: string;
}
