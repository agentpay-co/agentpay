#!/usr/bin/env node

/**
 * Smoke test for the AgentPay MCP Server.
 *
 * Spawns the built server once, performs the MCP initialize handshake, then
 * exercises tool discovery and two representative tools. Fails non-zero with
 * a summary when the server binary is missing, the handshake breaks, a tool
 * disappears, or any request times out.
 *
 * Requires a prior build: run `npm run build` in packages/mcp first.
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SERVER_PATH = join(__dirname, 'dist', 'server.js');
const REQUEST_TIMEOUT_MS = 15_000;
const EXPECTED_TOOLS = [
  'search_agents',
  'get_agent',
  'get_vault_balance',
  'build_deposit',
  'build_release',
  'estimate_cost',
];

class McpSession {
  constructor() {
    if (!existsSync(SERVER_PATH)) {
      throw new Error(`Server binary missing at ${SERVER_PATH} — run \`npm run build\` first.`);
    }
    this.server = spawn('node', [SERVER_PATH], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.nextId = 1;
    this.pending = new Map();
    this.buffer = '';
    this.stderr = '';
    this.server.stdout.on('data', (data) => this.onData(data.toString()));
    this.server.stderr.on('data', (data) => {
      this.stderr += data.toString();
    });
    this.server.on('exit', (code) => {
      for (const [, { reject }] of this.pending) {
        reject(new Error(`Server exited with code ${code}\nStderr: ${this.stderr}`));
      }
      this.pending.clear();
    });
  }

  onData(chunk) {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      const entry = this.pending.get(message.id);
      if (entry) {
        this.pending.delete(message.id);
        clearTimeout(entry.timer);
        entry.resolve(message);
      }
    }
  }

  request(method, params) {
    const id = this.nextId++;
    const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request ${method} (id ${id}) timed out after ${REQUEST_TIMEOUT_MS}ms`));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      this.server.stdin.write(payload + '\n');
    });
  }

  notify(method, params) {
    this.server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  }

  async close() {
    this.server.stdin.end();
    await new Promise((resolve) => {
      const force = setTimeout(() => {
        this.server.kill('SIGKILL');
        resolve();
      }, 2000);
      this.server.on('close', () => {
        clearTimeout(force);
        resolve();
      });
    });
  }
}

async function initialize(session) {
  const res = await session.request('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'agentpay-smoke-test', version: '1.0.0' },
  });
  if (res.error) throw new Error(`initialize failed: ${JSON.stringify(res.error)}`);
  if (!res.result?.serverInfo) throw new Error('initialize response missing serverInfo');
  console.log(`✅ Handshake with ${res.result.serverInfo.name} ${res.result.serverInfo.version}`);
  session.notify('notifications/initialized', {});
}

async function checkToolListing(session) {
  const res = await session.request('tools/list', {});
  if (res.error) throw new Error(`tools/list failed: ${JSON.stringify(res.error)}`);
  const names = (res.result?.tools || []).map((t) => t.name);
  const missing = EXPECTED_TOOLS.filter((t) => !names.includes(t));
  if (missing.length > 0) throw new Error(`Missing tools: ${missing.join(', ')}`);
  console.log(`✅ All ${EXPECTED_TOOLS.length} tools advertised: ${names.join(', ')}`);
}

function toolText(res) {
  const text = res.result?.content?.[0]?.text;
  if (typeof text !== 'string')
    throw new Error(`Tool response has no text content: ${JSON.stringify(res)}`);
  return JSON.parse(text);
}

async function checkSearchAgents(session) {
  const res = await session.request('tools/call', {
    name: 'search_agents',
    arguments: { capability: 'test-capability' },
  });
  if (res.error) throw new Error(`search_agents transport error: ${JSON.stringify(res.error)}`);
  const body = toolText(res);
  if (body.error) {
    // Registry is down — acceptable offline, but the failure must be structured.
    if (!body.error.code)
      throw new Error(`Unstructured search_agents error: ${JSON.stringify(body)}`);
    console.log(
      `⚠️ search_agents structured offline error (${body.error.code}) — registry unavailable`,
    );
    return;
  }
  if (typeof body.results_count !== 'number') {
    throw new Error(`Unexpected search_agents payload: ${JSON.stringify(body)}`);
  }
  console.log(`✅ search_agents returned ${body.results_count} result(s)`);
}

async function checkEstimateCost(session) {
  const res = await session.request('tools/call', {
    name: 'estimate_cost',
    arguments: { capability: 'data-analysis' },
  });
  if (res.error) throw new Error(`estimate_cost transport error: ${JSON.stringify(res.error)}`);
  const body = toolText(res);
  if (body.error) {
    if (!body.error.code)
      throw new Error(`Unstructured estimate_cost error: ${JSON.stringify(body)}`);
    console.log(
      `⚠️ estimate_cost structured offline error (${body.error.code}) — registry unavailable`,
    );
    return;
  }
  if (typeof body.agents_found !== 'number') {
    throw new Error(`Unexpected estimate_cost payload: ${JSON.stringify(body)}`);
  }
  console.log(`✅ estimate_cost found ${body.agents_found} agent(s)`);
}

async function runTests() {
  console.log('🚀 Running AgentPay MCP Server smoke tests...\n');
  const session = new McpSession();
  try {
    await initialize(session);
    await checkToolListing(session);
    await checkSearchAgents(session);
    await checkEstimateCost(session);
  } finally {
    await session.close();
  }
  console.log('\n🎉 Smoke tests passed! MCP server is working correctly.');
}

runTests().then(
  () => process.exit(0),
  (error) => {
    console.error(`\n❌ Smoke test failed: ${error.message}`);
    process.exit(1);
  },
);
