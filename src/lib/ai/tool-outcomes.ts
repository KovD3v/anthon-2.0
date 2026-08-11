export type ToolOutcomeSummary = {
  considered: number;
  allowed: number;
  called: number;
  succeeded: number;
  useful: number;
  utilized: number;
};

function usefulResult(result: unknown) {
  if (!result || typeof result !== "object") return false;
  const value = result as Record<string, unknown>;
  if (
    value.success === false ||
    ["unavailable", "not_found", "not_allowed", "rejected"].includes(
      String(value.status),
    )
  )
    return false;
  if (
    value.success === true ||
    ["ok", "saved", "indexed", "presented"].includes(String(value.status))
  )
    return true;
  return Object.values(value).some(
    (item) => Array.isArray(item) && item.length > 0,
  );
}

export class ToolOutcomeTracker {
  private readonly consideredNames: Set<string>;
  private readonly allowedNames = new Set<string>();
  private readonly calledNames = new Set<string>();
  private readonly succeededNames = new Set<string>();
  private readonly usefulNames = new Set<string>();
  private readonly utilizedNames = new Set<string>();

  constructor(considered: Iterable<string>) {
    this.consideredNames = new Set(considered);
  }
  allowed(name: string) {
    if (this.consideredNames.has(name)) this.allowedNames.add(name);
  }
  called(name: string) {
    if (this.allowedNames.has(name)) this.calledNames.add(name);
  }
  completed(name: string, result: unknown) {
    if (!this.calledNames.has(name)) return;
    this.succeededNames.add(name);
    if (usefulResult(result)) this.usefulNames.add(name);
  }
  utilized(name: string) {
    if (this.usefulNames.has(name)) this.utilizedNames.add(name);
  }
  summary(): ToolOutcomeSummary {
    return {
      considered: this.consideredNames.size,
      allowed: this.allowedNames.size,
      called: this.calledNames.size,
      succeeded: this.succeededNames.size,
      useful: this.usefulNames.size,
      utilized: this.utilizedNames.size,
    };
  }
}
