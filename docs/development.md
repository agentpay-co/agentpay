# Development Guide

This guide covers day-to-day development on AgentPay: setup, common tasks,
testing, linting, CI, deployment, and debugging. For a high-level tour of the
system, see [architecture.md](architecture.md). For the contribution
workflow (branches, commit style, PR process), see
[CONTRIBUTING.md](../CONTRIBUTING.md).

## Repo structure

```
agentpay/
├── contracts/agent-vault/     AgentVault Soroban contract (Rust)
├── contracts/budget-guardian/ legacy contract, not used by the orchestrator
├── packages/common/            shared types, constants, wallet helpers
├── packages/registry/          agent discovery + reputation API
├── packages/orchestrator/      planner, executor, vault client, WS hub
├── packages/dashboard/         React frontend (not a priority for backend work)
├── packages/agents/*/          five specialist agents
├── scripts/                     setup, lifecycle, and seeding scripts
└── docs/                         this guide + architecture.md
```

## Setup

1. Install Node.js 20 (see `.nvmrc`) and run `npm install` from the repo
   root, this installs all workspace packages.
2. Copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY`. Most other
   variables are filled in by the scripts below.
3. Generate Stellar testnet wallets:

   ```bash
   npx tsx scripts/setup-wallets.ts
   ```

   This creates `wallets.json` (gitignored) and **prints the secret keys to
   stdout**. Copy the printed `*_SECRET_KEY=S...` lines into your `.env` file
   before continuing, the services refuse to start without them.

4. Add USDC trustlines to every wallet:

   ```bash
   npx tsx scripts/add-usdc-trustlines.ts
   ```

5. Fund the orchestrator with testnet USDC (swap XLM → USDC via testnet DEX):

   ```bash
   npx tsx scripts/fund-testnet-usdc.ts
   ```

   The orchestrator receives 9999 XLM from Stellar friendbot during wallet
   setup; this script swaps ~15 XLM → 15 USDC via the testnet DEX. No browser
   required. If the DEX has no liquidity (rare), fall back to
   [https://faucet.circle.com](https://faucet.circle.com) (Stellar Testnet,
   paste orchestrator address).

6. Distribute USDC from the orchestrator to each agent wallet:

   ```bash
   npx tsx scripts/distribute-usdc.ts
   ```

7. (Optional) Deploy AgentVault to your own testnet contract:

   ```bash
   cd contracts/agent-vault && ./deploy.sh
   ```

   This writes `AGENT_VAULT_CONTRACT_ID` to `.env`. If unset, the
   orchestrator's vault client (`agent-vault-client.ts`) detects that the
   vault is inactive (`VAULT_ACTIVE = false`) and all vault calls become safe
   no-ops, useful for working on non-vault code without a deployed contract.

## Running services

```bash
./scripts/start.sh    # build dashboard, start registry + 5 agents + orchestrator
./scripts/stop.sh     # stop everything start.sh started
```

`start.sh` writes each service's stdout/stderr to `logs/<service>.log` and its
PID to `logs/<service>.pid` (both gitignored). Tail a log while debugging:

```bash
tail -f logs/orchestrator.log
```

For tighter iteration on a single service, run it directly:

```bash
npm run dev:registry
npm run dev:orchestrator
npm run dev:oracle       # stellar-oracle agent
npm run dev:webintel      # web-intel agent
npm run dev:webintel2     # web-intel-v2 agent
npm run dev:analysis
npm run dev:reporter
```

Or all of them concurrently with `npm run dev`.

### Seeding data

```bash
npx tsx scripts/bootstrap.ts --auto-approve
```

Runs ~25 varied tasks through the orchestrator so agents accumulate
reputation history, useful when working on the selector or dashboard.

### Rehearsing the demo

```bash
LLM_PROVIDER=mock ./scripts/start.sh   # no API key needed
npm run demo-check                     # fixed script, asserts every stage
```

`demo-check` runs the exact 3-prompt demo (oracle price → news headlines →
news + sentiment analysis, budgets $0.50/$0.50/$1.00) through five gates:
services up → agents registered → previews feasible and within budget →
submit/approve/complete per task → stores reconcile. Exit `0` is a pass,
`1` names the failed stage, `2` means services are down.

Narration to rehearse while it runs:

1. "The dashboard shows the plan and its cost before anything is spent."
2. On the approval beat: "I approve — live, the audience gets 60 seconds
   here before auto-approval."
3. On each `task_complete`: "Payment released per step, remainder refunded —
   the vault never lets spending exceed the budget."

If a stage fails, say the fallback line: "That's the mock path showing its
honest error — on the live run this is where the funded vault takes over."
The live run is the same command against funded services plus a Freighter
wallet: deposit first, then watch `task_complete` and record the explorer
TX hashes in `docs/demo-notes.md` (copy the template there).

## Common tasks

```bash
npm run build       # build all backend services (esbuild) + dashboard
npm run typecheck   # tsc --noEmit across every workspace package
npm run lint        # ESLint over all TypeScript sources
npm run format      # Prettier --write
npm run format:check  # Prettier --check (used in CI)
npm test            # Vitest unit tests
npm run reconcile   # offline audit of vault-ledger/activity/task-results
npm run demo-check  # rehearsed 3-task demo with stage assertions
```

Build a single service with `npm run build:<name>` (e.g. `build:orchestrator`,
`build:oracle`), see `package.json` for the full list. Each maps to an
esbuild invocation that bundles the service into `packages/<pkg>/dist/`.

## Registry API endpoints

### GET /agents

Discover agents with optional filters and pagination support.

**Query parameters**

- `capabilities` (optional): Comma-separated list of required capabilities
- `min_reputation` (optional): Minimum reputation score (0-100)
- `payment_model` (optional): Filter by payment model (`x402` or `mpp`)
- `status` (optional): Filter by agent status (e.g., `active`)
- `limit` (optional): Number of results to return per page (default: 20, max: 100, min: 1)
- `offset` (optional): Number of results to skip (default: 0, min: 0)

**Behavior**

- Agents are ordered by reputation score (highest first) before pagination
- Pagination is applied after all filters
- Invalid/negative values for `limit` and `offset` are clamped to valid ranges, not rejected
- When `limit` or `offset` are provided, the response includes an envelope with metadata
- When neither `limit` nor `offset` are provided, the response is a bare array (backward compatible)

**Response without pagination (backward compatible)**

```json
[
  {
    "agent_id": "agent-web-intel",
    "name": "Web Intel Agent",
    ...
  }
]
```

**Response with pagination**

```json
{
  "agents": [
    {
      "agent_id": "agent-web-intel",
      "name": "Web Intel Agent",
      ...
    }
  ],
  "total": 45,
  "limit": 20,
  "offset": 0
}
```

**Example requests**

```bash
# Get first 20 agents (paginated, first page)
curl "http://localhost:4000/agents?limit=20"

