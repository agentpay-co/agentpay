/**
 * User-facing copy for every degraded mode of the dashboard.
 *
 * Pure mappers (no React) so the wording is unit-tested: each failure shows
 * an honest message with a next action, never a hang or a silent wrong
 * number. Components decide *where* to render; this file decides *what*.
 */

export interface StatusNotice {
  kind: 'mock' | 'backend-error' | 'empty';
  title: string;
  body: string;
  action: string;
}

/** Banner state for the agents list. Returns null when the list is healthy. */
export function agentsListStatus(input: {
  loading: boolean;
  loadError: boolean;
  agentCount: number;
  usingMock: boolean;
}): StatusNotice | null {
  if (input.loading) return null;
  if (input.usingMock) {
    return {
      kind: 'mock',
      title: 'Sample data.',
      body: 'These are example services showing what can register on AgentPay. They are not live and cannot be hired yet: the registry backend is offline in this demo.',
      action: 'Start the stack to see live agents',
    };
  }
  if (input.loadError) {
    return {
      kind: 'backend-error',
      title: "Couldn't reach the backend.",
      body: 'The orchestrator or registry is down, so this list may be stale or empty. Your funds are unaffected — they live in the on-chain vault, not here.',
      action: 'Retry',
    };
  }
  if (input.agentCount === 0) {
    return {
      kind: 'empty',
      title: 'No agents registered yet.',
      body: 'The registry is reachable but empty. Start the reference agents (they self-register on boot) or register your own service.',
      action: 'Retry',
    };
  }
  return null;
}

export interface SubmitFailure {
  title: string;
  body: string;
}

/** Map a task-submit failure to toast copy. `code` is the backend `error` field. */
export function submitFailureMessage(code: string | undefined, detail?: string): SubmitFailure {
  switch (code) {
    case 'insufficient_vault_balance':
      return {
        title: 'Insufficient vault balance.',
        body: 'Deposit more USDC into AgentVault — the plan costs more than is available.',
      };
    case 'no_agents':
      return {
        title: 'No agents available.',
        body: 'The registry has no active agents right now. Start the reference services and try again.',
      };
    case 'registry_unavailable':
      return {
        title: 'Registry is unreachable.',
        body: 'The orchestrator cannot reach the registry. Check that it is running and retry.',
      };
    case 'infeasible':
      return {
        title: 'Task looks infeasible.',
        body:
          detail ??
          'No registered agent covers what this task needs. Try rephrasing or narrowing the request.',
      };
    case 'backend-offline':
      return {
        title: 'Agent is offline.',
        body: "Your agent can't take on tasks right now. Please try again a little later.",
      };
    default:
      return {
        title: 'Task submission failed.',
        body: detail ?? 'The backend did not accept the task. Check that it is running and retry.',
      };
  }
}

/** Banner for the vault panel when no vault contract is configured. */
export function vaultBanner(vaultContractId: string): StatusNotice | null {
  if (vaultContractId && vaultContractId.length > 0) return null;
  return {
    kind: 'empty',
    title: 'Vault not configured.',
    body: 'No AgentVault contract is set for this deployment, so balances read zero. Deploy one with: cd contracts/agent-vault && ./deploy.sh — then set the contract id and rebuild.',
    action: 'Learn more in docs',
  };
}
