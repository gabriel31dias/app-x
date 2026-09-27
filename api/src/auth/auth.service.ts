import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toProfile } from '../profile/profile.mapper.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { DUMMY_HASH, hashPassword, verifyPassword } from './password.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const [cpfUsado, emailUsado] = await Promise.all([
      this.prisma.user.findUnique({ where: { cpf: dto.cpf }, select: { id: true } }),
      this.prisma.user.findUnique({ where: { email: dto.email }, select: { id: true } }),
    ]);
    if (cpfUsado || emailUsado) {
      const erros: Record<string, string> = {};
      if (cpfUsado) erros.cpf = 'CPF já cadastrado';
      if (emailUsado) erros.email = 'E-mail já cadastrado';
      throw new ConflictException({ message: 'Conta já existe', erros });
    }

    const user = await this.prisma.user.create({
      data: {
        nome: dto.nome,
        cpf: dto.cpf,
        email: dto.email,
        celular: dto.celular,
        nascimento: new Date(dto.nascimento),
        senhaHash: await hashPassword(dto.senha),
        termosAceitosEm: new Date(),
        ultimoLoginEm: new Date(),
      },
    });
    return this.session(user);
  }

  async login(dto: LoginDto) {
    const digitos = dto.login.replace(/\D/g, '');
    const ehCpf = /^[\d.\-\s]+$/.test(dto.login) && digitos.length === 11;
    const user = await this.prisma.user.findUnique({
      where: ehCpf ? { cpf: digitos } : { email: dto.login.toLowerCase() },
    });

    // mesma mensagem e mesmo tempo pra "não existe" e "senha errada"
    const ok = await verifyPassword(dto.senha, user?.senhaHash ?? DUMMY_HASH);
    if (!user || !ok) throw new UnauthorizedException('E-mail/CPF ou senha incorretos');

    const atualizado = await this.prisma.user.update({ where: { id: user.id }, data: { ultimoLoginEm: new Date() } });
    return this.session(atualizado);
  }

  /** derruba todos os tokens desse usuário (todos os aparelhos) */
  async logout(user: User) {
    await this.prisma.user.update({ where: { id: user.id }, data: { tokenVersion: { increment: 1 } } });
  }

  async session(user: User) {
    const accessToken = await this.jwt.signAsync({ sub: user.id, v: user.tokenVersion });
    return { accessToken, user: toProfile(user) };
  }
}
