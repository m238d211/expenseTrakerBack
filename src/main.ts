import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import type { Request, Response } from 'express';
import { AppModule } from './app.module';
import { HttpErrorFilter } from './http-exception.filter';

let applicationPromise: Promise<INestApplication> | undefined;

async function createApplication(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.use(helmet());
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new HttpErrorFilter());
  await app.init();
  return app;
}

async function getApplication(): Promise<INestApplication> {
  applicationPromise ??= createApplication();
  return applicationPromise;
}

export default async function handler(request: Request, response: Response) {
  const app = await getApplication();
  const expressApplication = app.getHttpAdapter().getInstance() as (req: Request, res: Response) => unknown;
  return expressApplication(request, response);
}

if (require.main === module) {
  void getApplication().then((app) => app.listen(process.env.PORT ?? 3000));
}
