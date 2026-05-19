import { AsyncLocalStorage } from "node:async_hooks";
import type { LogContext } from "./types";

const contextStorage = new AsyncLocalStorage<LogContext>();

export function getLogContext(): LogContext {
  return contextStorage.getStore() ?? {};
}

export function withLogContext<T>(
  context: LogContext,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  const mergedContext: LogContext = {
    ...getLogContext(),
    ...context,
  };

  return contextStorage.run(mergedContext, fn);
}
