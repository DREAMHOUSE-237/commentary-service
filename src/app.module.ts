import { Module }         from '@nestjs/common';
import { ConfigModule }   from '@nestjs/config';
import { PrismaModule }   from './prisma/prisma.module';
import { CommentsModule } from './comments/comments.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    CommentsModule,
  ],
})
export class AppModule {}