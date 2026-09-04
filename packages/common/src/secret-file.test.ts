import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  SECRET_FILE_MODE,
  isExposed,
  restrictPermissions,
  writeSecretFile,
  exposedSecretWarnings,
} from './secret-file.js';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'secret-file-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('secret file hygiene', () => {
  it('writeSecretFile creates owner-only files', () => {
    const target = path.join(dir, 'wallets.json');
    writeSecretFile(target, '{"a":1}');
    expect(fs.readFileSync(target, 'utf8')).toBe('{"a":1}');
    expect(fs.statSync(target).mode & 0o777).toBe(SECRET_FILE_MODE);
  });

  it('writeSecretFile tightens a pre-existing loose file', () => {
    const target = path.join(dir, 'existing.json');
    fs.writeFileSync(target, '{}', { mode: 0o644 });
    writeSecretFile(target, '{"b":2}');
    expect(fs.statSync(target).mode & 0o777).toBe(SECRET_FILE_MODE);
  });

  it('isExposed detects group/world-readable files only', () => {
    const loose = path.join(dir, 'loose.json');
    const tight = path.join(dir, 'tight.json');
    fs.writeFileSync(loose, '{}', { mode: 0o644 });
    fs.chmodSync(loose, 0o644);
    writeSecretFile(tight, '{}');
    expect(isExposed(loose)).toBe(true);
    expect(isExposed(tight)).toBe(false);
    expect(isExposed(path.join(dir, 'missing.json'))).toBe(false);
  });

  it('restrictPermissions narrows without ever widening', () => {
    const target = path.join(dir, 'narrow.json');
    fs.writeFileSync(target, '{}', { mode: 0o644 });
    fs.chmodSync(target, 0o644);
    restrictPermissions(target);
    expect(fs.statSync(target).mode & 0o777).toBe(0o600);
    restrictPermissions(path.join(dir, 'does-not-exist.json'));
  });

  it('exposedSecretWarnings names every loose path', () => {
    const loose = path.join(dir, 'loose.json');
    fs.writeFileSync(loose, '{}', { mode: 0o644 });
    fs.chmodSync(loose, 0o644);
    const tight = path.join(dir, 'tight.json');
    writeSecretFile(tight, '{}');
    const warnings = exposedSecretWarnings({ '.env': loose, 'wallets.json': tight });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('.env');
    expect(warnings[0]).toContain('chmod 600');
  });
});
