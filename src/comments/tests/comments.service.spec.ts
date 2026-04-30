import { Test, TestingModule } from '@nestjs/testing';
import { CommentsService }     from '../comments.service';
import { COMMENTS_REPOSITORY } from '../domain/comment.constants';
import { ICommentsRepository } from '../interfaces/comments-repository.interface';
import {
  CommentDepthExceededError,
  CommentForbiddenError,
  CommentNotActiveError,
  CommentNotFoundError,
} from '../domain/comment.errors';
import { Comment } from '@prisma/client';

// Fabrique de commentaire de test — type-safe et centralisée
const makeComment = (overrides: Partial<Comment> = {}): Comment => ({
  id:            'c-uuid-1',
  content:       'Contenu test',
  authorId:      'user-uuid-1',
  publicationId: 'pub-uuid-1',
  parentId:      null,
  status:        'active',
  deletedAt:     null,
  createdAt:     new Date('2025-01-01'),
  updatedAt:     new Date('2025-01-01'),
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
  softDelete:                jest.fn(),
  tombstone:                 jest.fn(),
  moderate:                  jest.fn(),
  softDeleteByPublicationId: jest.fn(),
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
      ],
    }).compile();

    service = module.get(CommentsService);
    repo    = r;
  });

  // ── createComment ────────────────────────────────────────────

  describe('createComment', () => {
    it('crée un commentaire racine', async () => {
      const c = makeComment();
      repo.create.mockResolvedValue(c);

      const result = await service.createComment('user-uuid-1', {
        publicationId: 'pub-uuid-1',
        content:       'Bonjour',
      });

      expect(repo.create).toHaveBeenCalledTimes(1);
      expect(result.id).toBe('c-uuid-1');
    });

    it('crée une réponse valide (parent niveau 1)', async () => {
      const parent = makeComment({ id: 'parent-1', parentId: null });
      const reply  = makeComment({ id: 'reply-1', parentId: 'parent-1' });

      repo.findById.mockResolvedValue(parent);
      repo.create.mockResolvedValue(reply);

      const result = await service.createComment('user-uuid-1', {
        publicationId: 'pub-uuid-1',
        content:       'Réponse',
        parentId:      'parent-1',
      });

      expect(result.parentId).toBe('parent-1');
    });

    it('refuse une réponse à une réponse (niveau 3 interdit)', async () => {
      const level2 = makeComment({ id: 'level2', parentId: 'level1' });
      repo.findById.mockResolvedValue(level2);

      await expect(
        service.createComment('u1', {
          publicationId: 'pub-1',
          content: 'Trop profond',
          parentId: 'level2',
        }),
      ).rejects.toThrow(CommentDepthExceededError);

      expect(repo.create).not.toHaveBeenCalled();
    });

    it('refuse de répondre à un commentaire tombstoned', async () => {
      const tombstoned = makeComment({ id: 'c1', status: 'tombstoned' });
      repo.findById.mockResolvedValue(tombstoned);

      await expect(
        service.createComment('u1', { publicationId: 'p1', content: 'Test', parentId: 'c1' }),
      ).rejects.toThrow(CommentNotActiveError);
    });

    it('refuse un contenu vide', async () => {
      await expect(
        service.createComment('u1', { publicationId: 'p1', content: '   ' }),
      ).rejects.toThrow('COMMENT_CONTENT_INVALID');
    });
  });

  // ── deleteComment ────────────────────────────────────────────

  describe('deleteComment', () => {
    it('tombstone si le commentaire a des réponses', async () => {
      const c = makeComment({ authorId: 'u1' });
      const t = makeComment({ status: 'tombstoned', content: '[Commentaire supprimé]' });

      repo.findById.mockResolvedValue(c);
      repo.countActiveReplies.mockResolvedValue(2);
      repo.tombstone.mockResolvedValue(t);

      const result = await service.deleteComment('c-uuid-1', 'u1');

      expect(repo.tombstone).toHaveBeenCalledWith('c-uuid-1');
      expect(repo.softDelete).not.toHaveBeenCalled();
      expect(result.status).toBe('tombstoned');
    });

    it('soft-delete si aucune réponse', async () => {
      const c = makeComment({ authorId: 'u1' });
      const d = makeComment({ status: 'deleted', deletedAt: new Date() });

      repo.findById.mockResolvedValue(c);
      repo.countActiveReplies.mockResolvedValue(0);
      repo.softDelete.mockResolvedValue(d);

      const result = await service.deleteComment('c-uuid-1', 'u1');

      expect(repo.softDelete).toHaveBeenCalledWith('c-uuid-1');
      expect(result.status).toBe('deleted');
    });

    it('purge le parent tombstoned en cascade', async () => {
      const reply  = makeComment({ id: 'r1', authorId: 'u1', parentId: 'p1' });
      const parent = makeComment({ id: 'p1', status: 'tombstoned', parentId: null });
      const deleted= makeComment({ status: 'deleted', deletedAt: new Date() });

      repo.findById
        .mockResolvedValueOnce(reply)
        .mockResolvedValueOnce(parent);
      repo.countActiveReplies
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      repo.softDelete.mockResolvedValue(deleted);

      await service.deleteComment('r1', 'u1');

      expect(repo.softDelete).toHaveBeenCalledTimes(2);
      expect(repo.softDelete).toHaveBeenNthCalledWith(1, 'r1');
      expect(repo.softDelete).toHaveBeenNthCalledWith(2, 'p1');
    });

    it('est idempotent si déjà supprimé', async () => {
      const already = makeComment({ status: 'deleted', authorId: 'u1' });
      repo.findById.mockResolvedValue(already);

      const result = await service.deleteComment('c-uuid-1', 'u1');

      expect(repo.tombstone).not.toHaveBeenCalled();
      expect(repo.softDelete).not.toHaveBeenCalled();
      expect(result.status).toBe('deleted');
    });

    it('lève ForbiddenError si pas l\'auteur', async () => {
      repo.findById.mockResolvedValue(makeComment({ authorId: 'other-user' }));

      await expect(
        service.deleteComment('c-uuid-1', 'u1'),
      ).rejects.toThrow(CommentForbiddenError);
    });

    it('lève NotFoundError si inexistant', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(
        service.deleteComment('ghost', 'u1'),
      ).rejects.toThrow(CommentNotFoundError);
    });
  });
});
