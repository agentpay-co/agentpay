/**
 * Shared MCP tool plumbing: structured errors and timeouts.
 *
 * Every tool reports failures as `{ error: { tool, code, message, retryable } }`
 * content instead of ad-hoc strings, so clients can decide whether to retry
 * without parsing prose. Network calls use `fetchWithTimeout` (registry) or
 * `withRpcTimeout` (Soroban RPC, which takes no abort signal).
 */

export type McpErrorCode =
  | 'INVALID_PARAMS'
  | 'NOT_CONFIGURED'
  | 'REGISTRY_UNREACHABLE'
  | 'REGISTRY_ERROR'
  | 'RPC_UNREACHABLE'
  | 'RPC_TIMEOUT'
  | 'CONTRACT_ERROR'
  | 'REQUEST_TIMEOUT';

export class McpToolError extends Error {
  readonly code: McpErrorCode;
  readonly retryable: boolean;

  constructor(code: McpErrorCode, message: string, retryable = false) {
    super(message);
    this.name = 'McpToolError';
    this.code = code;
    this.retryable = retryable;
  }
}

export interface ToolContent {
  content: Array<{ type: string; text: string }>;
}

/** Wrap a tool failure as structured MCP content. */
export function toErrorContent(
  tool: string,
  error: unknown,
  context: Record<string, unknown> = {},
): ToolContent {
  if (error instanceof McpToolError) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              error: {
                tool,
                code: error.code,
                message: error.message,
                retryable: error.retryable,
                ...context,
              },
            },
            null,
            2,
          ),
        },
      ],
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          { error: { tool, code: 'CONTRACT_ERROR', message, retryable: false, ...context } },
          null,
          2,
        ),
      },
    ],
  };
}

/** Request timeout in ms; override with MCP_REQUEST_TIMEOUT_MS (min 100ms). */
export function requestTimeoutMs(): number {
  const raw = Number(process.env.MCP_REQUEST_TIMEOUT_MS);
  if (Number.isFinite(raw)) return Math.max(100, Math.floor(raw));
  return 10_000;
}

/**
 * fetch() that fails with McpToolError REQUEST_TIMEOUT (retryable) instead
 * of hanging forever. Network-level failures surface as the caller's error
 * to classify (registry tools map them to REGISTRY_UNREACHABLE).
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = requestTimeoutMs(),
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new McpToolError(
        'REQUEST_TIMEOUT',
        `Request to ${url} timed out after ${timeoutMs}ms`,
        true,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Race a signal-less promise (Soroban RPC calls) against a timeout.
 * Times out as McpToolError RPC_TIMEOUT (retryable).
 */
export async function withRpcTimeout<T>(
  promise: Promise<T>,
  operation: string,
  timeoutMs: number = requestTimeoutMs(),
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () =>
        reject(
          new McpToolError('RPC_TIMEOUT', `${operation} timed out after ${timeoutMs}ms`, true),
        ),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}

/** True for transport-level fetch failures (connection refused, DNS, ...). */
export function isNetworkError(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    (error instanceof Error &&
      /fetch failed|network|ECONNREFUSED|ENOTFOUND|aborted/i.test(error.message))
  );
}
