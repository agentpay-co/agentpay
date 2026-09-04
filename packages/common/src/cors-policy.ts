/**
 * Environment-driven CORS policy.
 *
 * Local development stays permissive (no `CORS_ORIGINS` set) but logs a loud
 * warning. Set `CORS_ORIGINS` to a comma-separated allowlist to restrict
 * cross-origin access. Production refuses to boot permissive: with
 * `NODE_ENV=production` and no allowlist, `corsMiddleware()` throws an
 * actionable error instead of silently serving `Access-Control-Allow-Origin: *`.
 */
import cors from 'cors';
import type { RequestHandler } from 'express';
import { logger } from './logger.js';

export const CORS_ENV_VAR = 'CORS_ORIGINS';

/** Parse a comma-separated origin list; trims entries and drops empties. */
export function parseOriginAllowlist(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Build the CORS middleware for a service. Throws in production when no
 * allowlist is configured (fail-closed).
 */
export function corsMiddleware(service: string): RequestHandler {
  const allowlist = parseOriginAllowlist(process.env[CORS_ENV_VAR]);
  if (allowlist.length === 0) {
    if (isProduction()) {
      throw new Error(
        `[${service}] Refusing to boot with permissive CORS in production. ` +
          `Set ${CORS_ENV_VAR} to a comma-separated list of allowed origins ` +
          `(e.g. ${CORS_ENV_VAR}=https://agentpay-orchestrator.onrender.com).`,
      );
    }
    logger.warn(
      `[${service}] CORS is permissive (no ${CORS_ENV_VAR} set). ` +
        `Set ${CORS_ENV_VAR} before any production deployment.`,
    );
    return cors();
  }
  return cors({ origin: allowlist });
}
