import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks(); // SIGINT/SIGTERM → MQTT·DB 연결 정리
  // 브라우저 클라이언트: dashboard 개발 서버(Vite)만 허용.
  // 배열로 주면 요청 Origin이 목록에 있을 때만 Access-Control-Allow-Origin을 보낸다 (문자열이면 항상 보냄)
  app.enableCors({ origin: ['http://localhost:5173'] });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));

  const doc = new DocumentBuilder()
    .setTitle('GroundLink API')
    .setDescription('가상 위성 지상국 수집 서버 API. 클라이언트(WPF, React)는 이 문서 기준으로만 통신한다.')
    .setVersion('0.1.0')
    .build();
  SwaggerModule.setup('api/docs', app, () => SwaggerModule.createDocument(app, doc));

  const host = process.env.HOST ?? '127.0.0.1';
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, host);
  Logger.log(`HTTP http://${host}:${port}  (Swagger: /api/docs)`, 'Bootstrap');
}

void bootstrap();
