import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { AgentRecord } from '@agentpay/common';

let dir: string;

function makeAgent(id: string): AgentRecord {
  const now = new Date().toISOString();
  return {
    agent_id: id,
    name: `Agent ${id}`,
    description: 'durability test agent',
    capabilities: ['test'],
    pricing: { model: 'x402', price_per_call: 0.01, currency: 'USDC' },
    endpoint: `https://agents.example.com/${id}`,
    stellar_address: 'GABC123',
    health_check: `https://agents.example.com/${id}/health`,
    registered_at: now,
    last_seen: now,
    status: 'active',
    reputation: {
      score: 50,
      total_jobs: 0,
      successful_jobs: 0,
      failed_jobs: 0,
      avg_quality: 0,
      avg_latency_ms: 0,
      last_updated: now,
    },
  };
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-durability-'));
  process.env.AGENTPAY_DATA_DIR = dir;
  vi.resetModules();
});

afterEach(() => {
  delete process.env.AGENTPAY_DATA_DIR;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('registry store durability', () => {
  it('a burst of concurrent upserts loses zero updates', async () => {
    const store = await import('./store.js');
    const N = 200;
    // Fire without awaiting — every upsert mutates the shared cache
    // synchronously and queues its disk write behind the others.
    for (let i = 0; i < N; i++) {
      store.upsertAgent(makeAgent(`storm-agent-${i}`));
    }
    await store.flushWrites();

    const onDisk = JSON.parse(
      fs.readFileSync(path.join(dir, 'registry.json'), 'utf8'),
    ) as AgentRecord[];
    expect(onDisk).toHaveLength(N);
    const ids = new Set(onDisk.map((a) => a.agent_id));
    expect(ids.size).toBe(N);
  });

  it('a truncated store file fails safe and recovers on next write', async () => {
    fs.writeFileSync(path.join(dir, 'registry.json'), '{"agents": [broken');
    fs.writeFileSync(path.join(dir, 'registry.json.tmp'), 'partial-write');

    const store = await import('./store.js');
    expect(store.loadAgents()).toEqual([]);

    store.upsertAgent(makeAgent('recovered-agent'));
    await store.flushWrites();

    const onDisk = JSON.parse(
      fs.readFileSync(path.join(dir, 'registry.json'), 'utf8'),
    ) as AgentRecord[];
    expect(onDisk.map((a) => a.agent_id)).toEqual(['recovered-agent']);
  });
});