# Get agents 21-40
curl "http://localhost:4000/agents?limit=20&offset=20"

# Filter by capabilities and paginate
curl http://localhost:4000/agents?capabilities=web-search,news&limit=10

# Filter by minimum reputation and paginate
curl http://localhost:4000/agents?min_reputation=70&limit=5&offset=10
```

**Pagination design rationale**

- Default limit of 20: Balances dashboard rendering performance with API efficiency for typical use cases
- Maximum limit of 100: Applies only when pagination parameters are provided; prevents unbounded responses while allowing bulk operations
- Reputation ordering: Ensures stable, deterministic pagination across requests
- Backward compatibility: Existing clients without pagination params continue to work with bare array responses

## Orchestrator API endpoints

### POST /api/tasks/preview

Returns the execution plan for a task without creating a task or touching
the vault. Useful for showing users what agents will be selected and the
estimated cost before they commit USDC.

**Request body**

```json
{ "prompt": "summarise yesterday's Stellar DEX volume", "budget": 1.0 }
```

`prompt` and `task` are interchangeable. `budget` defaults to `DEFAULT_BUDGET`
(1.0 USDC) if omitted.

**Success response (200)**

```json
{
  "feasible": true,
  "total_estimated_cost": 0.02,
  "budget": 1.0,
  "over_budget": false,
  "reasoning": "Use stellar-oracle to fetch DEX stats.",
  "steps": [
    {
      "agent_id": "stellar-oracle-v1",
      "agent_name": "Stellar Oracle",
      "action": "Fetch yesterday's DEX volume from Stellar Horizon",
      "estimated_cost": 0.02,
      "payment_method": "x402",
      "endpoint": "https://stellar-oracle.example.com"
    }
  ]
}
```

**Error responses**

| Status | `error` field | Meaning |
|--------|--------------|---------|
| 400 | `task is required` | Body missing both `task` and `prompt` |
| 422 | `feasible: false` | No registered agent covers the required capabilities |
| 503 | `no_agents` | Registry has no active agents |
| 503 | `registry_unavailable` | Cannot reach the registry service |

**Example curl**

```bash
curl -s -X POST http://localhost:3000/api/tasks/preview \
  -H 'Content-Type: application/json' \
  -d '{"prompt": "summarise yesterday Stellar DEX volume", "budget": 1.0}' | jq .
