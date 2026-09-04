/**
 * Secret-bearing file hygiene.
 *
 * JSON stores like `wallets.json` and `data/orchestrators.json` hold Stellar
 * secret keys. Files created with default permissions are typically 0644
 * (group/world-readable) — unacceptable for secrets. Helpers here write and
 * check files with owner-only (0600) permissions.
 */
import fs from 'fs';
import path from 'path';

export const SECRET_FILE_MODE = 0o600;

/** True when group or others hold any permission bit on the path. */
export function isExposed(filePath: string): boolean {
  try {
    const mode = fs.statSync(filePath).mode & 0o777;
    return (mode & 0o077) !== 0;
  } catch {
    return false;
  }
}

/**
 * Reduce an existing file to owner-only permissions. No-op when the file
 * does not exist. Never widens permissions.
 */
export function restrictPermissions(filePath: string, mode: number = SECRET_FILE_MODE): void {
  try {
    const current = fs.statSync(filePath).mode & 0o777;
    if ((current & 0o777) !== mode) fs.chmodSync(filePath, mode);
  } catch {
    // Missing file or insufficient rights — callers must not crash on hygiene.
  }
}

/**
 * Write a text file that must end up owner-only: create with a restrictive
 * mode and chmod afterwards so pre-existing files and odd umasks cannot
 * leave secrets readable.
 */
export function writeSecretFile(filePath: string, data: string): void {
  fs.writeFileSync(filePath, data, { mode: SECRET_FILE_MODE });
  restrictPermissions(filePath);
}

/**
 * Describe every secret-bearing path that is currently group/world-readable.
 * Returns human-readable warnings (empty when everything is tight).
 */
export function exposedSecretWarnings(paths: Record<string, string>): string[] {
  const warnings: string[] = [];
  for (const [label, filePath] of Object.entries(paths)) {
    if (isExposed(filePath)) {
      warnings.push(
        `${label} at ${filePath} is group/world-readable — run chmod 600 on it and rotate any exposed keys`,
      );
    }
  }
  return warnings;
}

/**
 * Boot-time check for the standard secret-bearing files (`.env` and
 * `wallets.json` in the working directory) plus any service-specific extras
 * (e.g. `data/orchestrators.json`). Returns warnings to log loudly.
 */
export function secretFileWarnings(extra: Record<string, string> = {}): string[] {
  const cwd = process.cwd();
  return exposedSecretWarnings({
    '.env': path.join(cwd, '.env'),
    'wallets.json': path.join(cwd, 'wallets.json'),
    ...extra,
  });
}
