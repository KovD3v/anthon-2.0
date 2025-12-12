import { auth } from "@clerk/nextjs/server";
import { createHash } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

function hashLinkToken(token: string) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return null;
  return createHash("sha256")
    .update(`tg-link:${secret}:${token}`)
    .digest("hex");
}

export default async function TelegramLinkPage({
  searchParams,
}: {
  searchParams: { token?: string | string[] };
}) {
  const token = Array.isArray(searchParams.token)
    ? searchParams.token[0]
    : searchParams.token;

  if (!token) {
    return (
      <main className="mx-auto max-w-lg p-6">
        <h1 className="text-xl font-semibold">Collegamento Telegram</h1>
        <p className="mt-2 text-sm text-muted-foreground">Link non valido.</p>
      </main>
    );
  }

  const { userId } = await auth();
  if (!userId) {
    redirect(
      `/sign-in?redirect_url=${encodeURIComponent(`/link/telegram?token=${token}`)}`,
    );
  }

  const authResult = await getAuthUser();
  const dbUser = authResult.user;
  if (!dbUser) {
    redirect(
      `/sign-in?redirect_url=${encodeURIComponent(`/link/telegram?token=${token}`)}`,
    );
  }

  const tokenHash = hashLinkToken(token);
  if (!tokenHash) {
    return (
      <main className="mx-auto max-w-lg p-6">
        <h1 className="text-xl font-semibold">Collegamento Telegram</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Configurazione non valida.
        </p>
      </main>
    );
  }

  const outcome = await prisma.$transaction(async (tx) => {
    const linkToken = await tx.channelLinkToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        channel: true,
        externalId: true,
        chatId: true,
        expiresAt: true,
        consumedAt: true,
      },
    });

    if (!linkToken || linkToken.channel !== "TELEGRAM") {
      return { status: "invalid" as const };
    }

    if (linkToken.consumedAt) {
      return { status: "used" as const };
    }

    if (linkToken.expiresAt.getTime() < Date.now()) {
      return { status: "expired" as const };
    }

    const existing = await tx.channelIdentity.findUnique({
      where: {
        channel_externalId: {
          channel: "TELEGRAM",
          externalId: linkToken.externalId,
        },
      },
      select: {
        id: true,
        userId: true,
        user: {
          select: {
            id: true,
            isGuest: true,
          },
        },
      },
    });

    if (existing?.userId && existing.userId !== dbUser.id) {
      if (existing.user?.isGuest) {
        const guestId = existing.userId;

        await tx.message.updateMany({
          where: {
            userId: guestId,
            channel: "TELEGRAM",
          },
          data: {
            userId: dbUser.id,
          },
        });

        await tx.channelIdentity.update({
          where: { id: existing.id },
          data: { userId: dbUser.id },
        });

        await tx.user.update({
          where: { id: guestId },
          data: { guestConvertedAt: new Date() },
        });
      } else {
        return { status: "conflict" as const };
      }
    }

    if (!existing) {
      await tx.channelIdentity.create({
        data: {
          channel: "TELEGRAM",
          externalId: linkToken.externalId,
          userId: dbUser.id,
        },
        select: { id: true },
      });
    }

    await tx.channelLinkToken.update({
      where: { id: linkToken.id },
      data: {
        consumedAt: new Date(),
        consumedByUserId: dbUser.id,
      },
      select: { id: true },
    });

    return { status: "ok" as const };
  });

  if (outcome.status === "conflict") {
    return (
      <main className="mx-auto max-w-lg p-6">
        <h1 className="text-xl font-semibold">Collegamento Telegram</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Questo account Telegram è già collegato a un altro profilo.
        </p>
      </main>
    );
  }

  if (outcome.status !== "ok") {
    return (
      <main className="mx-auto max-w-lg p-6">
        <h1 className="text-xl font-semibold">Collegamento Telegram</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Il link non è valido o è scaduto. Torna su Telegram e richiedi un
          nuovo link con <span className="font-mono">/connect</span>.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="text-xl font-semibold">Telegram collegato</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Fatto. Puoi tornare su Telegram oppure aprire il tuo profilo.
      </p>
      <div className="mt-4">
        <Link className="underline" href="/profile">
          Vai al profilo
        </Link>
      </div>
    </main>
  );
}
