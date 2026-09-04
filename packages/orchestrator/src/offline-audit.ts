/**
 * Offline audit of the orchestrator's local JSON stores.
 *
 * Unlike `reconciliation.ts` (local ledger vs the on-chain vault), this
 * module cross-checks the three off-chain stores against *each other* with
 * no chain access: every ledger payment must have a matching activity event
 * and vice versa, every stored task result must have a completion event, no
 * two entries may share an id, and no user's derived settled balance may go
 * negative. Amounts compare with a small epsilon (stores keep USDC floats).
 *
 * Pure functions — the CLI wrapper in `scripts/reconcile.ts` handles I/O.
 */
import type { ActivityEvent } from './activity-store.js';
import type { TaskResultEntry } from './task-results.js';
import type { VaultLedgerEntry } from './vault-ledger.js';

export type FindingSeverity = 'error' | 'warn';

export type FindingCode =
  | 'duplicate-ledger-id'
  | 'duplicate-activity-id'
  | 'duplicate-task-result'
  | 'ledger-payment-without-activity'
  | 'activity-payment-without-ledger'
  | 'result-without-completion'
  | 'unfinished-task'
  | 'negative-derived-balance'
  | 'unreadable-store';

export interface AuditFinding {
  severity: FindingSeverity;
  code: FindingCode;
  message: string;
  task_id?: string;
  user_address?: string;
}

export interface AuditInput {
  ledger: VaultLedgerEntry[];
  activity: ActivityEvent[];
  results: TaskResultEntry[];
}

/** Tolerance for float USDC comparisons (1 micro-cent is far below a stroop). */
const AMOUNT_EPSILON = 1e-6;

function amountsMatch(a: number | undefined, b: number | undefined): boolean {
  if (a === undefined || b === undefined) return true;
  return Math.abs(a - b) <= AMOUNT_EPSILON;
}

export function auditStores(input: AuditInput): AuditFinding[] {
  const findings: AuditFinding[] = [];
  findDuplicates(input, findings);
  checkPayments(input, findings);
  checkCompletions(input, findings);
  checkBalances(input, findings);
  return findings;
}

export interface ReportOptions {
  json?: boolean;
}

/** Human-readable lines by default, JSON array with --json. */
export function formatFindings(findings: AuditFinding[], options: ReportOptions = {}): string {
  if (options.json) return JSON.stringify(findings, null, 2);
  if (findings.length === 0) return 'OK: ledger, activity log and task results are consistent.';
  return findings
    .map((f) => {
      const where = [f.task_id ? `task=${f.task_id}` : '', f.user_address ? `user=${f.user_address}` : '']
        .filter(Boolean)
        .join(' ');
      return `${f.severity.toUpperCase()} [${f.code}] ${f.message}${where ? ` (${where})` : ''}`;
    })
    .join('\n');
}

export interface ExitOptions {
  /** Treat warnings as failures (for CI gates). */
  strict?: boolean;
}

/**
 * Exit policy: 0 when clean (warnings allowed unless strict),
 * 1 when errors — or warnings under --strict — are present.
 */
export function auditExitCode(findings: AuditFinding[], options: ExitOptions = {}): number {
  const errors = findings.filter((f) => f.severity === 'error');
  if (errors.length > 0) return 1;
  if (options.strict && findings.length > 0) return 1;
  return 0;
}

function findDuplicates(input: AuditInput, findings: AuditFinding[]): void {
  const seenLedger = new Set<string>();
  for (const e of input.ledger) {
    if (seenLedger.has(e.id)) {
      findings.push({
        severity: 'error',
        code: 'duplicate-ledger-id',
        message: `vault-ledger.json contains duplicate entry id ${e.id}`,
        user_address: e.user_address,
      });
    }
    seenLedger.add(e.id);
  }
  const seenActivity = new Set<string>();
  for (const e of input.activity) {
    if (seenActivity.has(e.id)) {
      findings.push({
        severity: 'error',
        code: 'duplicate-activity-id',
        message: `activity-log.json contains duplicate event id ${e.id}`,
        task_id: e.task_id,
      });
    }
    seenActivity.add(e.id);
  }
  const seenResults = new Set<string>();
  for (const r of input.results) {
    if (seenResults.has(r.task_id)) {
      findings.push({
        severity: 'error',
        code: 'duplicate-task-result',
        message: `task-results.json contains duplicate result for task ${r.task_id}`,
        task_id: r.task_id,
        user_address: r.user_address,
      });
    }
    seenResults.add(r.task_id);
  }
}

