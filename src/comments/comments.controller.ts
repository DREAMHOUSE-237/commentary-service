import {
  Controller, Post, Get, Delete,
  Body, Param, Query,
  HttpCode, HttpStatus,
  UseGuards, UseFilters,
} from '@nestjs/common';
import { CommentsService }                              from './comments.service';
import { CreateCommentDto }                             from './dto/create-comment.dto';
import { QueryCommentsDto }                             from './dto/query-comments.dto';
import { ReportCommentDto }                             from './dto/report-comment.dto';
import { CommentResponseDto, DeleteCommentResponseDto } from './dto/comment-response.dto';
import { ApiResponse }                                  from '../common/interfaces/api-response.interface';
import { CurrentUser }                                  from '../common/decorators/current-user.decorator';
import { JwtAuthGuard }                                 from '../common/guards/jwt-auth.guard';
import { DomainExceptionFilter }                        from '../common/filters/domain-exception.filter';
import { AuthenticatedUser }                            from '../common/interfaces/authenticated-user.interface';

@Controller()
@UseFilters(DomainExceptionFilter)
@UseGuards(JwtAuthGuard)
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  // ── POST /comments ───────────────────────────────────────────
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
  @Get('publications/:id/comments')
  async findByPublication(
    @Param('id') publicationId: string,
    @Query()     query: QueryCommentsDto,
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
  @Get('comments/:id/replies')
  async findReplies(
    @Param('id') parentId: string,
  ): Promise<ApiResponse<CommentResponseDto[]>> {
    const replies = await this.commentsService.findReplies(parentId);
    return ApiResponse.ok(CommentResponseDto.fromMany(replies));
  }

  // ── DELETE /comments/:id ─────────────────────────────────────
  @Delete('comments/:id')
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param('id')   id:   string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApiResponse<DeleteCommentResponseDto>> {
    const comment = await this.commentsService.deleteComment(id, user.id);
    return ApiResponse.ok(DeleteCommentResponseDto.from(comment));
  }

  // ── POST /comments/:id/like ───────────────────────────────────
  @Post('comments/:id/like')
  @HttpCode(HttpStatus.OK)
  async toggleLike(
    @Param('id')   commentId: string,
    @CurrentUser() user:      AuthenticatedUser,
  ): Promise<ApiResponse<{ liked: boolean; likeCount: number }>> {
    const result = await this.commentsService.toggleLike(commentId, user.id);
    return ApiResponse.ok(result);
  }

  // ── POST /comments/:id/report ─────────────────────────────────
  @Post('comments/:id/report')
  @HttpCode(HttpStatus.OK)
  async report(
    @Param('id')   commentId: string,
    @Body()        dto:       ReportCommentDto,
    @CurrentUser() user:      AuthenticatedUser,
  ): Promise<ApiResponse<{ message: string }>> {
    await this.commentsService.reportComment(commentId, user.id, dto);
    return ApiResponse.ok({ message: 'Signalement enregistré' });
  }
}