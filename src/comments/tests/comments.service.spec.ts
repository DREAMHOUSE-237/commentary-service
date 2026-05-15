import { Test, TestingModule } from '@nestjs/testing';
import { CommentsService }     from '../comments.service';
import { COMMENTS_REPOSITORY } from '../domain/comment.constants';
import { ICommentsRepository } from '../interfaces/comments-repository.interface';
import {
  CommentDepthExceededError,
  CommentForbiddenError,
  CommentNotActiveError,
  CommentNotFoundError,
  CommentAlreadyReportedError,
} from '../domain/comment.errors';
import { COMMENT_PRODUCER } from '../comments.service';
import { Comment } from '@prisma/client';

const makeComment = (overrides: Partial<Comment> = {}): Comment => ({
  id: 'c-uuid-1', content: 'Contenu test', authorId: 'user-uuid-1',
  publicationId: 'pub-uuid-1', parentId: null, status: 'active',
  deletedAt: null, createdAt: new Date('2025-01-01'), updatedAt: new Date('2025-01-01'),
  ...overrides,
});

const mockRepo = (): jest.Mocked<ICommentsRepository> => ({
  create:                    jest.fn(),
  findByPublication:         jest.fn(),
  findReplies:               jest.fn(),
  findById:                  jest.fn(),
  existsById:                jest.fn(),
  countActiveReplies:        jest.fn(),
  countReports:              jest.fn(),
  countLikes:                jest.fn(),
  softDelete:                jest.fn(),
  tombstone:                 jest.fn(),
  moderate:                  jest.fn(),
  softDeleteByPublicationId: jest.fn(),
  addLike:                   jest.fn(),
  removeLike:                jest.fn(),
  hasLiked:                  jest.fn(),
  addReport:                 jest.fn(),
  hasReported:               jest.fn(),
});

describe('CommentsService', () => {
  let service: CommentsService;
  let repo:    jest.Mocked<ICommentsRepository>;

  beforeEach(async () => {
    const r = mockRepo();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentsService,
        { provide: COMMENTS_REPOSITORY, useValue: r },
        { provide: COMMENT_PRODUCER,    useValue: null },
      ],
    }).compile();
    service = module.get(CommentsService);
    repo    = r;
  });

  describe('createComment', () => {
    it('crée un commentaire racine', async () => {
      repo.create.mockResolvedValue(makeComment());
      const result = await service.createComment('user-uuid-1', { publicationId: 'pub-1', content: 'Bonjour' });
      expect(repo.create).toHaveBeenCalledTimes(1);
      expect(result.id).toBe('c-uuid-1');
    });

    it('refuse un niveau 3', async () => {
      repo.findById.mockResolvedValue(makeComment({ parentId: 'level1' }));
      await expect(
        service.createComment('u1', { publicationId: 'p1', content: 'Trop profond', parentId: 'level2' })
      ).rejects.toThrow(CommentDepthExceededError);
    });

    it('refuse de répondre à un tombstoned', async () => {
      repo.findById.mockResolvedValue(makeComment({ status: 'tombstoned' }));
      await expect(
        service.createComment('u1', { publicationId: 'p1', content: 'Test', parentId: 'c1' })
      ).rejects.toThrow(CommentNotActiveError);
    });

    it('refuse un contenu vide', async () => {
      await expect(
        service.createComment('u1', { publicationId: 'p1', content: '   ' })
      ).rejects.toThrow('COMMENT_CONTENT_INVALID');
    });
  });

  describe('deleteComment', () => {
    it('tombstone si des réponses existent', async () => {
      repo.findById.mockResolvedValue(makeComment({ authorId: 'u1' }));
      repo.countActiveReplies.mockResolvedValue(2);
      repo.tombstone.mockResolvedValue(makeComment({ status: 'tombstoned' }));
      const result = await service.deleteComment('c-uuid-1', 'u1');
      expect(repo.tombstone).toHaveBeenCalledWith('c-uuid-1');
      expect(result.status).toBe('tombstoned');
    });

    it('soft-delete si aucune réponse', async () => {
      repo.findById.mockResolvedValue(makeComment({ authorId: 'u1' }));
      repo.countActiveReplies.mockResolvedValue(0);
      repo.softDelete.mockResolvedValue(makeComment({ status: 'deleted', deletedAt: new Date() }));
      const result = await service.deleteComment('c-uuid-1', 'u1');
      expect(result.status).toBe('deleted');
    });

    it('lève ForbiddenError si pas auteur', async () => {
      repo.findById.mockResolvedValue(makeComment({ authorId: 'other' }));
      await expect(service.deleteComment('c-uuid-1', 'u1')).rejects.toThrow(CommentForbiddenError);
    });

    it('lève NotFoundError si inexistant', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.deleteComment('ghost', 'u1')).rejects.toThrow(CommentNotFoundError);
    });
  });

  describe('toggleLike', () => {
    it('ajoute un like', async () => {
      repo.findById.mockResolvedValue(makeComment());
      repo.hasLiked.mockResolvedValue(false);
      repo.addLike.mockResolvedValue({} as any);
      repo.countLikes.mockResolvedValue(1);
      const result = await service.toggleLike('c-uuid-1', 'u1');
      expect(repo.addLike).toHaveBeenCalledWith('c-uuid-1', 'u1');
      expect(result).toEqual({ liked: true, likeCount: 1 });
    });

    it('retire le like si déjà liké', async () => {
      repo.findById.mockResolvedValue(makeComment());
      repo.hasLiked.mockResolvedValue(true);
      repo.removeLike.mockResolvedValue(undefined);
      repo.countLikes.mockResolvedValue(0);
      const result = await service.toggleLike('c-uuid-1', 'u1');
      expect(repo.removeLike).toHaveBeenCalledWith('c-uuid-1', 'u1');
      expect(result).toEqual({ liked: false, likeCount: 0 });
    });
  });

  describe('reportComment', () => {
    it('enregistre un signalement', async () => {
      repo.findById.mockResolvedValue(makeComment());
      repo.hasReported.mockResolvedValue(false);
      repo.addReport.mockResolvedValue(undefined);
      repo.countReports.mockResolvedValue(1);
      await service.reportComment('c-uuid-1', 'u1', { reason: 'Contenu inapproprié' });
      expect(repo.addReport).toHaveBeenCalledWith('c-uuid-1', 'u1', 'Contenu inapproprié');
    });

    it('lève AlreadyReportedError si déjà signalé', async () => {
      repo.findById.mockResolvedValue(makeComment());
      repo.hasReported.mockResolvedValue(true);
      await expect(
        service.reportComment('c-uuid-1', 'u1', { reason: 'Spam' })
      ).rejects.toThrow(CommentAlreadyReportedError);
    });

    it('modère automatiquement si seuil atteint', async () => {
      repo.findById.mockResolvedValue(makeComment());
      repo.hasReported.mockResolvedValue(false);
      repo.addReport.mockResolvedValue(undefined);
      repo.countReports.mockResolvedValue(5);
      repo.moderate.mockResolvedValue(makeComment({ status: 'moderated' }));
      await service.reportComment('c-uuid-1', 'u1', { reason: 'Contenu inapproprié' });
      expect(repo.moderate).toHaveBeenCalledWith('c-uuid-1');
    });
  });
});