```

### GET /metrics

Operational counters for the orchestrator process, task throughput, step
outcomes, USDC released, and step-latency percentiles. Intended for a status
dashboard or an alerting rule; no authentication, no user address required.

The response is **plain JSON** (not Prometheus text exposition). The shape is
stable, fields may be added, but existing ones keep their names and meaning.

```json
{
  "uptime_seconds": 3612,
  "tasks": { "total": 42, "active": 1, "completed": 38, "failed": 2, "interrupted": 1 },
  "steps": { "executed": 126, "failed": 4, "timed_out": 2 },
  "usdc_released_total": 2.34,
  "step_duration_ms": { "count": 126, "p50_ms": 840, "p95_ms": 15000, "max_ms": 21400 },
  "memory": { "rss_bytes": 91234304, "heap_used_bytes": 42118400 }
}
```

Field notes:

| Field | Meaning |
|---|---|
| `tasks.total` | Tasks submitted, including those seeded from the activity log |
| `tasks.active` | In flight **in this process** right now |
| `tasks.interrupted` | Were in flight when a previous process exited, seeded at startup, never incremented at runtime |
| `steps.executed` | Step attempts that finished, successfully or not |
| `steps.failed` | Subset of `executed` that failed |
| `steps.timed_out` | Subset of `failed` whose error text reads as a timeout |
| `usdc_released_total` | USDC released from the vault to the orchestrator wallet |
| `step_duration_ms` | Percentiles over the most recent 1024 step attempts (fixed-size ring, so memory is bounded); `null` until the first step runs |

Counters are per-process and dependency-free (`packages/orchestrator/src/metrics.ts`, no metrics library). On startup they are seeded from `data/activity-log.json`
and `data/task-results.json` so a redeploy doesn't zero the totals. Because
activity events are only written for tasks that carry a `user_address`,
anonymous tasks contribute to live counters but are not restored across a
restart.

`tasks.total` is not guaranteed to equal `active + completed + failed +
interrupted`: a task interrupted by a restart is counted in `total` when it
starts and in `interrupted` only after the *next* startup reads the log.

**Example curl**

```bash
curl -s http://localhost:3000/metrics | jq .
```

## Testing

Unit tests use [Vitest](https://vitest.dev/) and are colocated with the code
they test as `*.test.ts`. Current coverage focuses on pure logic that's easy
to verify in isolation:

- `packages/registry/src/reputation.test.ts`, reputation score calculation
  and rolling-average updates.
- `packages/registry/src/search.test.ts`, capability matching.
- `packages/orchestrator/src/selector.test.ts`, agent scoring/selection.
- `packages/orchestrator/src/validator.test.ts`, execution plan validation.
- `packages/orchestrator/src/server.preview.test.ts`, `/api/tasks/preview`
  endpoint (happy path, no-agents 503, infeasible 422).
- `packages/orchestrator/src/metrics.test.ts`, counter transitions, timeout
  classification, percentile math, ring-buffer bounding, and startup seeding.
- `packages/orchestrator/src/server.metrics.test.ts`, `/metrics` response shape.

Run the full suite with `npm test`, or scope to a package with
`npm test -w packages/registry`.

### Contract tests

```bash
cd contracts/agent-vault
cargo test     # uses soroban-sdk testutils
cargo fmt
cargo clippy -- -D warnings
```

### Vault error code sync

`packages/orchestrator/src/vault-errors.ts` mirrors the contract's
`#[contracterror] VaultError` enum (`contracts/agent-vault/src/lib.rs`) as a
TypeScript `VaultErrorCode` enum, so a failed vault call can be surfaced to
callers as a typed `VaultContractError` (`code`, `codeName`, `known`, `raw`)
instead of an opaque string.

`packages/orchestrator/src/vault-errors.test.ts` parses `lib.rs` directly and
asserts every variant name and discriminant matches `VaultErrorCode` exactly,
this runs as part of `npm test` and fails CI if the two drift apart. When you
add or renumber a `VaultError` variant in the contract, update
`VaultErrorCode` in the same PR or this test will fail.

## Linting and formatting

ESLint (TypeScript) and Prettier are configured at the repo root and apply to
every workspace package except `packages/dashboard` (which has its own
frontend tooling and is out of scope for backend hardening). Run
`npm run lint` and `npm run format:check` before opening a PR, CI runs both.

## CI overview

Two workflows run on pull requests and pushes to `main`:

- **`.github/workflows/ci.yml`**, a TypeScript job (`npm ci`, `typecheck`,
  `lint`, `format:check`, `build`, `test`) and a Rust job (`cargo fmt --check`,
  `cargo clippy`, `cargo test` for each contract).
