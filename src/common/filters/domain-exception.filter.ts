import {
  ExceptionFilter, Catch, ArgumentsHost, HttpStatus, Logger,
} from '@nestjs/common';
import { Response, Request } from 'express';
import {
  CommentDomainError,
  CommentNotFoundError,
  CommentForbiddenError,
  CommentDepthExceededError,
  CommentNotActiveError,
  CommentContentInvalidError,
} from '../../comments/domain/comment.errors';
import { ApiResponse } from '../interfaces/api-response.interface';

/**
 * Traduit les erreurs métier (CommentDomainError) en réponses HTTP structurées.
 * Les erreurs domaine ne contiennent pas de code HTTP — ce filtre fait ce mapping.
 */
@Catch(CommentDomainError)
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: CommentDomainError, host: ArgumentsHost): void {
    const ctx    = host.switchToHttp();
    const res    = ctx.getResponse<Response>();
    const req    = ctx.getRequest<Request>();
    const status = this.toHttpStatus(exception);

    this.logger.warn(`[${exception.code}] ${exception.message} – ${req.method} ${req.url}`);

    res.status(status).json(
      ApiResponse.fail({ code: exception.code, message: exception.message }),
    );
  }

  private toHttpStatus(err: CommentDomainError): number {
    if (err instanceof CommentNotFoundError)       return HttpStatus.NOT_FOUND;            // 404
    if (err instanceof CommentForbiddenError)      return HttpStatus.FORBIDDEN;             // 403
    if (err instanceof CommentDepthExceededError)  return HttpStatus.UNPROCESSABLE_ENTITY;  // 422
    if (err instanceof CommentNotActiveError)      return HttpStatus.UNPROCESSABLE_ENTITY;  // 422
    if (err instanceof CommentContentInvalidError) return HttpStatus.BAD_REQUEST;           // 400
    return HttpStatus.INTERNAL_SERVER_ERROR;                                                // 500
  }
}
