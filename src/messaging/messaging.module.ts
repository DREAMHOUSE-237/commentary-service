import { Module }              from '@nestjs/common';
import { CommentsModule }      from '../comments/comments.module';
import { CommentProducer }     from './producers/comment.producer';
import { PublicationConsumer } from './consumers/publication.consumer';

@Module({
  imports:   [CommentsModule],
  providers: [CommentProducer, PublicationConsumer],
  exports:   [CommentProducer],
})
export class MessagingModule {}