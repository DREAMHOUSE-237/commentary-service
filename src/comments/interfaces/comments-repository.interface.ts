import { Comment } from '@prisma/client';
import { CreateCommentDto } from '../dto/create-comment.dto';

// Type enrichi avec les relations chargées
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
  softDelete(id: string): Promise<Comment>;
  tombstone(id: string): Promise<Comment>;
  moderate(id: string): Promise<Comment>;
  softDeleteByPublicationId(publicationId: string): Promise<number>;
}
