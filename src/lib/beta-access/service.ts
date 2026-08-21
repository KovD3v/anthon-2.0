import { prisma } from "@/lib/db";
import { BETA_ACCESS_CONFIG_ID } from "./constants";
import { signBetaAccessCookie, verifyBetaAccessCookie } from "./cookie";
import { hashBetaPassword, verifyBetaPassword } from "./password";

export type BetaAccessConfigState =
  | { configured: false; active: false }
  | {
      configured: true;
      active: boolean;
      accessVersion: number;
      passwordDigest: string;
      activatedAt: Date;
      rotatedAt: Date;
    };

export type BetaAccessConfigSummary = {
  configured: true;
  active: boolean;
  accessVersion: number;
  activatedAt: Date;
  rotatedAt: Date;
};

type PersistedConfigSummary = Omit<
  BetaAccessConfigSummary,
  "configured" | "active"
> & { enabled: boolean };

function summarizeConfig(
  config: PersistedConfigSummary,
): BetaAccessConfigSummary {
  const { enabled, ...fields } = config;
  return { configured: true, active: enabled, ...fields };
}

export async function loadBetaAccessConfig(): Promise<BetaAccessConfigState> {
  const config = await prisma.betaAccessConfig.findUnique({
    where: { id: BETA_ACCESS_CONFIG_ID },
    select: {
      enabled: true,
      accessVersion: true,
      passwordDigest: true,
      activatedAt: true,
      rotatedAt: true,
    },
  });
  if (!config) return { configured: false, active: false };
  const { enabled, ...fields } = config;
  return { configured: true, active: enabled, ...fields };
}

export function getBetaAccessCookieSecret(): string | null {
  const secret = process.env.BETA_ACCESS_COOKIE_SECRET?.trim();
  return secret && secret.length >= 32 ? secret : null;
}

export function isCurrentBetaAccessCookie(
  value: string | null,
  accessVersion: number,
  options: { secret: string; now?: Date },
): boolean {
  if (!value) return false;
  const credential = verifyBetaAccessCookie(value, options);
  return credential?.configVersion === accessVersion;
}

export async function unlockBetaAccess(
  password: string,
  options: { secret: string; now?: Date },
): Promise<
  | { status: "inactive" }
  | { status: "invalid" }
  | { status: "ok"; accessVersion: number; cookieValue: string }
> {
  const config = await loadBetaAccessConfig();
  if (!config.active) return { status: "inactive" };

  const valid = await verifyBetaPassword(password, config.passwordDigest);
  if (!valid) return { status: "invalid" };

  return {
    status: "ok",
    accessVersion: config.accessVersion,
    cookieValue: signBetaAccessCookie({
      configVersion: config.accessVersion,
      secret: options.secret,
      now: options.now,
    }),
  };
}

export async function rotateBetaAccessPassword(
  password: string,
  actorUserId: string,
  now = new Date(),
): Promise<BetaAccessConfigSummary> {
  const passwordDigest = await hashBetaPassword(password);
  const config = await prisma.$transaction((tx) =>
    tx.betaAccessConfig.upsert({
      where: { id: BETA_ACCESS_CONFIG_ID },
      create: {
        id: BETA_ACCESS_CONFIG_ID,
        enabled: true,
        passwordDigest,
        accessVersion: 1,
        activatedAt: now,
        rotatedAt: now,
        updatedByUserId: actorUserId,
      },
      update: {
        passwordDigest,
        accessVersion: { increment: 1 },
        rotatedAt: now,
        updatedByUserId: actorUserId,
      },
      select: {
        enabled: true,
        accessVersion: true,
        activatedAt: true,
        rotatedAt: true,
      },
    }),
  );

  return summarizeConfig(config);
}

export async function setBetaAccessEnabled(
  active: boolean,
  actorUserId: string,
): Promise<
  { status: "unconfigured" } | { status: "ok"; config: BetaAccessConfigSummary }
> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.betaAccessConfig.findUnique({
      where: { id: BETA_ACCESS_CONFIG_ID },
      select: {
        enabled: true,
        accessVersion: true,
        activatedAt: true,
        rotatedAt: true,
      },
    });
    if (!current) return { status: "unconfigured" } as const;
    if (current.enabled === active) {
      return { status: "ok", config: summarizeConfig(current) } as const;
    }

    const config = await tx.betaAccessConfig.update({
      where: { id: BETA_ACCESS_CONFIG_ID },
      data: {
        enabled: active,
        ...(active ? {} : { accessVersion: { increment: 1 } }),
        updatedByUserId: actorUserId,
      },
      select: {
        enabled: true,
        accessVersion: true,
        activatedAt: true,
        rotatedAt: true,
      },
    });
    return { status: "ok", config: summarizeConfig(config) } as const;
  });
}
