import { createLogger } from "@/lib/logger";

/**
 * Latency Logger - Track performance bottlenecks across the application
 *
 * Usage:
 * const timer = LatencyLogger.start('operation-name');
 * // ... do work ...
 * timer.end();
 *
 * Or use the measure utility:
 * const result = await LatencyLogger.measure('operation-name', async () => {
 *   // ... do work ...
 *   return result;
 * });
 */

interface TimingEntry {
  name: string;
  start: number;
  end?: number;
  duration?: number;
  parent?: string;
}

class LatencyLoggerClass {
  private timings: Map<string, TimingEntry> = new Map();
  private enabled: boolean;
  private logger = createLogger("latency");

  constructor() {
    // Enable by default in development, or when ENABLE_LATENCY_LOGS is true
    this.enabled =
      process.env.NODE_ENV === "development" ||
      process.env.ENABLE_LATENCY_LOGS === "true";
  }

  /**
   * Start timing an operation
   */
  start(
    name: string,
    parent?: string,
  ): { end: () => void; split: (label: string) => void } {
    if (!this.enabled) {
      return { end: () => {}, split: () => {} };
    }

    const start = performance.now();
    const entry: TimingEntry = { name, start, parent };
    this.timings.set(name, entry);

    let lastSplit = start;

    return {
      end: () => {
        const end = performance.now();
        const duration = end - start;
        entry.end = end;
        entry.duration = duration;

        this.log(name, duration, parent);
      },
      split: (label: string) => {
        const now = performance.now();
        const splitDuration = now - lastSplit;
        this.log(`${name} → ${label}`, splitDuration, name);
        lastSplit = now;
      },
    };
  }

  /**
   * Measure an async operation
   */
  async measure<T>(
    name: string,
    fn: () => Promise<T>,
    parent?: string,
  ): Promise<T> {
    const timer = this.start(name, parent);
    try {
      const result = await fn();
      timer.end();
      return result;
    } catch (error) {
      timer.end();
      throw error;
    }
  }

  /**
   * Measure a sync operation
   */
  measureSync<T>(name: string, fn: () => T, parent?: string): T {
    const timer = this.start(name, parent);
    try {
      const result = fn();
      timer.end();
      return result;
    } catch (error) {
      timer.end();
      throw error;
    }
  }

  /**
   * Log timing with color coding based on duration
   */
  private log(name: string, duration: number, parent?: string) {
    if (!this.enabled) return;

    const indent = parent ? "  " : "";
    const emoji = this.getEmojiForDuration(duration);
    const _color = this.getColorForDuration(duration);
    const formattedDuration = this.formatDuration(duration);

    this.logger.info("latency.measure", "Latency measurement", {
      line: `${indent}⏱️  ${emoji} [${name}] ${formattedDuration}`,
      name,
      parent,
      durationMs: duration,
    });
  }

  /**
   * Get emoji based on duration
   */
  private getEmojiForDuration(ms: number): string {
    if (ms < 50) return "🟢"; // Fast
    if (ms < 200) return "🟡"; // Moderate
    if (ms < 1000) return "🟠"; // Slow
    return "🔴"; // Very slow
  }

  /**
   * Get color code for duration (for future terminal coloring)
   */
  private getColorForDuration(ms: number): string {
    if (ms < 50) return "green";
    if (ms < 200) return "yellow";
    if (ms < 1000) return "orange";
    return "red";
  }

  /**
   * Format duration nicely
   */
  private formatDuration(ms: number): string {
    if (ms < 1) return `${ms.toFixed(2)}ms`;
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }

  /**
   * Get all timings (for debugging)
   */
  getAllTimings() {
    return Array.from(this.timings.values());
  }

  /**
   * Print a summary of all timings
   */
  printSummary(label: string = "Request") {
    if (!this.enabled) return;

    const timings = this.getAllTimings().filter(
      (t) => t.duration !== undefined,
    );
    if (timings.length === 0) return;

    const total = timings.reduce((sum, t) => sum + (t.duration || 0), 0);

    this.logger.info("latency.summary.start", "Latency summary started", {
      line: `\n📊 ${label} Summary - Total: ${this.formatDuration(total)}`,
      label,
      totalDurationMs: total,
    });
    this.logger.info("latency.summary.separator", "Latency summary separator", {
      line: "─".repeat(60),
    });

    // Sort by duration descending
    const sorted = [...timings].sort(
      (a, b) => (b.duration || 0) - (a.duration || 0),
    );

    sorted.forEach((t) => {
      const percentage = (((t.duration || 0) / total) * 100).toFixed(1);
      const bar = "█".repeat(
        Math.min(20, Math.floor(((t.duration || 0) / total) * 20)),
      );
      this.logger.info("latency.summary.row", "Latency summary row", {
        line: `${this.getEmojiForDuration(t.duration || 0)} ${t.name.padEnd(
          30,
        )} ${this.formatDuration(t.duration || 0).padStart(
          8,
        )} (${percentage}%) ${bar}`,
        operation: t.name,
        durationMs: t.duration || 0,
        percentage,
      });
    });

    this.logger.info("latency.summary.end", "Latency summary completed", {
      line: `${"─".repeat(60)}\n`,
      label,
      totalDurationMs: total,
    });
  }

  /**
   * Clear all timings
   */
  clear() {
    this.timings.clear();
  }

  /**
   * Enable or disable logging
   */
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }
}

// Singleton instance
export const LatencyLogger = new LatencyLoggerClass();
