import {
  ExceptionFilter, Catch, ArgumentsHost, BadRequestException, Logger,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { ApiResponse }       from '../interfaces/api-response.interface';

/**
 * Formate les erreurs de class-validator en réponse API standardisée.
 */
@Catch(BadRequestException)
export class ValidationExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ValidationExceptionFilter.name);

  catch(exception: BadRequestException, host: ArgumentsHost): void {
    const ctx  = host.switchToHttp();
    const res  = ctx.getResponse<Response>();
    const req  = ctx.getRequest<Request>();
    const body = exception.getResponse() as any;

    this.logger.warn(`Validation failed – ${req.method} ${req.url}`);

    const messages: string[] = Array.isArray(body?.message)
      ? body.message
      : [body?.message ?? 'Données invalides'];

    res.status(400).json(
      ApiResponse.fail({
        code:    'VALIDATION_ERROR',
        message: 'Les données envoyées sont invalides',
        details: { fields: messages },
      }),
    );
  }
}
