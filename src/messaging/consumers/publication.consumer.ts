import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload, Ctx, RmqContext } from '@nestjs/microservices';
import { CommentsService } from '../../comments/comments.service';

export interface PublicationDeletedPayload {
  publicationId: string;
  deletedAt:     string;
}

/**
 * Consumer RabbitMQ — écoute les événements émis par d'autres services.
 *
 * Pattern consommé : publication.deleted
 * Effet : soft-delete en cascade de tous les commentaires de la publication.
 *
 * Exemple de message reçu :
 * {
 *   "publicationId": "pub-uuid-ici",
 *   "deletedAt":     "2025-04-06T14:00:00.000Z"
 * }
 */
@Controller()
export class PublicationConsumer {
  private readonly logger = new Logger(PublicationConsumer.name);

  constructor(private readonly commentsService: CommentsService) {}

  @MessagePattern('publication.deleted')
  async handlePublicationDeleted(
    @Payload() payload: PublicationDeletedPayload,
    @Ctx()    context: RmqContext,
  ): Promise<void> {
    const channel = context.getChannelRef();
    const message = context.getMessage();

    try {
      this.logger.log(`[publication.deleted] reçu [publicationId=${payload.publicationId}]`);
      await this.commentsService.handlePublicationDeleted(payload.publicationId);
      // Acquittement manuel : le message n'est supprimé de la queue qu'après traitement réussi
      channel.ack(message);
    } catch (err) {
      this.logger.error(`[publication.deleted] erreur de traitement`, err);
      // Reject sans re-queue pour éviter la boucle infinie
      channel.nack(message, false, false);
    }
  }
}
