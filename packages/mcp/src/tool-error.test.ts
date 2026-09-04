import { describe, it, expect, afterEach, vi } from 'vitest';
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import {
  McpToolError,
  fetchWithTimeout,
  withRpcTimeout,
  toErrorContent,
  requestTimeoutMs,
  isNetworkError,
} from './tool-error.js';

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.MCP_REQUEST_TIMEOUT_MS;
});

describe('requestTimeoutMs', () => {
  it('defaults to 10s and honors the env override with a floor', () => {
    expect(requestTimeoutMs()).toBe(10_000);
    process.env.MCP_REQUEST_TIMEOUT_MS = '2500';
    expect(requestTimeoutMs()).toBe(2500);
    process.env.MCP_REQUEST_TIMEOUT_MS = '1';
    expect(requestTimeoutMs()).toBe(100);
    process.env.MCP_REQUEST_TIMEOUT_MS = 'bogus';
    expect(requestTimeoutMs()).toBe(10_000);
  });
});

describe('fetchWithTimeout', () => {
  let server: Server;
  let baseUrl: string;

  async function hangServer(): Promise<void> {
    await new Promise<void>((resolve) => {
      // Never responds — every request hangs until the client gives up.
      server = createServer(() => {});
      server.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        resolve();
      });
    });
  }

  afterEach(async () => {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  });

  it('fails fast with REQUEST_TIMEOUT on a hanging server', async () => {
    await hangServer();
    const error = await fetchWithTimeout(`${baseUrl}/hang`, {}, 100).catch((e) => e);
    expect(error).toBeInstanceOf(McpToolError);
    expect(error.code).toBe('REQUEST_TIMEOUT');
    expect(error.retryable).toBe(true);
  });

  it('passes through successful responses untouched', async () => {
    await new Promise<void>((resolve) => {
      server = createServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      });
      server.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        resolve();
      });
    });
    const res = await fetchWithTimeout(`${baseUrl}/ok`, {}, 2000);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe('withRpcTimeout', () => {
  it('returns the value when the operation is fast enough', async () => {
    await expect(withRpcTimeout(Promise.resolve(42), 'op', 1000)).resolves.toBe(42);
  });

  it('rejects with RPC_TIMEOUT when the operation hangs', async () => {
    const hanging = new Promise<never>(() => {});
    const error = await withRpcTimeout(hanging, 'getAccount', 50).catch((e) => e);
    expect(error).toBeInstanceOf(McpToolError);
    expect(error.code).toBe('RPC_TIMEOUT');
    expect(error.retryable).toBe(true);
    expect(String(error.message)).toContain('getAccount');
  });
});

describe('toErrorContent', () => {
  it('serializes McpToolError with code and retryable flag', () => {
    const content = toErrorContent(
      'search_agents',
      new McpToolError('REGISTRY_UNREACHABLE', 'down', true),
      {
        capability: 'x',
      },
    );
    const parsed = JSON.parse(content.content[0].text) as {
      error: Record<string, unknown>;
    };
    expect(parsed.error).toMatchObject({
      tool: 'search_agents',
      code: 'REGISTRY_UNREACHABLE',
      message: 'down',
      retryable: true,
      capability: 'x',
    });
  });

  it('wraps unknown errors as non-retryable CONTRACT_ERROR', () => {
    const content = toErrorContent('build_deposit', new Error('weird'));
    const parsed = JSON.parse(content.content[0].text) as {
      error: Record<string, unknown>;
    };
    expect(parsed.error).toMatchObject({ tool: 'build_deposit', retryable: false });
  });
});

describe('isNetworkError', () => {
  it('classifies transport failures', () => {
    expect(isNetworkError(new TypeError('fetch failed'))).toBe(true);
    expect(isNetworkError(new Error('connect ECONNREFUSED 127.0.0.1'))).toBe(true);
    expect(isNetworkError(new Error('Registry returned 500'))).toBe(false);
    expect(isNetworkError('plain string')).toBe(false);
  });
});
