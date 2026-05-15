import { Comment, CommentLike } from '@prisma/client';
import { CreateCommentDto } from '../dto/create-comment.dto';

export type CommentWithRelations = Comment & {
  replies?: CommentWithRelations[];
  _count?:  { likes: number; replies: number };
};

export interface CursorPaginationResult<T> {
  data:       T[];
  nextCursor: string | null;
  hasMore:    boolean;
}

export interface FindByPublicationParams {
  publicationId: string;
  limit?:        number;
  cursor?:       string;
  sort?:         'asc' | 'desc';
}

export interface ICommentsRepository {
  create(authorId: string, dto: CreateCommentDto): Promise<Comment>;
  findByPublication(p: FindByPublicationParams): Promise<CursorPaginationResult<CommentWithRelations>>;
  findReplies(parentId: string): Promise<CommentWithRelations[]>;
  findById(id: string): Promise<Comment | null>;
  existsById(id: string): Promise<boolean>;
  countActiveReplies(parentId: string): Promise<number>;
  countReports(commentId: string): Promise<number>;
  countLikes(commentId: string): Promise<number>;
  softDelete(id: string): Promise<Comment>;
  tombstone(id: string): Promise<Comment>;
  moderate(id: string): Promise<Comment>;
  softDeleteByPublicationId(publicationId: string): Promise<number>;
  addLike(commentId: string, userId: string): Promise<CommentLike>;
  removeLike(commentId: string, userId: string): Promise<void>;
  hasLiked(commentId: string, userId: string): Promise<boolean>;
  addReport(commentId: string, reportedBy: string, reason: string): Promise<void>;
  hasReported(commentId: string, userId: string): Promise<boolean>;
}
