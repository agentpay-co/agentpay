/**
 * Shared Express middleware: request IDs and access logging.
 *
 * `requestId` accepts an inbound `X-Request-Id` or mints one, attaches it to
 * the request, and echoes it on the response so a task can be traced across
 * orchestrator → registry → agent hops. `accessLog` records one line per
 * completed request (method, path, status, duration, request id).
 */
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { logger, type ScopedLogger } from './logger.js';

export const REQUEST_ID_HEADER = 'x-request-id';
export const REQUEST_ID_RESPONSE_HEADER = 'X-Request-Id';

declare module 'express-serve-static-core' {
  interface Request {
    requestId?: string;
  }
}

export function getRequestId(req: Request): string | undefined {
  return req.requestId;
}

export function requestId(_req: Request, _res: Response, _next: NextFunction): void {
  const req = _req;
  const res = _res;
  const next = _next;
  const incoming = req.header(REQUEST_ID_HEADER)?.trim();
  const id = incoming ? incoming : randomUUID();
  req.requestId = id;
  res.setHeader(REQUEST_ID_RESPONSE_HEADER, id);
  next();
}

export interface AccessLogOptions {
  service: string;
  log?: ScopedLogger;
  /** Skip logging for these exact paths (e.g. load-balancer health checks). */
  skipPaths?: string[];
}

export function accessLog(options: AccessLogOptions) {
  const log = (options.log ?? logger).child({ service: options.service });
  const skip = new Set(options.skipPaths ?? []);
  return function accessLogMiddleware(req: Request, res: Response, next: NextFunction): void {
    const start = Date.now();
    res.on('finish', () => {
      if (skip.has(req.path)) return;
      log.info('request', {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration_ms: Date.now() - start,
        requestId: req.requestId,
      });
    });
    next();
  };
}

/**
 * Build fetch headers that propagate the caller's request id downstream.
 * Pass the inbound Express request (or nothing) when a service calls another.
 */
export function propagationHeaders(req?: { requestId?: string }): Record<string, string> {
  if (req?.requestId) return { [REQUEST_ID_RESPONSE_HEADER]: req.requestId };
  return {};
}
