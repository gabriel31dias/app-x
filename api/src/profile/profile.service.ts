import { BadRequestException, Injectable } from '@nestjs/common';
import type { User } from '../generated/prisma/client.js';
import { AuthService } from '../auth/auth.service.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { toProfile } from './profile.mapper.js';

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  get(user: User) {
    return toProfile(user);
  }

  async update(user: User, dto: UpdateProfileDto) {
    const atualizado = await this.prisma.user.update({ where: { id: user.id }, data: dto });
    return toProfile(atualizado);
  }

  /** troca a senha, derruba as outras sessões e devolve um token novo pra este aparelho */
  async changePassword(user: User, dto: ChangePasswordDto) {
    if (!(await verifyPassword(dto.senhaAtual, user.senhaHash)))
      throw new BadRequestException({ message: 'Senha atual incorreta', erros: { senhaAtual: 'Senha atual incorreta' } });
    if (dto.senhaAtual === dto.novaSenha)
      throw new BadRequestException({ message: 'Use uma senha diferente da atual', erros: { novaSenha: 'Use uma senha diferente da atual' } });

    const atualizado = await this.prisma.user.update({
      where: { id: user.id },
      data: { senhaHash: await hashPassword(dto.novaSenha), tokenVersion: { increment: 1 } },
    });
    return this.auth.session(atualizado);
  }

  /** exclusão definitiva (direito do titular pela LGPD) */
  async delete(user: User, senha: string) {
    if (!(await verifyPassword(senha, user.senhaHash)))
      throw new BadRequestException({ message: 'Senha incorreta', erros: { senha: 'Senha incorreta' } });
    await this.prisma.user.delete({ where: { id: user.id } });
  }
}
