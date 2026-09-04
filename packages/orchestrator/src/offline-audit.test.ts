import { describe, it, expect } from 'vitest';
import { auditExitCode, auditStores, formatFindings, type AuditInput } from './offline-audit.js';
import type { ActivityEvent } from './activity-store.js';
import type { TaskResultEntry } from './task-results.js';
import type { VaultLedgerEntry } from './vault-ledger.js';

function ledgerTx(overrides: Partial<VaultLedgerEntry> = {}): VaultLedgerEntry {
  return {
    id: `vlt_${Math.random().toString(36).slice(2)}`,
    user_address: 'GUSER',
    type: 'payment',
    amount_usdc: 0.02,
    task_id: 'task-1',
    agent_name: 'oracle',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function activityEvent(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: `act_${Math.random().toString(36).slice(2)}`,
    user_address: 'GUSER',
    event: 'payment_released',
    task_id: 'task-1',
    amount_usdc: 0.02,
    agent_name: 'oracle',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function taskResult(overrides: Partial<TaskResultEntry> = {}): TaskResultEntry {
  return {
    task_id: 'task-1',
    user_address: 'GUSER',
    prompt: 'do things',
    status: 'complete',
    total_cost: 0.02,
    total_time_ms: 100,
    final_output: 'done',
    steps: [],
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function balanced(): AuditInput {
  return {
    ledger: [
      {
        ...ledgerTx({
          id: 'v-dep',
          type: 'deposit',
          amount_usdc: 5,
          task_id: undefined,
          agent_name: undefined,
        }),
      },
      ledgerTx({ id: 'v-pay' }),
    ],
    activity: [
      activityEvent({
        id: 'a-start',
        event: 'task_started',
        amount_usdc: undefined,
        agent_name: undefined,
      }),
      activityEvent({ id: 'a-pay' }),
      activityEvent({
        id: 'a-done',
        event: 'task_completed',
        amount_usdc: 0.02,
        agent_name: undefined,
      }),
    ],
    results: [taskResult()],
  };
}

describe('auditStores', () => {
  it('reports nothing for a consistent triple', () => {
    expect(auditStores(balanced())).toEqual([]);
  });

  it('detects duplicate ids in every file', () => {
    const input = balanced();
    input.ledger.push({ ...input.ledger[1], amount_usdc: 0.03 });
    input.activity.push({ ...input.activity[1] });
    input.results.push({ ...input.results[0] });
    const codes = auditStores(input).map((f) => f.code);
    expect(codes).toContain('duplicate-ledger-id');
    expect(codes).toContain('duplicate-activity-id');
    expect(codes).toContain('duplicate-task-result');
  });

  it('detects a ledger payment with no activity event', () => {
    const input = balanced();
    input.activity = input.activity.filter((e) => e.event !== 'payment_released');
    const findings = auditStores(input);
    const paymentFinding = findings.filter((f) => f.code === 'ledger-payment-without-activity');
    expect(paymentFinding).toHaveLength(1);
    expect(paymentFinding[0].severity).toBe('error');
  });

  it('detects an activity payment with no ledger entry', () => {
    const input = balanced();
    input.ledger = input.ledger.filter((t) => t.type !== 'payment');
    expect(auditStores(input).map((f) => f.code)).toContain('activity-payment-without-ledger');
  });

  it('detects a stored result with no completion event', () => {
    const input = balanced();
    input.activity = input.activity.filter(
      (e) => e.event !== 'task_completed' && e.event !== 'task_failed',
    );
    const findings = auditStores(input);
    expect(findings.map((f) => f.code)).toContain('result-without-completion');
  });

  it('warns (not errors) on a started but unfinished task', () => {
    const input: AuditInput = {
      ledger: [],
      activity: [activityEvent({ id: 'a-s', event: 'task_started', task_id: 'running-1' })],
      results: [],
    };
    const findings = auditStores(input);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: 'warn', code: 'unfinished-task' });
  });

  it('detects a negative derived balance', () => {
    const input: AuditInput = {
      ledger: [ledgerTx({ id: 'v-only-pay', task_id: undefined, agent_name: undefined })],
      activity: [],
      results: [],
    };
    const findings = auditStores(input);
    expect(findings.map((f) => f.code)).toContain('negative-derived-balance');
  });

  it('tolerates float dust below one micro-cent', () => {
    const input = balanced();
    input.ledger[1].amount_usdc = 0.0200000005;
    expect(auditStores(input)).toEqual([]);
  });
});

describe('formatFindings / auditExitCode', () => {
  it('prints OK and exits 0 when clean', () => {
    expect(formatFindings([])).toContain('OK:');
    expect(auditExitCode([])).toBe(0);
  });

  it('prints named lines and exits 1 on errors', () => {
    const out = formatFindings(auditStores({ ledger: [], activity: [], results: [] }));
    expect(out).toBe('OK: ledger, activity log and task results are consistent.');
    const findings = auditStores({
      ledger: [ledgerTx({ id: 'v-x', task_id: undefined, agent_name: undefined })],
      activity: [],
      results: [],
    });
    expect(formatFindings(findings)).toContain('[negative-derived-balance]');
    expect(auditExitCode(findings)).toBe(1);
  });

  it('emits parseable JSON with --json', () => {
    const findings = auditStores({
      ledger: [],
      activity: [activityEvent({ id: 'a-s', event: 'task_started', task_id: 'r-1' })],
      results: [],
    });
    const parsed = JSON.parse(formatFindings(findings, { json: true })) as Array<{
      code: string;
    }>;
    expect(parsed.map((f) => f.code)).toEqual(['unfinished-task']);
  });

  it('warnings pass by default but fail under --strict', () => {
    const findings = auditStores({
      ledger: [],
      activity: [activityEvent({ id: 'a-s', event: 'task_started', task_id: 'r-1' })],
      results: [],
    });
    expect(auditExitCode(findings)).toBe(0);
    expect(auditExitCode(findings, { strict: true })).toBe(1);
  });
});

describe('result cost cross-check', () => {
  it('warns when total_cost differs from released payments', () => {
    const input = balanced();
    input.results[0].total_cost = 99.99;
    const findings = auditStores(input);
    expect(findings.map((f) => f.code)).toContain('result-cost-mismatch');
    expect(findings.every((f) => f.severity === 'warn')).toBe(true);
  });

  it('stays quiet when costs reconcile', () => {
    expect(auditStores(balanced()).map((f) => f.code)).not.toContain('result-cost-mismatch');
  });
});
