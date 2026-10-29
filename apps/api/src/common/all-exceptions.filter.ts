import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { safeRequestId, safeRouteLabel, safeErrorKind } from './log-safety';

/** Never put raw URLs, stack traces or arbitrary upstream errors in logs or 5xx responses. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly log = new Logger('Exception');

  catch(err: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const ref = safeRequestId(res.getHeader('x-request-id'));
    const status = err instanceof HttpException ? err.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= 500) {
      this.log.error(JSON.stringify({
        ref, method: req.method, route: safeRouteLabel(req.route),
        status, errorType: safeErrorKind(err),
      }));
      return res.status(status).json({
        statusCode: status,
        message: 'The service could not complete this request. Quote the reference when reporting it.',
        ref,
      });
    }

    // Explicit 4xx validation responses can carry field errors, but are not logged.
    const body = (err as HttpException).getResponse();
    return res.status(status).json(
      typeof body === 'string' ? { statusCode: status, message: body, ref } : { ...(body as object), ref });
  }
}
