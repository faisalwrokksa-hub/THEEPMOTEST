import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { safeRequestId, safeRouteLabel } from './log-safety';

/** One structured line per request. Never log raw URLs, query strings or credentials. */
@Injectable()
export class RequestLogMiddleware implements NestMiddleware {
  private readonly log = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const id = safeRequestId(req.headers['x-request-id']);
    res.setHeader('x-request-id', id);
    const started = Date.now();
    res.on('finish', () => {
      const line = JSON.stringify({
        id, method: req.method, route: safeRouteLabel(req.route),
        status: res.statusCode, ms: Date.now() - started,
      });
      if (res.statusCode >= 500) this.log.error(line);
      else if (res.statusCode >= 400) this.log.warn(line);
      else this.log.log(line);
    });
    next();
  }
}
