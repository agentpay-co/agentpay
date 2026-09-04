import { describe, it, expect } from 'vitest';
import { agentsListStatus, submitFailureMessage, vaultBanner } from './status-messages.js';

describe('agentsListStatus', () => {
  it('returns null while loading or when healthy', () => {
    expect(
      agentsListStatus({ loading: true, loadError: true, agentCount: 0, usingMock: false }),
    ).toBeNull();
    expect(
      agentsListStatus({ loading: false, loadError: false, agentCount: 5, usingMock: false }),
    ).toBeNull();
  });

  it('explains mock data as non-hirable', () => {
    const notice = agentsListStatus({
      loading: false,
      loadError: false,
      agentCount: 6,
      usingMock: true,
    });
    expect(notice?.kind).toBe('mock');
    expect(notice?.body).toMatch(/cannot be hired/i);
  });

  it('names a backend failure with a retry action', () => {
    const notice = agentsListStatus({
      loading: false,
      loadError: true,
      agentCount: 0,
      usingMock: false,
    });
    expect(notice?.kind).toBe('backend-error');
    expect(notice?.action).toBe('Retry');
    expect(notice?.body).toMatch(/funds are unaffected/i);
  });

  it('distinguishes an empty registry from an outage', () => {
    const notice = agentsListStatus({
      loading: false,
      loadError: false,
      agentCount: 0,
      usingMock: false,
    });
    expect(notice?.kind).toBe('empty');
    expect(notice?.body).toMatch(/reachable but empty/i);
  });
});

describe('submitFailureMessage', () => {
  it('maps every known backend code to specific copy', () => {
    expect(submitFailureMessage('insufficient_vault_balance').title).toMatch(/insufficient/i);
    expect(submitFailureMessage('no_agents').body).toMatch(/no active agents/i);
    expect(submitFailureMessage('registry_unavailable').title).toMatch(/unreachable/i);
    expect(submitFailureMessage('infeasible').title).toMatch(/infeasible/i);
    expect(submitFailureMessage('backend-offline').title).toMatch(/offline/i);
  });

  it('falls back to honest generic copy for unknown failures', () => {
    const fallback = submitFailureMessage(undefined);
    expect(fallback.title).toMatch(/submission failed/i);
    expect(fallback.body).toMatch(/check that it is running/i);
  });
});

describe('vaultBanner', () => {
  it('returns null when a vault is configured', () => {
    expect(vaultBanner('CABC123')).toBeNull();
  });

  it('explains zero balances when unconfigured', () => {
    const notice = vaultBanner('');
    expect(notice?.title).toMatch(/not configured/i);
    expect(notice?.body).toMatch(/deploy\.sh/);
  });
});
