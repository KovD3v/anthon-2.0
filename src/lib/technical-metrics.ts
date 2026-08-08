import type { UserRole } from "@/generated/prisma";

export function getDefaultTechnicalMetricsPreference(role: UserRole): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

export function resolveTechnicalMetricsVisibility(input: {
  role: UserRole;
  preference: boolean | null | undefined;
  isGuest: boolean;
  isPrivateOwner: boolean;
}): boolean {
  if (input.isGuest || !input.isPrivateOwner) {
    return false;
  }

  return input.preference ?? getDefaultTechnicalMetricsPreference(input.role);
}
