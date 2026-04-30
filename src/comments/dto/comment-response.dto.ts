import { Comment } from '@prisma/client';
import { CommentWithRelations } from '../interfaces/comments-repository.interface';

export class CommentResponseDto {
  id:            string;
  content:       string;
  publicationId: string;
  parentId:      string | null;
  status:        string;
  author:        { id: string };
  likeCount:     number;
  replyCount:    number;
  replies:       CommentResponseDto[];
  createdAt:     string;
  updatedAt:     string;

  static from(c: CommentWithRelations): CommentResponseDto {
    const dto          = new CommentResponseDto();
    dto.id             = c.id;
    // Masque le contenu pour les commentaires tombstonés
    dto.content        = c.status === 'tombstoned'
                           ? '[Ce commentaire a été supprimé]'
                           : c.content;
    dto.publicationId  = c.publicationId;
    dto.parentId       = c.parentId ?? null;
    dto.status         = c.status;
    dto.author         = { id: c.authorId };
    dto.likeCount      = c._count?.likes   ?? 0;
    dto.replyCount     = c._count?.replies ?? 0;
    dto.replies        = (c.replies ?? []).map(CommentResponseDto.from);
    dto.createdAt      = c.createdAt.toISOString();
    dto.updatedAt      = c.updatedAt.toISOString();
    return dto;
  }

  static fromMany(comments: CommentWithRelations[]): CommentResponseDto[] {
    return comments.map(CommentResponseDto.from);
  }
}

export class DeleteCommentResponseDto {
  id:        string;
  status:    string;
  deletedAt: string;

  static from(c: Comment): DeleteCommentResponseDto {
    const dto      = new DeleteCommentResponseDto();
    dto.id         = c.id;
    dto.status     = c.status;
    dto.deletedAt  = (c.deletedAt ?? new Date()).toISOString();
    return dto;
  }
}
