import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service.js';

export type TokenPayload = { sub: string; v: number };

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const [tipo, token] = (req.headers.authorization ?? '').split(' ');
    if (tipo !== 'Bearer' || !token) throw new UnauthorizedException('Faça login para continuar');

    let payload: TokenPayload;
    try {
      payload = await this.jwt.verifyAsync<TokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Sessão expirada, entre de novo');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    // tokenVersion diferente = saiu da conta ou trocou a senha depois que esse token foi emitido
    if (!user || user.tokenVersion !== payload.v) throw new UnauthorizedException('Sessão encerrada, entre de novo');

    req.user = user;
    return true;
  }
}
