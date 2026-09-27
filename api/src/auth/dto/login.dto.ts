import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../common/validators.js';

export class LoginDto {
  /** e-mail ou CPF (com ou sem pontuação) */
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Informe seu e-mail ou CPF' })
  @MaxLength(254)
  login: string;

  @IsString()
  @IsNotEmpty({ message: 'Informe sua senha' })
  @MaxLength(128)
  senha: string;
}
