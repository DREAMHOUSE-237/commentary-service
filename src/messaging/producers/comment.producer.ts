import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { ClientProxy }                              from '@nestjs/microservices';
import { firstValueFrom }                          from 'rxjs';

export interface CommentCreatedPayload {
  commentId:     string;
  publicationId: string;
  authorId:      string;
  parentId:      string | null;
  createdAt:     string;
}

@Injectable()
export class CommentProducer implements OnModuleInit {
  private readonly logger = new Logger(CommentProducer.name);

  constructor(
    @Inject('RABBITMQ_CLIENT') private readonly client: ClientProxy,
  ) {}

  async onModuleInit(): Promise<void> {
    // Tente la connexion au démarrage — échoue gracieusement si RabbitMQ est absent
    try {
      await this.client.connect();
      this.logger.log('Connecté à RabbitMQ (producer)');
    } catch {
      this.logger.warn('RabbitMQ indisponible au démarrage – les événements seront perdus');
    }
  }

  /**
   * Publie comment.created après création d'un commentaire.
   *
   * Exemple de payload :
   * {
   *   "commentId":     "a1b2-...",
   *   "publicationId": "pub-uuid",
   *   "authorId":      "user-uuid",
   *   "parentId":      null,
   *   "createdAt":     "2025-04-06T14:32:00.000Z"
   * }
   */
  async emitCommentCreated(payload: CommentCreatedPayload): Promise<void> {
    try {
      await firstValueFrom(this.client.emit('comment.created', payload));
      this.logger.log(`[comment.created] publié [id=${payload.commentId}]`);
    } catch (err) {
      // On log mais on ne bloque pas la réponse HTTP — l'événement est best-effort
      this.logger.error(`[comment.created] échec de publication`, err);
    }
  }

  /**
   * Publie comment.reported après un signalement.
   */
  async emitCommentReported(payload: { commentId: string; reportedBy: string; reason: string }): Promise<void> {
    try {
      await firstValueFrom(this.client.emit('comment.reported', payload));
      this.logger.log(`[comment.reported] publié [id=${payload.commentId}]`);
    } catch (err) {
      this.logger.error(`[comment.reported] échec de publication`, err);
    }
  }
}
