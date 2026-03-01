import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import { ZodExceptionFilter } from './common/filters/zod-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Global Zod validation filter
  app.useGlobalFilters(new ZodExceptionFilter());

  // CORS — permite frontend local e produção
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
  const corsOrigins = [
    frontendUrl,
    'http://localhost:5173',
    'http://localhost:3000',
    'https://zapconectapi.com.br',
    'https://www.zapconectapi.com.br',
    'https://zapconectapi.com',
    'https://www.zapconectapi.com',
  ];
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  // Prisma shutdown hooks
  const prisma = app.get(PrismaService);
  prisma.enableShutdownHooks(app);

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('Zap-Conecta API')
    .setDescription('Standalone WhatsApp API — Evolution API + Z-API')
    .setVersion('1.0')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'x-api-key' }, 'api-key')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`Zap-Conecta running on http://localhost:${String(port)}`);
  console.log(`Swagger: http://localhost:${String(port)}/docs`);
}

void bootstrap();
