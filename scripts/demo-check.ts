#!/usr/bin/env tsx
/**
 * Rehearsed demo check — runs the fixed demo script against the live stack.
 *
 * Designed for LLM_PROVIDER=mock rehearsals (no API key, no funds), and used
 * verbatim for the funded live run. Fails fast with a named stage instead of
 * hanging: every gate below asserts before the next one runs.
 *
 * Usage:
 *   ./scripts/start.sh                       # services up (mock or live)
 *   npx tsx scripts/demo-check.ts            # or: npm run demo-check
 *
 * Exit codes: 0 all demo tasks completed, 1 a stage failed, 2 services down.
 */
import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { auditStores } from '../packages/orchestrator/src/offline-audit.js';
import type { VaultLedgerEntry } from '../packages/orchestrator/src/vault-ledger.js';
import type { ActivityEvent } from '../packages/orchestrator/src/activity-store.js';
import type { TaskResultEntry } from '../packages/orchestrator/src/task-results.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config ────────────────────────────────────────────────────────────────────

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://localhost:3000';
const REGISTRY_URL = process.env.REGISTRY_URL || 'http://localhost:4000';
const WS_URL = ORCHESTRATOR_URL.replace(/^http/, 'ws') + '/ws';

/** Fixed demo catalog: same prompts and budgets every run, live or rehearsed. */
export const DEMO_TASKS = [
  { prompt: 'What is the current price of XLM in USD?', budget: 0.5 },
  { prompt: 'Get the latest blockchain news headlines.', budget: 0.5 },
  {
    prompt: 'Fetch the latest blockchain news and analyse the overall sentiment.',
    budget: 1.0,
  },
];

const EXPECTED_AGENTS = 5;

// ── Narration ─────────────────────────────────────────────────────────────────

function say(line: string): void {
  console.log(line);
}

function stage(name: string): void {
  console.log(`\n── ${name} ──`);
}

function fail(stageName: string, detail: string): never {
  console.error(`\n✗ STAGE FAILED [${stageName}]: ${detail}`);
  process.exit(1);
}

// ── Stage 1: services are up ──────────────────────────────────────────────────

async function gateServicesUp(): Promise<void> {
  stage('Stage 1/5 — services are up');
  for (const [name, url] of [
    ['orchestrator', `${ORCHESTRATOR_URL}/health`],
    ['registry', `${REGISTRY_URL}/health`],
  ] as const) {
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    } catch {
      console.error(`[demo-check] ${name} is not responding at ${url}`);
      console.error('[demo-check] Run ./scripts/start.sh first, then re-run this script.');
      process.exit(2);
    }
    if (!res.ok) fail('services-up', `${name} health returned HTTP ${res.status}`);
    say(`  ✓ ${name} healthy`);
  }
}

// ── Stage 2: agents are registered ────────────────────────────────────────────

async function gateAgentsRegistered(): Promise<number> {
  stage('Stage 2/5 — agents are registered');
  let res: Response;
  try {
    res = await fetch(`${REGISTRY_URL}/agents`, { signal: AbortSignal.timeout(8000) });
  } catch {
    fail('agents-registered', `could not reach ${REGISTRY_URL}/agents`);
  }
  const data = (await res!.json()) as unknown;
  const agents = Array.isArray(data) ? data : ((data as { agents?: unknown[] }).agents ?? []);
  if (agents.length === 0) {
    fail(
      'agents-registered',
      'registry lists zero agents — restart the agents after the registry is healthy',
    );
  }
  say(`  ✓ ${agents.length} agent(s) registered`);
  if (agents.length < EXPECTED_AGENTS) {
    say(`  ⚠ expected ${EXPECTED_AGENTS} — a degraded demo still runs, but check logs/`);
  }
  return agents.length;
}

// ── Stage 3: every demo prompt previews feasible and within budget ────────────

interface PreviewStep {
  agent_id: string;
  estimated_cost: number;
}

interface PreviewResult {
  feasible: boolean;
  total_estimated_cost: number;
  budget: number;
  over_budget: boolean;
  steps: PreviewStep[];
}

