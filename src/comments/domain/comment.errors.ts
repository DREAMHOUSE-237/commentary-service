/**
 * Hiérarchie d'erreurs métier — indépendantes de NestJS et du transport HTTP.
 * Transportables dans n'importe quel contexte (HTTP, RabbitMQ, CLI).
 */

export class CommentDomainError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'CommentDomainError';
  }
}

export class CommentNotFoundError extends CommentDomainError {
  constructor(id: string) {
    super(`Commentaire introuvable : ${id}`, 'COMMENT_NOT_FOUND');
  }
}

export class CommentDepthExceededError extends CommentDomainError {
  constructor() {
    super('Profondeur maximale atteinte (limite : 2 niveaux)', 'COMMENT_DEPTH_EXCEEDED');
  }
}

export class CommentNotActiveError extends CommentDomainError {
  constructor(id: string, status: string) {
    super(
      `Impossible de répondre à un commentaire avec le statut "${status}" (id: ${id})`,
      'COMMENT_NOT_ACTIVE',
    );
  }
}

export class CommentForbiddenError extends CommentDomainError {
  constructor(action: string) {
    super(`Action interdite : ${action}`, 'COMMENT_FORBIDDEN');
  }
}

export class CommentContentInvalidError extends CommentDomainError {
  constructor(reason: string) {
    super(`Contenu invalide : ${reason}`, 'COMMENT_CONTENT_INVALID');
  }
}
