export type PlanResolutionErrorReason = "ACTIVE_WITH_INVALID_PLAN_ID";

export class PlanResolutionError extends Error {
  readonly code = "PLAN_RESOLUTION_ERROR";
  readonly reason: PlanResolutionErrorReason;

  constructor(reason: PlanResolutionErrorReason, message?: string) {
    super(message ?? reason);
    this.name = "PlanResolutionError";
    this.reason = reason;
  }
}
