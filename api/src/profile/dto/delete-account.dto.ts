import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class DeleteAccountDto {
  @IsString()
  @IsNotEmpty({ message: 'Confirme com sua senha' })
  @MaxLength(128)
  senha: string;
}
