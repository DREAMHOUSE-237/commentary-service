import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUser }                      from '../interfaces/authenticated-user.interface';

/**
 * Extrait l'utilisateur attaché par JwtAuthGuard depuis req.user.
 * Usage : @CurrentUser() user: AuthenticatedUser
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    return ctx.switchToHttp().getRequest().user;
  },
);
