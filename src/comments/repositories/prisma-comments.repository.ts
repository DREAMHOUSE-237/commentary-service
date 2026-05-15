import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCommentDto } from '../dto/create-comment.dto';
import {
  ICommentsRepository,
  CommentWithRelations,
  CursorPaginationResult,
  FindByPublicationParams,
} from '../interfaces/comments-repository.interface';
import { Comment, CommentLike, Prisma } from '@prisma/client';

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

  async findByPublication(p: FindByPublicationParams): Promise<CursorPaginationResult<CommentWithRelations>> {
    const { publicationId, limit = 20, cursor, sort = 'desc' } = p;
    const take = limit + 1;
    const rows = await this.prisma.comment.findMany({
      where:   { publicationId, parentId: null, status: 'active' },
      select:  {
        ...COMMENT_SELECT,
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

  async findReplies(parentId: string): Promise<CommentWithRelations[]> {
    return this.prisma.comment.findMany({
      where:   { parentId, status: 'active' },
      select:  COMMENT_SELECT,
      orderBy: { createdAt: 'asc' },
    });
  }

  async findById(id: string): Promise<Comment | null> {
    return this.prisma.comment.findUnique({ where: { id } });
  }

  async existsById(id: string): Promise<boolean> {
    const row = await this.prisma.comment.findFirst({ where: { id }, select: { id: true } });
    return row !== null;
  }

  async countActiveReplies(parentId: string): Promise<number> {
    return this.prisma.comment.count({ where: { parentId, status: 'active' } });
  }

  async countReports(commentId: string): Promise<number> {
    return this.prisma.report.count({ where: { commentId } });
  }

  async countLikes(commentId: string): Promise<number> {
    return this.prisma.commentLike.count({ where: { commentId } });
  }

  async softDelete(id: string): Promise<Comment> {
    return this.prisma.comment.update({
      where: { id },
      data:  { status: 'deleted', deletedAt: new Date() },
    });
  }

  async tombstone(id: string): Promise<Comment> {
    return this.prisma.comment.update({
      where: { id },
      data:  { status: 'tombstoned', content: '[Commentaire supprimé]', deletedAt: new Date() },
    });
  }

  async moderate(id: string): Promise<Comment> {
    return this.prisma.comment.update({ where: { id }, data: { status: 'moderated' } });
  }

  async softDeleteByPublicationId(publicationId: string): Promise<number> {
    const result = await this.prisma.comment.updateMany({
      where: { publicationId, status: 'active' },
      data:  { status: 'deleted', deletedAt: new Date() },
    });
    return result.count;
  }

  async addLike(commentId: string, userId: string): Promise<CommentLike> {
    return this.prisma.commentLike.create({ data: { commentId, userId } });
  }

  async removeLike(commentId: string, userId: string): Promise<void> {
    await this.prisma.commentLike.deleteMany({ where: { commentId, userId } });
  }

  async hasLiked(commentId: string, userId: string): Promise<boolean> {
    const row = await this.prisma.commentLike.findFirst({
      where: { commentId, userId }, select: { id: true },
    });
    return row !== null;
  }

  async addReport(commentId: string, reportedBy: string, reason: string): Promise<void> {
    await this.prisma.report.create({ data: { commentId, reportedBy, reason } });
  }

  async hasReported(commentId: string, userId: string): Promise<boolean> {
    const row = await this.prisma.report.findFirst({
      where: { commentId, reportedBy: userId }, select: { id: true },
    });
    return row !== null;
  }
}
