import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import type { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { loadEnv } from './common/env';
import { isAllowedWriteRequest } from './common/write-origin.guard';

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: true, rawBody: true });

  // Behind a load balancer the client IP arrives in X-Forwarded-For; without
  // this, rate limiting would see every request as coming from the proxy.
  app.set('trust proxy', env.TRUST_PROXY_HOPS);

  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cookieParser());

  const allowedOrigins = env.WEB_ORIGIN.split(',').map((s) => s.trim());
  // Reject cross-site browser mutations before auth/controllers execute.
  // No Origin and no Fetch Metadata is permitted for internal Next.js proxy calls.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    const fetchSite = req.headers['sec-fetch-site'];
    if (!isAllowedWriteRequest(req.method, origin, typeof fetchSite === 'string' ? fetchSite : undefined, allowedOrigins)) {
      res.status(403).json({ statusCode: 403, message: 'Cross-site write request rejected' });
      return;
    }
    next();
  });
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  // Credentials must be allowed for the session cookie, which means the origin
  // has to be an explicit allow-list — never a wildcard.
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await app.listen(env.API_PORT);
  new Logger('Bootstrap').log(
    `API on :${env.API_PORT} · env=${env.NODE_ENV} · header-auth=${env.ALLOW_HEADER_AUTH}` +
    ` · sessions: idle ${env.SESSION_IDLE_HOURS}h, absolute ${env.SESSION_ABSOLUTE_DAYS}d`);
}
bootstrap();
