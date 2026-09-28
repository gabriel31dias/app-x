import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';

/** logado com a conta de um influencer ativo; deixa o influencer em req.influencer */
@Injectable()
export class InfluencerGuard extends AuthGuard {
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    await super.canActivate(ctx);
    const req = ctx.switchToHttp().getRequest();
    const inf = await this.prisma.influencer.findUnique({ where: { userId: req.user.id } });
    if (!inf?.ativo) throw new ForbiddenException('Só influencers');
    req.influencer = inf;
    return true;
  }
}
