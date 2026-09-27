import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** usuário carregado pelo AuthGuard */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().user);
