import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { writeJsonSafe } from './write-json-safe.js';

let dir: string;
let target: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'write-json-safe-'));
  target = path.join(dir, 'store.json');
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('writeJsonSafe', () => {
  it('round-trips JSON and leaves no .tmp residue', () => {
    writeJsonSafe(target, { a: 1, b: [1, 2, 3] });
    expect(JSON.parse(fs.readFileSync(target, 'utf8'))).toEqual({ a: 1, b: [1, 2, 3] });
    expect(fs.existsSync(target + '.tmp')).toBe(false);
  });

  it('handles large payloads without truncation', () => {
    const data = { rows: Array.from({ length: 5000 }, (_, i) => ({ i, v: 'x'.repeat(64) })) };
    writeJsonSafe(target, data);
    expect(JSON.parse(fs.readFileSync(target, 'utf8'))).toEqual(data);
    expect(fs.existsSync(target + '.tmp')).toBe(false);
  });

  it('creates missing parent directories', () => {
    const nested = path.join(dir, 'a', 'b', 'store.json');
    writeJsonSafe(nested, [1]);
    expect(JSON.parse(fs.readFileSync(nested, 'utf8'))).toEqual([1]);
  });

  it('throws on unserialisable data without touching the disk', () => {
    expect(() => writeJsonSafe(target, { v: BigInt(1) })).toThrow();
    expect(fs.existsSync(target)).toBe(false);
    expect(fs.existsSync(target + '.tmp')).toBe(false);
  });

  it('preserves the previous file when the write fails mid-way', () => {
    writeJsonSafe(target, { version: 1 });
    // A path whose parent is an existing *file* cannot be created.
    const blocker = path.join(dir, 'blocker');
    fs.writeFileSync(blocker, 'x');
    expect(() => writeJsonSafe(path.join(blocker, 'store.json'), { version: 2 })).toThrow();
    expect(JSON.parse(fs.readFileSync(target, 'utf8'))).toEqual({ version: 1 });
  });
});
