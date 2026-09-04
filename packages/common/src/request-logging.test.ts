import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { accessLog, propagationHeaders, requestId } from './request-logging.js';
import { logger } from './logger.js';

afterEach(() => {
  vi.restoreAllMocks();
});

function buildApp() {
  const app = express();
  app.use(requestId);
  app.use(accessLog({ service: 'test-svc', log: logger }));
  app.get('/ping', (req, res) => {
    res.json({ requestId: req.requestId ?? null });
  });
  return app;
}

describe('requestId middleware', () => {
  it('mints and echoes a request id when none is supplied', async () => {
    const res = await request(buildApp()).get('/ping').expect(200);
    expect(typeof res.body.requestId).toBe('string');
    expect(res.headers['x-request-id']).toBe(res.body.requestId);
  });

  it('propagates an inbound request id untouched', async () => {
    const res = await request(buildApp()).get('/ping').set('X-Request-Id', 'trace-123').expect(200);
    expect(res.body.requestId).toBe('trace-123');
    expect(res.headers['x-request-id']).toBe('trace-123');
  });
});

describe('accessLog middleware', () => {
  it('logs method, path, status and request id on finish', async () => {
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      lines.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    });
    await request(buildApp()).get('/ping').set('X-Request-Id', 'log-1').expect(200);
    const entry = lines.find((l) => l.includes('request'));
    expect(entry).toBeDefined();
    expect(entry).toContain('/ping');
    expect(entry).toContain('log-1');
  });
});

describe('propagationHeaders', () => {
  it('forwards the request id, or returns empty headers', () => {
    expect(propagationHeaders({ requestId: 'abc' })).toEqual({ 'X-Request-Id': 'abc' });
    expect(propagationHeaders()).toEqual({});
    expect(propagationHeaders({})).toEqual({});
  });
});
