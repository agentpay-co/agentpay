# Vault Reconciliation

`packages/orchestrator/src/reconciliation.ts` reconciles the off-chain vault
ledger (`vault-ledger.ts`) against the on-chain AgentVault contract, which is
treated as the source of truth.

## Scope

This worker reconciles **account-level** state only: a user's `balance` and
`total_spent` as reported by `getAccount()`, compared against the sum of
their local ledger entries (deposits, withdrawals, payments).

**Not covered:** task-level reconciliation against BudgetGuardian's
`getTask()`. BudgetGuardian is a separate contract that is not currently
wired into the live task pipeline (`server.ts` only calls
`agent-vault-client.ts` for `createTask`/`releasePayment`/`completeTask`), so
there's no live `vault_task_id` -> BudgetGuardian mapping to reconcile yet.
See the diff-model discussion on issue #105 for the two-pass design this
was scoped from.

## How it works

- **Dry-run (default):** `GET /reconciliation` computes a drift report and
  changes nothing.
- **Repair:** `GET /reconciliation?repair=true` additionally appends a
  corrective `adjustment` entry to the local ledger for any user with
  balance drift, and writes an audit record for every field changed.
- **Idempotent:** running repair twice in a row with no new drift makes no
  further changes (the second run finds `local === chain` and does nothing).
- **Never writes on-chain.** The chain is read-only input; only the local
  ledger and the audit log are ever modified.

## Drift classes

| Type | Meaning |
|---|---|
| `balance_mismatch` | Local derived balance (deposits - withdrawals - payments) differs from chain `balance` |
| `spent_mismatch` | Local summed `payment` entries differ from chain `total_spent` |

`budget_lock` ledger entries are informational only (they represent an
in-flight lock, not a settled movement) and are excluded from both totals,
mirroring how the chain's `balance`/`total_spent` only reflect settled
activity.

All comparisons are done in stroops (fixed-point), not floating-point USDC,
to avoid false-positive drift from rounding.

## Endpoints

- `GET /reconciliation` -- run a dry-run pass, return the full drift report.
- `GET /reconciliation?repair=true` -- run and apply repairs.
- `GET /reconciliation/audit` -- full append-only audit trail.
- `GET /reconciliation/audit?user_address=...` -- audit trail for one user.
- `GET /metrics` -- now includes a `reconciliation` block: `last_run`,
  `last_mode`, `drift_count`, `repaired_count`.

## Data files

- `data/reconciliation-audit.json` -- append-only audit log. Never
  overwritten; only ever appended to.

## Offline audit (no chain access)

`npx tsx scripts/reconcile.ts` (or `npm run reconcile`) cross-checks the
three local stores against *each other* — no vault deployment needed, so it
works on a fresh checkout today. It complements the on-chain reconciler
above: run the offline audit first (cheap, local), then the on-chain pass
once a vault is deployed.

```bash
npx tsx scripts/reconcile.ts                  # human-readable report
npx tsx scripts/reconcile.ts --json           # parseable JSON array
npx tsx scripts/reconcile.ts --strict         # warnings fail too (CI gates)
npm run reconcile -- --data-dir /tmp/copy    # audit a copied data dir
```

Exit codes: `0` clean (warnings allowed unless `--strict`), `1` findings,
`2` usage error. Missing store files count as empty; corrupt files are
reported as `unreadable-store` errors.

Finding codes: `duplicate-ledger-id`, `duplicate-activity-id`,
`duplicate-task-result`, `ledger-payment-without-activity`,
`activity-payment-without-ledger`, `result-without-completion`,
`unfinished-task` (warn — may still be running),
`negative-derived-balance`, `unreadable-store`.