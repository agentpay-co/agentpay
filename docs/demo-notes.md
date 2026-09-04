# Demo Notes (live run record)

Copy this template per live demo run. The mock rehearsal (`npm run
demo-check`) needs none of this; the funded run must fill every row before
it counts as the roadmap "demo-or-die" exit.

## Run metadata

| Field | Value |
|---|---|
| Date | |
| Operator | |
| Orchestrator URL | |
| Registry URL | |
| AgentVault contract | |
| Vault deploy TX | |
| `demo-check` exit code | |

## Fund flow TXs (Stellar Testnet explorer links)

| Step | TX hash | Explorer link |
|---|---|---|
| Orchestrator registration (`register_orchestrator`) | | |
| User deposit | | |
| Task 1 `create_task` (locks budget) | | |
| Task 1 step payment(s) (`release_payment`) | | |
| Task 1 `complete_task` (refund) | | |
| Task 2 `create_task` | | |
| Task 2 step payment(s) | | |
| Task 2 `complete_task` (refund) | | |
| Task 3 `create_task` | | |
| Task 3 step payment(s) | | |
| Task 3 `complete_task` (refund) | | |
| Withdrawal (remainder) | | |

## Per-task ledger

| # | Prompt | Budget (USDC) | Actual cost (USDC) | Refunded (USDC) | Result |
|---|---|---|---|---|---|
| 1 | What is the current price of XLM in USD? | 0.50 | | | |
| 2 | Get the latest blockchain news headlines. | 0.50 | | | |
| 3 | Fetch the latest blockchain news and analyse the overall sentiment. | 1.00 | | | |

## Reputation seeding

| Item | Value |
|---|---|
| `bootstrap --auto-approve` run at | |
| Consecutive clean runs (live + mock) | / 2 |

## Sign-off

- [ ] All three tasks reached `task_complete` on WS
- [ ] Every TX above links to a confirmed testnet transaction
- [ ] Refunded remainder matches budget minus cost per task
- [ ] `npm run reconcile` exits 0 after the run
- [ ] No `clevercon`/old-address traces in any shown URL or log