async function gatePreviewsFeasible(): Promise<void> {
  stage('Stage 3/5 — previews are feasible and within budget');
  for (const { prompt, budget } of DEMO_TASKS) {
    let res: Response;
    try {
      res = await fetch(`${ORCHESTRATOR_URL}/api/tasks/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, budget }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      fail('previews-feasible', `preview request failed: ${(err as Error).message}`);
    }
    if (!res!.ok) {
      const body = await res!.json().catch(() => ({}));
      fail(
        'previews-feasible',
        `preview for "${prompt.slice(0, 50)}…" returned HTTP ${res!.status} (${JSON.stringify(body).slice(0, 120)})`,
      );
    }
    const preview = (await res!.json()) as PreviewResult;
    if (!preview.feasible) fail('previews-feasible', `planner reports infeasible: "${prompt}"`);
    if (preview.over_budget || preview.total_estimated_cost > budget) {
      fail(
        'previews-feasible',
        `plan cost ${preview.total_estimated_cost} exceeds budget ${budget}: "${prompt}"`,
      );
    }
    say(
      `  ✓ "${prompt.slice(0, 60)}…" → ${preview.steps.length} step(s), est. $${preview.total_estimated_cost}`,
    );
  }
}

export { gateServicesUp, gateAgentsRegistered, gatePreviewsFeasible };
export { WS_URL, ORCHESTRATOR_URL, REGISTRY_URL };

// ── Stage 4: submit, approve, and track each demo task ────────────────────────
// The narrator approves each plan explicitly after a short beat — this is the
// rehearsal for the live 60s approval gate (PLAN_APPROVAL_TIMEOUT_MS).

interface TrackedTask {
  resolve: (result: 'complete' | 'failed') => void;
  taskId: string;
  cost: number;
}

const pending = new Map<string, TrackedTask>();

async function submitTask(prompt: string, budget: number): Promise<string> {
  const res = await fetch(`${ORCHESTRATOR_URL}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Request-Id': `demo-${Date.now()}` },
    body: JSON.stringify({ task: prompt, budget }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    fail('execute-tasks', `submit failed: ${(err as { error?: string }).error ?? 'unknown'}`);
  }
  const data = (await res.json()) as { task_id: string };
  if (!data.task_id) fail('execute-tasks', 'submit response carried no task_id');
  return data.task_id;
}

async function approveTask(taskId: string): Promise<void> {
  const res = await fetch(`${ORCHESTRATOR_URL}/api/tasks/${taskId}/approve`, {
    method: 'POST',
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) say(`  → approval call returned ${res.status} (may have auto-approved)`);
}

function connectWatcher(onReady: () => void): WebSocket {
  const ws = new WebSocket(WS_URL);
  ws.on('open', onReady);
  ws.on('message', (raw: Buffer) => {
    let msg: { event: string; data?: Record<string, unknown> };
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    const taskId = msg.data?.task_id as string | undefined;
    const tracker = taskId ? pending.get(taskId) : undefined;
    if (!tracker) return;
    switch (msg.event) {
      case 'plan_approval_required': {
        say('  → narrator: the plan is on screen — approving now (live: you have 60s)');
        setTimeout(() => void approveTask(tracker.taskId), 2000);
        break;
      }
      case 'plan_approved':
      case 'plan_auto_approved':
        say('  → plan approved, executing');
        break;
      case 'step_complete':
        say(`  · step done (${String(msg.data?.agent_name ?? 'agent')})`);
        break;
      case 'task_complete':
        tracker.cost = Number(msg.data?.total_cost ?? 0);
        tracker.resolve('complete');
        break;
      case 'task_failed':
      case 'task_infeasible':
        say(`  ✗ task ended: ${msg.event} ${String(msg.data?.error ?? '')}`);
        tracker.resolve('failed');
        break;
    }
  });
  ws.on('error', (err: Error) => fail('execute-tasks', `websocket error: ${err.message}`));
  return ws;
}

interface TaskOutcome {
  outcome: 'complete' | 'failed';
  cost: number;
}

function waitForTask(taskId: string, timeoutMs = 180_000): Promise<TaskOutcome> {
  return new Promise((resolve) => {
    const finish = (outcome: 'complete' | 'failed') => {
      clearTimeout(safety);
      const tracker = pending.get(taskId);
      pending.delete(taskId);
      resolve({ outcome, cost: tracker?.cost ?? 0 });
    };
    const safety = setTimeout(() => {
      if (pending.has(taskId)) {
        say(`  ⚠ task ${taskId} produced no terminal event within ${timeoutMs / 1000}s`);
        finish('failed');
      }
    }, timeoutMs);
    pending.set(taskId, { taskId, cost: 0, resolve: finish });
  });
}

export interface DemoTaskResult {
  prompt: string;
  budget: number;
  task_id: string;
  cost: number;
}

async function runDemoTask(prompt: string, budget: number, index: number): Promise<DemoTaskResult> {
  say(`\n  [${index + 1}/${DEMO_TASKS.length}] "${prompt}" (budget $${budget})`);
  const taskId = await submitTask(prompt, budget);
  say(`  task_id: ${taskId}`);
  const { outcome, cost } = await waitForTask(taskId);
  if (outcome !== 'complete') fail('execute-tasks', `task ${taskId} did not complete`);
  if (cost > budget) fail('execute-tasks', `task ${taskId} cost $${cost} over $${budget} budget`);
  say(`  ✓ complete — cost $${cost.toFixed(4)} (budget $${budget})`);
  return { prompt, budget, task_id: taskId, cost };
}

export { submitTask, approveTask, connectWatcher, waitForTask, runDemoTask };

// ── Stage 5: local stores still reconcile ─────────────────────────────────────

function readJsonArray<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) return [];
  const parsed: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Array.isArray(parsed) ? (parsed as T[]) : [];
}

async function gateStoresReconcile(): Promise<void> {
  stage('Stage 5/5 — local stores reconcile');
  const dataDir = process.env.AGENTPAY_DATA_DIR ?? path.join(__dirname, '..', 'data');
  const findings = auditStores({
    ledger: readJsonArray<VaultLedgerEntry>(path.join(dataDir, 'vault-ledger.json')),
    activity: readJsonArray<ActivityEvent>(path.join(dataDir, 'activity-log.json')),
    results: readJsonArray<TaskResultEntry>(path.join(dataDir, 'task-results.json')),
  });
  const errors = findings.filter((f) => f.severity === 'error');
  for (const warning of findings.filter((f) => f.severity === 'warn')) {
    say(`  ⚠ [${warning.code}] ${warning.message}`);
  }
  if (errors.length > 0) {
    for (const error of errors) say(`  ✗ [${error.code}] ${error.message}`);
    fail('stores-reconcile', `${errors.length} reconciliation error(s) — run npm run reconcile`);
  }
  say('  ✓ ledger, activity log and task results are consistent');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  say('╔════════════════════════════════════════╗');
  say('║  AgentPay Demo Check (fixed script)    ║');
  say('║  3 tasks · explicit approval · audited ║');
  say('╚════════════════════════════════════════╝');

  await gateServicesUp();
  await gateAgentsRegistered();
  await gatePreviewsFeasible();

  stage('Stage 4/5 — execute demo tasks');
  const ws = await new Promise<WebSocket>((resolve) => {
    const socket = connectWatcher(() => resolve(socket));
  });
  const startedAt = Date.now();
  const results: DemoTaskResult[] = [];
  try {
    for (let i = 0; i < DEMO_TASKS.length; i++) {
      results.push(await runDemoTask(DEMO_TASKS[i].prompt, DEMO_TASKS[i].budget, i));
    }
  } finally {
    ws.close();
  }

  await gateStoresReconcile();

  const totalCost = results.reduce((sum, r) => sum + r.cost, 0);
  const totalBudget = results.reduce((sum, r) => sum + r.budget, 0);
  say('\n═══════════════════════════════════════════');
  say('  Demo check PASSED');
  say('═══════════════════════════════════════════');
  for (const r of results) {
    say(`  ✓ "${r.prompt.slice(0, 52)}…" — $${r.cost.toFixed(4)} / $${r.budget}`);
  }
  say(`  Total: $${totalCost.toFixed(4)} / $${totalBudget} across ${results.length} tasks`);
  say(`  Wall time: ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
  say('═══════════════════════════════════════════');
}

const isMain =
  process.argv[1] !== undefined && path.resolve(process.argv[1]).endsWith('demo-check.ts');
if (isMain) {
  main().catch((err) => {
    console.error(`[demo-check] Fatal: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
