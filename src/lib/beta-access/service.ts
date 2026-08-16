import { prisma } from "@/lib/db";
import { BETA_ACCESS_CONFIG_ID } from "./constants";
import { signBetaAccessCookie, verifyBetaAccessCookie } from "./cookie";
import { hashBetaPassword, verifyBetaPassword } from "./password";

export type BetaAccessConfigState =
  | { active: false }
  | {
      active: true;
      accessVersion: number;
      passwordDigest: string;
      activatedAt: Date;
      rotatedAt: Date;
    };

export async function loadBetaAccessConfig(): Promise<BetaAccessConfigState> {
  const config = await prisma.betaAccessConfig.findUnique({
    where: { id: BETA_ACCESS_CONFIG_ID },
    select: {
      accessVersion: true,
      passwordDigest: true,
      activatedAt: true,
      rotatedAt: true,
    },
  });
  if (!config) return { active: false };
  return { active: true, ...config };
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
): Promise<{
  active: true;
  accessVersion: number;
  activatedAt: Date;
  rotatedAt: Date;
}> {
  const passwordDigest = await hashBetaPassword(password);
  const config = await prisma.$transaction((tx) =>
    tx.betaAccessConfig.upsert({
      where: { id: BETA_ACCESS_CONFIG_ID },
      create: {
        id: BETA_ACCESS_CONFIG_ID,
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
        accessVersion: true,
        activatedAt: true,
        rotatedAt: true,
      },
    }),
  );

  return { active: true, ...config };
}
