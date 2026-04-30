import { Module }                    from '@nestjs/common';
import { CommentsController }        from './comments.controller';
import { CommentsService }           from './comments.service';
import { PrismaCommentsRepository }  from './repositories/prisma-comments.repository';
import { COMMENTS_REPOSITORY }       from './domain/comment.constants';

@Module({
  controllers: [CommentsController],
  providers: [
    CommentsService,
    {
      // Token Symbol → implémentation Prisma.
      // En test : remplacer useClass par useValue avec un mock.
      provide:  COMMENTS_REPOSITORY,
      useClass: PrismaCommentsRepository,
    },
  ],
  exports: [CommentsService],
})
export class CommentsModule {}
