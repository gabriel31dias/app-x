import { IsEmail, IsInt, IsOptional, IsString, Matches, Max, Min, MinLength } from 'class-validator';

export class CreatePixDepositDto {
  @IsInt()
  @Min(100)
  @Max(500_000_00)
  amountCents: number;

  @IsString()
  @MinLength(3)
  buyerName: string;

  @Matches(/^\d{11,14}$/)
  buyerDocument: string;

  @Matches(/^\d{10,13}$/)
  buyerPhone: string;

  @IsOptional()
  @IsEmail()
  buyerEmail?: string;
}
