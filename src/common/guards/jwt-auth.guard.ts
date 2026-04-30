import {
  Injectable, CanActivate, ExecutionContext, UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

/**
 * L'API Gateway valide le JWT et injecte les claims dans les headers.
 * Ce guard lit ces headers — il ne re-valide PAS le token (confiance réseau interne).
 *
 * Headers injectés par la Gateway :
 *   X-User-Id    : UUID de l'utilisateur
 *   X-User-Email : email
 *   X-User-Roles : rôles séparés par virgules  (ex: "user,admin")
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req    = context.switchToHttp().getRequest<Request>();
    const userId = req.headers['x-user-id']    as string | undefined;
    const email  = req.headers['x-user-email'] as string | undefined;
    const roles  = req.headers['x-user-roles'] as string | undefined;

    if (!userId || !email) {
      throw new UnauthorizedException({
        code:    'MISSING_AUTH_HEADERS',
        message: 'Headers X-User-Id et X-User-Email requis',
      });
    }

    (req as any).user = {
      id:    userId,
      email,
      roles: roles ? roles.split(',') : [],
    };

    return true;
  }
}
