import { Global, Module } from '@nestjs/common';
import { PrismaService }  from './prisma.service';

// @Global() : PrismaService disponible dans tout le projet sans ré-import
@Global()
@Module({
  providers: [PrismaService],
  exports:   [PrismaService],
})
export class PrismaModule {}
