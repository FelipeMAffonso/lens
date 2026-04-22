// F17 — structured JSON-line logger. One event per call. Every line is machine-parseable.
//
// Pattern: console methods produce `{level, ts, msg, ...tags}` strings. Cloudflare
// Workers Logs (the platform feature formerly known as Logpush) captures stdout and
// indexes any top-level JSON keys automatically.

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogAttrs {
  runId?: string;
  nodeId?: string;
  workflowId?: string;
  userId?: string | null;
  anonUserId?: string | null;
  traceId?: string;
  spanId?: string;
  durationMs?: number;
  err?: { message: string; name?: string; stack?: string };
  [k: string]: unknown;
}

export function log(level: LogLevel, msg: string, attrs: LogAttrs = {}): void {
  const line = { level, ts: new Date().toISOString(), msg, ...attrs };
  const text = JSON.stringify(line);
  if (level === "error") console.error(text);
  else if (level === "warn") console.warn(text);
  else if (level === "debug") console.debug(text);
  else console.log(text);
}

export const logger = {
  debug: (msg: string, attrs?: LogAttrs): void => log("debug", msg, attrs ?? {}),
  info: (msg: string, attrs?: LogAttrs): void => log("info", msg, attrs ?? {}),
  warn: (msg: string, attrs?: LogAttrs): void => log("warn", msg, attrs ?? {}),
  error: (msg: string, attrs?: LogAttrs): void => log("error", msg, attrs ?? {}),
};

/** Tag-bind: returns a logger that stamps every call with the provided defaults. */
export function withTags(defaults: LogAttrs): typeof logger {
  return {
    debug: (msg, attrs) => logger.debug(msg, { ...defaults, ...(attrs ?? {}) }),
    info: (msg, attrs) => logger.info(msg, { ...defaults, ...(attrs ?? {}) }),
    warn: (msg, attrs) => logger.warn(msg, { ...defaults, ...(attrs ?? {}) }),
    error: (msg, attrs) => logger.error(msg, { ...defaults, ...(attrs ?? {}) }),
  };
}
