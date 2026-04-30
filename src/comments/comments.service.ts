import { Injectable, Inject, Logger } from '@nestjs/common';
import { Comment } from '@prisma/client';
import {
  ICommentsRepository,
  FindByPublicationParams,
  CursorPaginationResult,
  CommentWithRelations,
} from './interfaces/comments-repository.interface';
import { CreateCommentDto } from './dto/create-comment.dto';
import { COMMENTS_REPOSITORY, CommentStatus } from './domain/comment.constants';
import {
  CommentNotFoundError,
  CommentDepthExceededError,
  CommentNotActiveError,
  CommentForbiddenError,
  CommentContentInvalidError,
} from './domain/comment.errors';

@Injectable()
export class CommentsService {
  private readonly logger = new Logger(CommentsService.name);

  constructor(
    @Inject(COMMENTS_REPOSITORY)
    private readonly repo: ICommentsRepository,
  ) {}

  // ── CREATE ───────────────────────────────────────────────────
  // Règles :
  //  1. Contenu non vide et dans la limite
  //  2. Si parentId : parent doit exister ET être 'active'
  //  3. Si parentId : le parent ne doit PAS avoir de parentId lui-même
  //     (profondeur max = 2)

  async createComment(authorId: string, dto: CreateCommentDto): Promise<Comment> {
    this.validateContent(dto.content);

    if (dto.parentId) {
      await this.assertValidParent(dto.parentId);
    }

    const comment = await this.repo.create(authorId, dto);
    this.logger.log(`Commentaire créé [id=${comment.id}] [author=${authorId}] [parent=${dto.parentId ?? 'none'}]`);

    return comment;
  }

  // ── READ ─────────────────────────────────────────────────────

  async findByPublication(
    params: FindByPublicationParams,
  ): Promise<CursorPaginationResult<CommentWithRelations>> {
    return this.repo.findByPublication(params);
  }

  async findReplies(parentId: string): Promise<CommentWithRelations[]> {
    const parent = await this.repo.findById(parentId);

    if (!parent || parent.status === CommentStatus.DELETED) {
      throw new CommentNotFoundError(parentId);
    }

    return this.repo.findReplies(parentId);
  }

  // ── SOFT DELETE INTELLIGENT ───────────────────────────────────
  // Cas A — a des réponses actives → tombstone (contenu masqué, nœud conservé)
  // Cas B — aucune réponse active  → deleted
  // Après Cas B : si c'est une réponse, on tente de purger le parent tombstoned

  async deleteComment(id: string, requesterId: string): Promise<Comment> {
    const comment = await this.repo.findById(id);

    if (!comment) throw new CommentNotFoundError(id);

    if (comment.authorId !== requesterId) {
      throw new CommentForbiddenError('suppression d\'un commentaire dont vous n\'êtes pas l\'auteur');
    }

    // Idempotence : déjà supprimé → retour sans erreur
    if (comment.status === CommentStatus.DELETED || comment.status === CommentStatus.TOMBSTONED) {
      return comment;
    }

    const activeReplies = await this.repo.countActiveReplies(id);

    let result: Comment;

    if (activeReplies > 0) {
      // Cas A : tombstone
      result = await this.repo.tombstone(id);
      this.logger.log(`Commentaire tombstoné [id=${id}] [replies=${activeReplies}]`);
    } else {
      // Cas B : suppression normale
      result = await this.repo.softDelete(id);
      this.logger.log(`Commentaire supprimé [id=${id}]`);

      // Cascade : si c'était une réponse, le parent tombstoned n'a
      // peut-être plus de raison d'exister → on tente la purge
      if (comment.parentId) {
        await this.tryPurgeTombstonedParent(comment.parentId);
      }
    }

    return result;
  }

  // ── MODÉRATION ────────────────────────────────────────────────
  // Appelé après chaque signalement pour vérifier le seuil

  async moderateIfNeeded(commentId: string): Promise<void> {
    const count = await this.repo.countReports(commentId);
    const threshold = parseInt(process.env.REPORT_THRESHOLD ?? '5', 10);

    if (count >= threshold) {
      await this.repo.moderate(commentId);
      this.logger.warn(`Commentaire modéré automatiquement [id=${commentId}] [reports=${count}]`);
    }
  }

  // ── CONSUMER : publication supprimée ─────────────────────────

  async handlePublicationDeleted(publicationId: string): Promise<void> {
    const count = await this.repo.softDeleteByPublicationId(publicationId);
    this.logger.log(`Publication supprimée [id=${publicationId}] → ${count} commentaires supprimés`);
  }

  // ── PRIVÉ ─────────────────────────────────────────────────────

  private validateContent(content: string): void {
    const trimmed = content?.trim();
    if (!trimmed || trimmed.length < 1) {
      throw new CommentContentInvalidError('le contenu ne peut pas être vide');
    }
    if (trimmed.length > 5000) {
      throw new CommentContentInvalidError('le contenu dépasse 5000 caractères');
    }
  }

  private async assertValidParent(parentId: string): Promise<void> {
    const parent = await this.repo.findById(parentId);

    if (!parent) throw new CommentNotFoundError(parentId);

    // On refuse de répondre à un commentaire non actif
    if (parent.status !== CommentStatus.ACTIVE) {
      throw new CommentNotActiveError(parentId, parent.status);
    }

    // Règle de profondeur : si le parent a un parent, on est déjà au niveau 2
    if (parent.parentId !== null) {
      throw new CommentDepthExceededError();
    }
  }

  private async tryPurgeTombstonedParent(parentId: string): Promise<void> {
    const parent = await this.repo.findById(parentId);

    if (!parent || parent.status !== CommentStatus.TOMBSTONED) return;

    const remaining = await this.repo.countActiveReplies(parentId);

    if (remaining === 0) {
      await this.repo.softDelete(parentId);
      this.logger.log(`Parent tombstoned purgé en cascade [id=${parentId}]`);
    }
  }
}
