import { describe, it, expect, vi, afterEach } from 'vitest';
import { logger } from './logger.js';

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.NODE_ENV;
});

function captureLines(fn: () => void): string[] {
  const lines: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  });
  fn();
  return lines;
}

describe('logger', () => {
  it('keeps the legacy human format without context', () => {
    const lines = captureLines(() => logger.info('hello'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^\[.*\] \[INFO\] hello$/);
  });

  it('appends service and request tags in human mode', () => {
    const lines = captureLines(() =>
      logger.child({ service: 'registry', requestId: 'abc' }).warn('slow'),
    );
    expect(lines[0]).toContain('[WARN] [registry] [req abc] slow');
  });

  it('emits single-line JSON in production mode', () => {
    process.env.NODE_ENV = 'production';
    const lines = captureLines(() =>
      logger.child({ service: 'orchestrator', requestId: 'r1' }).error('boom', { code: 7 }),
    );
    expect(lines).toHaveLength(1);
    const record = JSON.parse(lines[0]) as Record<string, unknown>;
    expect(record).toMatchObject({
      level: 'error',
      msg: 'boom',
      service: 'orchestrator',
      requestId: 'r1',
      data: { code: 7 },
    });
    expect(record.ts).toBeDefined();
  });

  it('child scopes merge context without mutating the parent', () => {
    const parent = logger.child({ service: 'api' });
    const lines = captureLines(() => {
      parent.info('parent-line');
      parent.child({ requestId: 'x' }).info('child-line');
    });
    expect(lines[0]).toContain('[api] parent-line');
    expect(lines[0]).not.toContain('[req x]');
    expect(lines[1]).toContain('[api] [req x] child-line');
  });
});
