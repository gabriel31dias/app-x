import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthGuard } from './auth.guard.js';

/** logado e com o e-mail em ADMIN_EMAILS (separados por vírgula) */
@Injectable()
export class AdminGuard extends AuthGuard {
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    await super.canActivate(ctx);
    const admins = (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
    if (!admins.includes(ctx.switchToHttp().getRequest().user.email)) throw new ForbiddenException('Só administradores');
    return true;
  }
}
