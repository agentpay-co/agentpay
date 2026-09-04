#!/usr/bin/env tsx
/**
 * Offline audit of the orchestrator's local JSON stores.
 *
 * Cross-checks data/vault-ledger.json, data/activity-log.json and
 * data/task-results.json against each other with no chain access (unlike the
 * on-chain reconciler in packages/orchestrator/src/reconciliation.ts).
 *
 * Usage:
 *   npx tsx scripts/reconcile.ts [--data-dir DIR] [--json] [--strict]
 *   npm run reconcile -- --strict
 *
 * Exit codes: 0 clean (warnings allowed unless --strict), 1 findings,
 * 2 usage error. Missing store files count as empty (fresh checkout).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  auditStores,
  formatFindings,
  auditExitCode,
  type AuditFinding,
} from '../packages/orchestrator/src/offline-audit.js';
import type { ActivityEvent } from '../packages/orchestrator/src/activity-store.js';
import type { TaskResultEntry } from '../packages/orchestrator/src/task-results.js';
import type { VaultLedgerEntry } from '../packages/orchestrator/src/vault-ledger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');

interface CliOptions {
  dataDir: string;
  json: boolean;
  strict: boolean;
}

function parseArgs(argv: string[]): CliOptions | null {
  const options: CliOptions = {
    dataDir: process.env.AGENTPAY_DATA_DIR ?? path.join(REPO_ROOT, 'data'),
    json: false,
    strict: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') options.json = true;
    else if (arg === '--strict') options.strict = true;
    else if (arg === '--data-dir') {
      const value = argv[++i];
      if (!value || value.startsWith('--')) return null;
      options.dataDir = value;
    } else if (arg === '--help' || arg === '-h') {
      return null;
    } else {
      return null;
    }
  }
  return options;
}

/** Read a store file; missing files are empty, corrupt files are reported. */
function readStore<T>(filePath: string, findings: AuditFinding[]): T[] {
  if (!fs.existsSync(filePath)) return [];
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    findings.push({
      severity: 'error',
      code: 'unreadable-store',
      message: `${path.basename(filePath)} exists but is not valid JSON`,
    });
    return [];
  }
}

function usage(): void {
  console.log('Usage: npx tsx scripts/reconcile.ts [--data-dir DIR] [--json] [--strict]');
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (!options) {
    usage();
    process.exit(2);
  }
  const ioFindings: AuditFinding[] = [];
  const input = {
    ledger: readStore<VaultLedgerEntry>(
      path.join(options.dataDir, 'vault-ledger.json'),
      ioFindings,
    ),
    activity: readStore<ActivityEvent>(path.join(options.dataDir, 'activity-log.json'), ioFindings),
    results: readStore<TaskResultEntry>(
      path.join(options.dataDir, 'task-results.json'),
      ioFindings,
    ),
  };
  const findings = [...ioFindings, ...auditStores(input)];
  console.log(formatFindings(findings, { json: options.json }));
  process.exit(auditExitCode(findings, { strict: options.strict }));
}

main().catch((err) => {
  console.error(`reconcile failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(2);
});
