export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogContext {
  service?: string;
  requestId?: string;
  [key: string]: unknown;
}

function isJsonMode(): boolean {
  return process.env.NODE_ENV === 'production';
}

function format(level: LogLevel, message: string, context: LogContext, data?: unknown): string {
  if (!isJsonMode()) {
    const bits = [serviceTag(context.service), requestTag(context.requestId)]
      .filter(Boolean)
      .join(' ');
    return bits
      ? `[${new Date().toISOString()}] [${level.toUpperCase()}] ${bits} ${message}`
      : `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}`;
  }
  const record: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    msg: message,
  };
  if (context.service !== undefined) record.service = context.service;
  if (context.requestId !== undefined) record.requestId = context.requestId;
  for (const [key, value] of Object.entries(context)) {
    if (key !== 'service' && key !== 'requestId') record[key] = value;
  }
  if (data !== undefined) record.data = data;
  return JSON.stringify(record);
}

function serviceTag(service?: string): string {
  return service ? `[${service}]` : '';
}

function requestTag(requestId?: string): string {
  return requestId ? `[req ${requestId}]` : '';
}

function emit(level: LogLevel, context: LogContext, message: string, data?: unknown) {
  const line = format(level, message, context, data);
  if (isJsonMode() || data === undefined) {
    console.log(line);
  } else {
    console.log(line, data);
  }
}

export interface ScopedLogger {
  info: (msg: string, data?: unknown) => void;
  warn: (msg: string, data?: unknown) => void;
  error: (msg: string, data?: unknown) => void;
  debug: (msg: string, data?: unknown) => void;
  child: (context: LogContext) => ScopedLogger;
}

function makeLogger(context: LogContext = {}): ScopedLogger {
  return {
    info: (msg, data) => emit('info', context, msg, data),
    warn: (msg, data) => emit('warn', context, msg, data),
    error: (msg, data) => emit('error', context, msg, data),
    debug: (msg, data) => emit('debug', context, msg, data),
    child: (extra) => makeLogger({ ...context, ...extra }),
  };
}

/**
 * Shared logger. Human-readable lines locally, single-line JSON when
 * NODE_ENV=production. Use `logger.child({ service, requestId })` to bind
 * context that is attached to every line from that scope.
 */
export const logger: ScopedLogger = makeLogger();
