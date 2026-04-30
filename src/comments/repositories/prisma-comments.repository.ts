import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCommentDto } from '../dto/create-comment.dto';
import {
  ICommentsRepository,
  CommentWithRelations,
  CursorPaginationResult,
  FindByPublicationParams,
} from '../interfaces/comments-repository.interface';
import { Comment, Prisma } from '@prisma/client';

// Sélection réutilisable — modifier ici propage sur toutes les méthodes
const COMMENT_SELECT = {
  id:            true,
  content:       true,
  authorId:      true,
  publicationId: true,
  parentId:      true,
  status:        true,
  deletedAt:     true,
  createdAt:     true,
  updatedAt:     true,
  _count: { select: { likes: true, replies: true } },
} satisfies Prisma.CommentSelect;

@Injectable()
export class PrismaCommentsRepository implements ICommentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── CREATE ──────────────────────────────────────────────────

  async create(authorId: string, dto: CreateCommentDto): Promise<Comment> {
    return this.prisma.comment.create({
      data: {
        content:       dto.content,
        authorId,
        publicationId: dto.publicationId,
        parentId:      dto.parentId ?? null,
        status:        'active',
      },
    });
  }

  // ── READ — liste paginée par curseur ────────────────────────

  async findByPublication(
    p: FindByPublicationParams,
  ): Promise<CursorPaginationResult<CommentWithRelations>> {
    const { publicationId, limit = 20, cursor, sort = 'desc' } = p;
    const take = limit + 1; // +1 pour détecter hasMore sans COUNT(*)

    const rows = await this.prisma.comment.findMany({
      where: { publicationId, parentId: null, status: 'active' },
      select: {
        ...COMMENT_SELECT,
        // Charge les 3 premières réponses pour éviter un aller-retour supplémentaire
        replies: {
          where:   { status: 'active' },
          orderBy: { createdAt: 'asc' },
          take:    3,
          select:  COMMENT_SELECT,
        },
      },
      orderBy: { createdAt: sort },
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    const hasMore    = rows.length > limit;
    const data       = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    return { data, nextCursor, hasMore };
  }

  // ── READ — toutes les réponses d'un commentaire ─────────────

  async findReplies(parentId: string): Promise<CommentWithRelations[]> {
    return this.prisma.comment.findMany({
      where:   { parentId, status: 'active' },
      select:  COMMENT_SELECT,
      orderBy: { createdAt: 'asc' },
    });
  }

  // ── READ — utilitaires ──────────────────────────────────────

  async findById(id: string): Promise<Comment | null> {
    return this.prisma.comment.findUnique({ where: { id } });
  }

  async existsById(id: string): Promise<boolean> {
    const row = await this.prisma.comment.findFirst({
      where:  { id },
      select: { id: true },
    });
    return row !== null;
  }

  async countActiveReplies(parentId: string): Promise<number> {
    return this.prisma.comment.count({
      where: { parentId, status: 'active' },
    });
  }

  async countReports(commentId: string): Promise<number> {
    return this.prisma.report.count({ where: { commentId } });
  }

  // ── SOFT DELETE ──────────────────────────────────────────────

  async softDelete(id: string): Promise<Comment> {
    return this.prisma.comment.update({
      where: { id },
      data:  { status: 'deleted', deletedAt: new Date() },
    });
  }

  // Tombstone : contenu effacé (RGPD), nœud conservé pour ses réponses
  async tombstone(id: string): Promise<Comment> {
    return this.prisma.comment.update({
      where: { id },
      data:  {
        status:    'tombstoned',
        content:   '[Commentaire supprimé]',
        deletedAt: new Date(),
      },
    });
  }

  async moderate(id: string): Promise<Comment> {
    return this.prisma.comment.update({
      where: { id },
      data:  { status: 'moderated' },
    });
  }

  // Suppression en cascade quand une publication est supprimée
  async softDeleteByPublicationId(publicationId: string): Promise<number> {
    const result = await this.prisma.comment.updateMany({
      where: { publicationId, status: 'active' },
      data:  { status: 'deleted', deletedAt: new Date() },
    });
    return result.count;
  }
}
