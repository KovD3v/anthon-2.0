/**
 * Compatibility wrapper for latency instrumentation.
 *
 * Latency logging was removed from the application console. The wrapper stays
 * temporarily so existing callers can be simplified independently.
 */
class LatencyLoggerClass {
  start(
    _name: string,
    _parent?: string,
  ): { end: () => void; split: (label: string) => void } {
    return { end: () => {}, split: () => {} };
  }

  async measure<T>(
    _name: string,
    fn: () => Promise<T>,
    _parent?: string,
  ): Promise<T> {
    return fn();
  }

  measureSync<T>(_name: string, fn: () => T, _parent?: string): T {
    return fn();
  }

  clear() {
    // Kept for API compatibility with existing callers.
  }

  setEnabled(_enabled: boolean) {
    // Latency logging was removed and cannot be re-enabled.
  }
}

// Singleton instance
export const LatencyLogger = new LatencyLoggerClass();