function checkPayments(input: AuditInput, findings: AuditFinding[]): void {
  const activityPayments = input.activity.filter((e) => e.event === 'payment_released');
  for (const tx of input.ledger) {
    if (tx.type !== 'payment' || !tx.task_id) continue;
    const match = activityPayments.find(
      (e) =>
        e.task_id === tx.task_id &&
        (e.agent_name === undefined ||
          tx.agent_name === undefined ||
          e.agent_name === tx.agent_name) &&
        amountsMatch(e.amount_usdc, tx.amount_usdc),
    );
    if (!match) {
      findings.push({
        severity: 'error',
        code: 'ledger-payment-without-activity',
        message:
          `ledger payment ${tx.id} (${tx.amount_usdc} USDC` +
          `${tx.agent_name ? ` to ${tx.agent_name}` : ''}) has no matching payment_released event`,
        task_id: tx.task_id,
        user_address: tx.user_address,
      });
    }
  }
  for (const event of activityPayments) {
    const match = input.ledger.find(
      (tx) =>
        tx.type === 'payment' &&
        tx.task_id === event.task_id &&
        amountsMatch(tx.amount_usdc, event.amount_usdc),
    );
    if (!match) {
      findings.push({
        severity: 'error',
        code: 'activity-payment-without-ledger',
        message: `payment_released event ${event.id} has no matching ledger payment`,
        task_id: event.task_id,
        user_address: event.user_address,
      });
    }
  }
}

function checkCompletions(input: AuditInput, findings: AuditFinding[]): void {
  const finished = new Set(
    input.activity
      .filter((e) => e.event === 'task_completed' || e.event === 'task_failed')
      .map((e) => e.task_id),
  );
  for (const r of input.results) {
    if (!finished.has(r.task_id)) {
      findings.push({
        severity: 'error',
        code: 'result-without-completion',
        message: `task result for ${r.task_id} (status ${r.status}) has no task_completed/task_failed event`,
        task_id: r.task_id,
        user_address: r.user_address,
      });
    }
  }
  const started = new Set(
    input.activity.filter((e) => e.event === 'task_started').map((e) => e.task_id),
  );
  const withResult = new Set(input.results.map((r) => r.task_id));
  for (const taskId of started) {
    if (!finished.has(taskId) && !withResult.has(taskId)) {
      findings.push({
        severity: 'warn',
        code: 'unfinished-task',
        message: `task ${taskId} started but has no completion event or stored result (may still be running)`,
        task_id: taskId,
      });
    }
  }
}

function checkBalances(input: AuditInput, findings: AuditFinding[]): void {
  const balance = new Map<string, number>();
  const add = (user: string, delta: number) => balance.set(user, (balance.get(user) ?? 0) + delta);
  for (const tx of input.ledger) {
    switch (tx.type) {
      case 'deposit':
        add(tx.user_address, tx.amount_usdc);
        break;
      case 'withdrawal':
      case 'payment':
        add(tx.user_address, -tx.amount_usdc);
        break;
      case 'adjustment':
        if (tx.adjustment_target === 'balance') {
          add(tx.user_address, tx.adjustment_direction === 'decrease' ? -tx.amount_usdc : tx.amount_usdc);
        }
        break;
      case 'budget_lock':
        // Informational in-flight lock, not a settled movement.
        break;
    }
  }
  for (const [user, value] of balance) {
    if (value < -AMOUNT_EPSILON) {
      findings.push({
        severity: 'error',
        code: 'negative-derived-balance',
        message: `derived settled balance for ${user} is ${value.toFixed(6)} USDC (deposits − withdrawals − payments)`,
        user_address: user,
      });
    }
  }
}
