/**
 * Public entrypoint for programmatic reuse of the AgentPay MCP tools.
 *
 * The stdio server remains `dist/server.js`; import from here to embed
 * individual tools, schemas, or the error taxonomy in another process.
 */
export { searchAgentsHandler, searchAgentsSchema } from './tools/search-agents.js';
export { getAgentHandler, getAgentSchema } from './tools/get-agent.js';
export { getVaultBalanceHandler, getVaultBalanceSchema } from './tools/get-vault-balance.js';
export { buildDepositHandler, buildDepositSchema } from './tools/build-deposit.js';
export { buildReleaseHandler, buildReleaseSchema } from './tools/build-release.js';
export { estimateCostHandler, estimateCostSchema } from './tools/estimate-cost.js';
export {
  McpToolError,
  fetchWithTimeout,
  withRpcTimeout,
  toErrorContent,
  requestTimeoutMs,
  isNetworkError,
  type McpErrorCode,
  type ToolContent,
} from './tool-error.js';
