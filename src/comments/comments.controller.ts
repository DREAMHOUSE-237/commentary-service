import {
  Controller, Post, Get, Delete,
  Body, Param, Query,
  ParseUUIDPipe, HttpCode, HttpStatus,
  UseGuards, UseFilters,
} from '@nestjs/common';
import { CommentsService }                          from './comments.service';
import { CreateCommentDto }                         from './dto/create-comment.dto';
import { QueryCommentsDto }                         from './dto/query-comments.dto';
import { CommentResponseDto, DeleteCommentResponseDto } from './dto/comment-response.dto';
import { ApiResponse }                              from '../common/interfaces/api-response.interface';
import { CurrentUser }                              from '../common/decorators/current-user.decorator';
import { JwtAuthGuard }                             from '../common/guards/jwt-auth.guard';
import { DomainExceptionFilter }                    from '../common/filters/domain-exception.filter';
import { AuthenticatedUser }                        from '../common/interfaces/authenticated-user.interface';

@Controller()
@UseFilters(DomainExceptionFilter)
@UseGuards(JwtAuthGuard)
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  // ── POST /comments ───────────────────────────────────────────
  // Crée un commentaire racine ou une réponse (parentId optionnel)
  // 201 : créé | 400 : validation | 404 : parentId inexistant | 422 : profondeur dépassée

  @Post('comments')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body()        dto:  CreateCommentDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApiResponse<CommentResponseDto>> {
    const comment = await this.commentsService.createComment(user.id, dto);
    return ApiResponse.ok(CommentResponseDto.from(comment));
  }

  // ── GET /publications/:id/comments ───────────────────────────
  // Liste paginée des commentaires racines avec les 3 premières réponses
  // Query : cursor (UUID), limit (1-100, défaut 20), sort (asc|desc, défaut desc)

  @Get('publications/:id/comments')
  async findByPublication(
    @Param('id', new ParseUUIDPipe({ version: '4' })) publicationId: string,
    @Query() query: QueryCommentsDto,
  ): Promise<ApiResponse<CommentResponseDto[]>> {
    const result = await this.commentsService.findByPublication({
      publicationId,
      cursor: query.cursor,
      limit:  query.limit,
      sort:   query.sort,
    });

    return ApiResponse.ok(
      CommentResponseDto.fromMany(result.data),
      { limit: query.limit, hasMore: result.hasMore, nextCursor: result.nextCursor },
    );
  }

  // ── GET /comments/:id/replies ─────────────────────────────────
  // Charge toutes les réponses d'un commentaire (pour les threads longs > 3)

  @Get('comments/:id/replies')
  async findReplies(
    @Param('id', new ParseUUIDPipe({ version: '4' })) parentId: string,
  ): Promise<ApiResponse<CommentResponseDto[]>> {
    const replies = await this.commentsService.findReplies(parentId);
    return ApiResponse.ok(CommentResponseDto.fromMany(replies));
  }

  // ── DELETE /comments/:id ─────────────────────────────────────
  // Soft delete intelligent :
  //   a des réponses → tombstone | aucune réponse → deleted
  // 200 : supprimé | 403 : pas l'auteur | 404 : introuvable

  @Delete('comments/:id')
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApiResponse<DeleteCommentResponseDto>> {
    const comment = await this.commentsService.deleteComment(id, user.id);
    return ApiResponse.ok(DeleteCommentResponseDto.from(comment));
  }
}