- **`.github/workflows/dependency-review.yml`**, flags newly introduced
  dependencies with known vulnerabilities on pull requests.

## Deployment

`render.yaml` defines all 7 services (registry, orchestrator+dashboard, and
the 5 agents) as a Render Blueprint. To deploy:

1. Push to GitHub and create a Blueprint from this repo in Render.
2. Set the `sync: false` secrets (`*_SECRET_KEY`, `ANTHROPIC_API_KEY`,
   `AGENT_VAULT_CONTRACT_ID`) in the Render dashboard for each service.
3. After the first deploy, update `REGISTRY_URL` and each `*_SELF_URL` env
   var to the assigned `*.onrender.com` URLs, then redeploy, agents
   re-register themselves with the registry on startup.

Render's free tier cold-starts services after inactivity; the orchestrator's
executor (`checkHealth` in `executor.ts`) retries health checks for up to ~90
seconds to accommodate this.

## Common pitfalls

- **Agents can't reach the registry on startup.** Each agent's `register.ts`
  self-registers once at boot with no retry, if the registry isn't up yet,
  the agent won't appear until it's restarted or re-registers via its
  heartbeat. `start.sh` starts the registry first and waits for its health
  check for this reason.
- **Stellar sequence number errors during execution.** `release_payment`
  calls for a task must be submitted in order, `executor.ts`'s
  `releaseSequential` serializes them. If you're calling
  `agent-vault-client.ts` functions directly (e.g. from a script), don't fire
  multiple orchestrator-signed transactions concurrently.
- **Vault calls silently no-op.** If `AGENT_VAULT_CONTRACT_ID` is unset or
  looks like a placeholder, `VAULT_ACTIVE` is `false` and
  `agent-vault-client.ts` returns safe defaults instead of calling the
  contract. Useful for local dev, but confusing if you're expecting on-chain
  state to change.
- **`data/` and `logs/` are gitignored and created at runtime.** If you
  `rm -rf data/`, the registry, vault ledger, activity log, and task history
  all reset. Don't commit anything from `data/`, it includes orchestrator
  wallet secret keys (see [SECURITY.md](../SECURITY.md)).
- **`tsc -b` project references.** Each workspace package has its own
  `tsconfig.json` extending the root config; `npm run typecheck` runs `tsc
  --noEmit` per package rather than relying on a single project-reference
  build.

### JSON store durability

All runtime JSON (`data/registry.json`, `vault-ledger.json`,
`activity-log.json`, `task-results.json`, `orchestrators.json`,
`reconciliation-audit.json`) is written through `@agentpay/common`'s
`writeJsonSafe`: serialise → write `.tmp` → fsync → atomic rename → directory
fsync. A process crash can never leave a truncated store, and an OS crash
cannot lose a completed write. The registry additionally serialises writes
through an in-process queue; call `flushWrites()` (exported from
`packages/registry/src/store.ts`) in shutdown hooks before exiting. A store
file that fails to parse loads as empty and is rewritten on the next write,
so a corrupt file degrades to lost history, never a crash loop. Set
`AGENTPAY_DATA_DIR` to relocate the data directory (tests, hosted ephemeral
disks). This is still single-instance persistence — concurrent processes
remain unsupported.

## Building a specialist agent or service

The agent interface is service-agnostic. Your specialist can be anything that
fulfills three requirements:

1. An HTTP endpoint that responds to the `POST /query` pattern (x402) or an
   MPP session endpoint.
2. A Stellar wallet with a USDC trustline, used to receive payments.
3. A `/health` and `/manifest` endpoint so the registry and orchestrator can
   identify capabilities, pricing, and liveness.

The existing agents in `packages/agents/` all happen to be LLM-powered because
that was the initial focus, but the protocol does not require it. Your
specialist could be:

- A traditional API wrapper (weather data, FX rates, on-chain analytics)
- A computation service (financial modeling, image processing, data transforms)
- A verification service (notarization, credential checks)
- A human-in-the-loop service (tasks fulfilled by a human for USDC payment)
- Any other service that can accept a task query and return a structured result

Use one of the existing agents (e.g. `packages/agents/stellar-oracle`) as a
reference for the manifest schema, payment middleware wiring, and
self-registration pattern. The `@agentpay/agent-sdk` package (Phase 3 on the
roadmap) will eventually package this scaffolding so you don't have to copy it.

### Signing your manifest

Sign your registration manifest with the wallet secret matching its
`stellar_address` so nobody can impersonate your agent id:

