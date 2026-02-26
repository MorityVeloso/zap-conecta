/**
 * HttpLoggingInterceptor — logs each request with method, path, tenantId, status, duration.
 *
 * Output format (NestJS Logger → JSON in production):
 *   [HttpLog] GET /whatsapp/send/text | tenant=abc123 | 201 | 42ms
 */
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { Request, Response } from 'express';

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HttpLog');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request & { tenantId?: string }>();
    const { method, url } = req;
    const tenantId = req.tenantId ?? '—';
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse<Response>();
          const ms = Date.now() - start;
          this.logger.log(
            `${method} ${url} | tenant=${tenantId} | ${res.statusCode} | ${ms}ms`,
          );
        },
        error: (err: unknown) => {
          const ms = Date.now() - start;
          const status = (err as { status?: number })?.status ?? 500;
          this.logger.warn(
            `${method} ${url} | tenant=${tenantId} | ${status} | ${ms}ms | ${String(err)}`,
          );
        },
      }),
    );
  }
}
