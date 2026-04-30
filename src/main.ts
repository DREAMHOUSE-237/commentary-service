import { NestFactory }  from '@nestjs/core';
import { Logger }       from '@nestjs/common';
import { AppModule }    from './app.module';
import { DomainExceptionFilter }     from './common/filters/domain-exception.filter';
import { ValidationExceptionFilter } from './common/filters/validation-exception.filter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app    = await NestFactory.create(AppModule);

  app.useGlobalFilters(
    new DomainExceptionFilter(),
    new ValidationExceptionFilter(),
  );

  const port = process.env.PORT ?? 3003;
  await app.listen(port);
  logger.log(`Comment Service running on port ${port}`);
}

bootstrap();