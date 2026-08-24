export type PlanResolutionErrorReason =
  | "ACTIVE_WITH_INVALID_PLAN_ID"
  | "PAID_ACCESS_REQUIRED";

export class PlanResolutionError extends Error {
  readonly code = "PLAN_RESOLUTION_ERROR";
  readonly reason: PlanResolutionErrorReason;

  constructor(reason: PlanResolutionErrorReason, message?: string) {
    super(message ?? reason);
    this.name = "PlanResolutionError";
    this.reason = reason;
  }
}
