import { Injectable, Inject, Logger, Optional } from '@nestjs/common';
import { Comment }  from '@prisma/client';
import {
  ICommentsRepository,
  FindByPublicationParams,
  CursorPaginationResult,
  CommentWithRelations,
} from './interfaces/comments-repository.interface';
import { CreateCommentDto }  from './dto/create-comment.dto';
import { ReportCommentDto }  from './dto/report-comment.dto';
import { COMMENTS_REPOSITORY, CommentStatus } from './domain/comment.constants';
import {
  CommentNotFoundError,
  CommentDepthExceededError,
  CommentNotActiveError,
  CommentForbiddenError,
  CommentContentInvalidError,
  CommentAlreadyReportedError,
} from './domain/comment.errors';

export const COMMENT_PRODUCER = 'COMMENT_PRODUCER';

export interface ICommentProducer {
  emitCommentCreated(payload: any): Promise<void>;
  emitCommentReported(payload: any): Promise<void>;
}

@Injectable()
export class CommentsService {
  private readonly logger = new Logger(CommentsService.name);

  constructor(
    @Inject(COMMENTS_REPOSITORY)
    private readonly repo: ICommentsRepository,

    @Optional()
    @Inject(COMMENT_PRODUCER)
    private readonly producer: ICommentProducer | null,
  ) {}

  async createComment(authorId: string, dto: CreateCommentDto): Promise<Comment> {
    this.validateContent(dto.content);
    if (dto.parentId) await this.assertValidParent(dto.parentId);

    const comment = await this.repo.create(authorId, dto);
    this.logger.log(`Commentaire créé [id=${comment.id}] [author=${authorId}]`);

    await this.producer?.emitCommentCreated({
      commentId:     comment.id,
      publicationId: comment.publicationId,
      authorId:      comment.authorId,
      parentId:      comment.parentId,
      createdAt:     comment.createdAt.toISOString(),
    });

    return comment;
  }

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

  async deleteComment(id: string, requesterId: string): Promise<Comment> {
    const comment = await this.repo.findById(id);
    if (!comment) throw new CommentNotFoundError(id);
    if (comment.authorId !== requesterId) throw new CommentForbiddenError('suppression non autorisée');
    if (comment.status === CommentStatus.DELETED || comment.status === CommentStatus.TOMBSTONED) return comment;

    const activeReplies = await this.repo.countActiveReplies(id);
    let result: Comment;

    if (activeReplies > 0) {
      result = await this.repo.tombstone(id);
      this.logger.log(`Commentaire tombstoné [id=${id}]`);
    } else {
      result = await this.repo.softDelete(id);
      this.logger.log(`Commentaire supprimé [id=${id}]`);
      if (comment.parentId) await this.tryPurgeTombstonedParent(comment.parentId);
    }
    return result;
  }

  async toggleLike(
    commentId: string,
    userId: string,
  ): Promise<{ liked: boolean; likeCount: number }> {
    const comment = await this.repo.findById(commentId);
    if (!comment || comment.status !== CommentStatus.ACTIVE) {
      throw new CommentNotFoundError(commentId);
    }

    const alreadyLiked = await this.repo.hasLiked(commentId, userId);

    if (alreadyLiked) {
      await this.repo.removeLike(commentId, userId);
      this.logger.log(`Like retiré [comment=${commentId}] [user=${userId}]`);
    } else {
      await this.repo.addLike(commentId, userId);
      this.logger.log(`Like ajouté [comment=${commentId}] [user=${userId}]`);
    }

    const likeCount = await this.repo.countLikes(commentId);
    return { liked: !alreadyLiked, likeCount };
  }

  async reportComment(
    commentId: string,
    userId: string,
    dto: ReportCommentDto,
  ): Promise<void> {
    const comment = await this.repo.findById(commentId);
    if (!comment) throw new CommentNotFoundError(commentId);

    const alreadyReported = await this.repo.hasReported(commentId, userId);
    if (alreadyReported) throw new CommentAlreadyReportedError();

    await this.repo.addReport(commentId, userId, dto.reason);
    this.logger.log(`Signalement ajouté [comment=${commentId}] [user=${userId}]`);

    await this.producer?.emitCommentReported({
      commentId,
      reportedBy: userId,
      reason:     dto.reason,
      reportedAt: new Date().toISOString(),
    });

    await this.moderateIfNeeded(commentId);
  }

  async moderateIfNeeded(commentId: string): Promise<void> {
    const count     = await this.repo.countReports(commentId);
    const threshold = parseInt(process.env.REPORT_THRESHOLD ?? '5', 10);
    if (count >= threshold) {
      await this.repo.moderate(commentId);
      this.logger.warn(`Commentaire modéré automatiquement [id=${commentId}] [reports=${count}]`);
    }
  }

  async handlePublicationDeleted(publicationId: string): Promise<void> {
    const count = await this.repo.softDeleteByPublicationId(publicationId);
    this.logger.log(`Publication supprimée → ${count} commentaires supprimés`);
  }

  private validateContent(content: string): void {
    const trimmed = content?.trim();
    if (!trimmed || trimmed.length < 1) throw new CommentContentInvalidError('le contenu ne peut pas être vide');
    if (trimmed.length > 5000)          throw new CommentContentInvalidError('le contenu dépasse 5000 caractères');
  }

  private async assertValidParent(parentId: string): Promise<void> {
    const parent = await this.repo.findById(parentId);
    if (!parent)                                throw new CommentNotFoundError(parentId);
    if (parent.status !== CommentStatus.ACTIVE) throw new CommentNotActiveError(parentId, parent.status);
    if (parent.parentId !== null)               throw new CommentDepthExceededError();
  }

  private async tryPurgeTombstonedParent(parentId: string): Promise<void> {
    const parent = await this.repo.findById(parentId);
    if (!parent || parent.status !== CommentStatus.TOMBSTONED) return;
    const remaining = await this.repo.countActiveReplies(parentId);
    if (remaining === 0) {
      await this.repo.softDelete(parentId);
      this.logger.log(`Parent tombstoned purgé [id=${parentId}]`);
    }
  }
}