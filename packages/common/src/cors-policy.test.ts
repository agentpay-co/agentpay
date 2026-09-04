import { describe, it, expect, vi, afterEach } from 'vitest';
import { corsMiddleware, parseOriginAllowlist } from './cors-policy.js';

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.CORS_ORIGINS;
  delete process.env.NODE_ENV;
});

describe('parseOriginAllowlist', () => {
  it('returns [] for unset or blank values', () => {
    expect(parseOriginAllowlist(undefined)).toEqual([]);
    expect(parseOriginAllowlist('')).toEqual([]);
    expect(parseOriginAllowlist('   ')).toEqual([]);
  });

  it('splits on commas, trims, and drops empties', () => {
    expect(parseOriginAllowlist('https://a.example, https://b.example ,,')).toEqual([
      'https://a.example',
      'https://b.example',
    ]);
  });
});

describe('corsMiddleware', () => {
  it('warns but stays open outside production', () => {
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    });
    const mw = corsMiddleware('test-svc');
    expect(typeof mw).toBe('function');
    expect(lines.some((l) => l.includes('CORS is permissive'))).toBe(true);
  });

  it('throws in production without an allowlist', () => {
    process.env.NODE_ENV = 'production';
    expect(() => corsMiddleware('test-svc')).toThrow(/CORS_ORIGINS/);
  });

  it('does not throw in production with an allowlist', () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGINS = 'https://app.example.com';
    expect(() => corsMiddleware('test-svc')).not.toThrow();
  });
});