```ts
import { signManifest } from '@agentpay/agent-sdk';

const body = signManifest(process.env.MY_AGENT_SECRET_KEY!, manifest);
await fetch(`${REGISTRY_URL}/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
```

Registry behavior today (transition period):

| Manifest | Result |
|---|---|
| Valid signature | `200`, stored record has `signature_verified: true` |
| Invalid signature (tampered, wrong key, malformed) | `401`, nothing stored |
| Unsigned | `200`, `signature_verified: false` |

The same applies to `POST /feedback` attestations (verified against the
stored agent address). Signatures are never persisted — only the
`signature_verified` stamp is. Expect signatures to become mandatory in a
later release; sign now to be ready.

## Debugging

- **Service logs**: `logs/<service>.log` when started via `start.sh`.
- **On-chain state**: use the read-only helpers in
  `packages/orchestrator/src/agent-vault-client.ts` (`getBalance`,
  `getAvailable`, `getAccount`, `get_task` via `getTask`-style calls) or query
  directly with the Stellar CLI / `stellar.expert` testnet explorer using the
  contract ID and account addresses from `.env`.
- **WebSocket events**: the orchestrator emits a typed event stream
  (`task_started`, `step_started`, `step_complete`, `step_failed`,
  `budget_released`, `task_complete`) over `/ws`, connect with `wscat` or the
  dashboard's network tab to watch a task execute in real time.
- **Vault ledger / activity log / task results**: inspect
  `data/vault-ledger.json`, `data/activity-log.json`, and
  `data/task-results.json` directly for a record of what the orchestrator has
  done. Better: run `npm run reconcile` first — it cross-checks the three
  stores and names any drift (see [reconciliation](reconciliation.md)).

### Tracing a request

Every service mints or echoes an `X-Request-Id` on each REST response and
writes one structured access line per request (method, path, status,
duration, request id). To follow a task across services:

```bash
# Pass your own id and grep it across all service logs
curl -H 'X-Request-Id: demo-1' -X POST http://localhost:3000/api/tasks/preview \
  -H 'Content-Type: application/json' -d '{"prompt":"...","budget":1.0}'
grep -h 'demo-1' logs/*.log
```

The orchestrator forwards the caller's id to the registry, so the same id
appears in both logs. Background execution has no inbound request — there
the `task_id` (WS events, activity log) is the correlation id. Services log
human-readable lines locally and single-line JSON when
`NODE_ENV=production`.

## Getting help

### Rotating service keys

`setup-wallets.ts` prints six `*_SECRET_KEY` values (one per service) and
writes `wallets.json`; both live alongside `.env` with owner-only
permissions, and the registry/orchestrator warn on boot when any of them is
group/world-readable. If a key leaks, rotate it — one service at a time, so
the rest of the stack keeps running:

1. Generate a replacement Stellar testnet keypair (a fresh
   `setup-wallets.ts` run is fine — keep only the line you need).
2. Give it a USDC trustline and a small XLM float for fees
   (`add-usdc-trustlines.ts` covers trustlines; Friendbot covers XLM).
3. If the agent spends externally (oracle/xlm402 calls), move it a small
   USDC float with `distribute-usdc.ts` logic.
4. Update the **one** service's env — local `.env` and the matching Render
   dashboard entry — and restart only that service.
5. Verify: its `/health` is green, the registry lists it under the new
   `stellar_address`, and `POST /api/tasks/preview` still returns feasible.
6. Drain the old wallet and abandon it; never reuse a rotated-out secret.

Two keys are special:

- **`ORCHESTRATOR_SECRET_KEY`** is the AgentVault admin and holds the bulk
  USDC. After steps 1–4, transfer admin on-chain before decommissioning the
  old wallet:
  `stellar contract invoke --id $AGENT_VAULT_CONTRACT_ID --network testnet
  --source $OLD_ORCH_SEC -- update_admin --new_admin $NEW_ORCH_PUB`
  (confirm the exact entry name against the deployed vault version first).
  Rotating the orchestrator does **not** change `AGENT_VAULT_CONTRACT_ID`.
- **Per-user orchestrator secrets** in `data/orchestrators.json` belong to
  individual demo users. Rotate only with no active tasks for that user (or
  after they withdraw): delete the record, have them re-register, and they
  get a fresh keypair.

Until secrets move to a KMS/vault (roadmap P2-3), treat every `*_SECRET_KEY`
as a password: 0600 files, never in git, never in chat logs, never in
`logs/` (services never log secrets — keep it that way).

Open an issue (use the bug report or contributor issue template), or email
the maintainer at joshuaibitoye111@gmail.com for anything sensitive, see
[SECURITY.md](../SECURITY.md) for vulnerability reports specifically.
