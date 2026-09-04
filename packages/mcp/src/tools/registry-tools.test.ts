import { describe, it, expect, vi, afterEach } from 'vitest';
import { searchAgentsHandler } from './search-agents.js';
import { getAgentHandler } from './get-agent.js';
import { estimateCostHandler } from './estimate-cost.js';

const config = { registry_url: 'http://127.0.0.1:4000' };

afterEach(() => {
  vi.restoreAllMocks();
});

function parseError(result: { content: Array<{ type: string; text: string }> }) {
  return JSON.parse(result.content[0].text) as { error: Record<string, unknown> };
}

function mockAgent() {
  return {
    agent_id: 'a-1',
    name: 'A',
    description: 'd',
    capabilities: ['x'],
    pricing: { model: 'x402', price_per_call: 0.02, currency: 'USDC' },
    endpoint: 'https://example.com',
    stellar_address: 'GABC',
    health_check: 'https://example.com/health',
    status: 'active',
    reputation: {
      score: 80,
      total_jobs: 10,
      successful_jobs: 9,
      failed_jobs: 1,
      avg_quality: 4.5,
      avg_latency_ms: 100,
      last_updated: '2026-01-01T00:00:00.000Z',
    },
  };
}

describe('registry tool errors (registry mocked)', () => {
  it('search_agents rejects invalid params without retry', async () => {
    const result = await searchAgentsHandler({ capability: '' }, config);
    const parsed = parseError(result);
    expect(parsed.error).toMatchObject({ code: 'INVALID_PARAMS', retryable: false });
  });

  it('search_agents maps connection failure to retryable REGISTRY_UNREACHABLE', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new TypeError('fetch failed'));
    const result = await searchAgentsHandler({ capability: 'x' }, config);
    const parsed = parseError(result);
    expect(parsed.error).toMatchObject({ code: 'REGISTRY_UNREACHABLE', retryable: true });
  });

  it('search_agents marks 5xx retryable and 4xx not', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response('err', { status: 500, statusText: 'Server Error' }),
    );
    expect(parseError(await searchAgentsHandler({ capability: 'x' }, config)).error).toMatchObject({
      code: 'REGISTRY_ERROR',
      retryable: true,
    });

    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response('err', { status: 400, statusText: 'Bad Request' }),
    );
    expect(parseError(await searchAgentsHandler({ capability: 'x' }, config)).error).toMatchObject({
      code: 'REGISTRY_ERROR',
      retryable: false,
    });
  });

  it('search_agents parses a successful envelope', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      Response.json({ agents: [mockAgent()], total: 1, limit: 10, offset: 0 }),
    );
    const result = await searchAgentsHandler({ capability: 'x' }, config);
    const parsed = JSON.parse(result.content[0].text) as { results_count: number };
    expect(parsed.results_count).toBe(1);
  });

  it('get_agent keeps the found:false shape on 404', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('no', { status: 404 }));
    const result = await getAgentHandler({ id: 'missing' }, config);
    expect(JSON.parse(result.content[0].text)).toMatchObject({ found: false });
  });

  it('get_agent maps unreachable registry to retryable error', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new TypeError('fetch failed'));
    const parsed = parseError(await getAgentHandler({ id: 'a-1' }, config));
    expect(parsed.error).toMatchObject({ code: 'REGISTRY_UNREACHABLE', retryable: true });
  });

  it('estimate_cost rejects invalid params without retry', async () => {
    const parsed = parseError(await estimateCostHandler({}, config));
    expect(parsed.error).toMatchObject({ code: 'INVALID_PARAMS', retryable: false });
  });
});
