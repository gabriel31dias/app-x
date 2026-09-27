import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { SENHA_MSG, SENHA_REGRA } from '../../common/validators.js';

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Informe a senha atual' })
  @MaxLength(128)
  senhaAtual: string;

  @IsString()
  @Matches(SENHA_REGRA, { message: SENHA_MSG })
  novaSenha: string;
}
