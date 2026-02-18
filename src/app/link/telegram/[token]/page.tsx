import { createHash } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { migrateGuestToUser } from "@/lib/guest-migration";

// Error state icons
function ErrorIcon() {
  return (
    <svg
      className="h-12 w-12 text-destructive"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      role="img"
      aria-label="Icona errore"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
      />
    </svg>
  );
}

function SuccessIcon() {
  return (
    <svg
      className="h-12 w-12 text-green-500"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      role="img"
      aria-label="Icona successo"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg
      className="h-12 w-12 text-yellow-500"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      role="img"
      aria-label="Icona avviso"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function hashLinkToken(token: string) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return null;
  return createHash("sha256")
    .update(`tg-link:${secret}:${token}`)
    .digest("hex");
}

/**
 * Send a message to a Telegram chat.
 */
async function sendTelegramMessage(chatId: string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error("[Telegram Link] TELEGRAM_BOT_TOKEN not configured");
    return;
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[Telegram Link] sendMessage failed:", res.status, body);
    }
  } catch (error) {
    console.error("[Telegram Link] Error sending message:", error);
  }
}

export default async function TelegramLinkTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  // Next.js 15: params is now a Promise
  const resolvedParams = await params;
  const token = resolvedParams.token;

  if (!token) {
    return (
      <main className="mx-auto max-w-lg p-6 text-center">
        <div className="mx-auto mb-4 w-fit">
          <ErrorIcon />
        </div>
        <h1 className="text-xl font-semibold">Collegamento Telegram</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Link non valido. Torna su Telegram e richiedi un nuovo link con
          <span className="font-mono"> /connect</span>.
        </p>
      </main>
    );
  }

  const { userId } = await auth();
  if (!userId) {
    redirect(
      `/sign-in?redirect_url=${encodeURIComponent(`/link/telegram/${token}`)}`,
    );
  }

  const authResult = await getAuthUser();
  const dbUser = authResult.user;
  if (!dbUser) {
    redirect(
      `/sign-in?redirect_url=${encodeURIComponent(`/link/telegram/${token}`)}`,
    );
  }

  const tokenHash = hashLinkToken(token);

  if (!tokenHash) {
    return (
      <main className="mx-auto max-w-lg p-6 text-center">
        <div className="mx-auto mb-4 w-fit">
          <ErrorIcon />
        </div>
        <h1 className="text-xl font-semibold">Collegamento Telegram</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Configurazione del server non valida. Contatta il supporto.
        </p>
      </main>
    );
  }

  // biome-ignore lint/complexity/useDateNow: Date.now() is flagged as impure by React Doctor in this page.
  const nowMs = Number(new Date());

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

    if (linkToken.expiresAt.getTime() < nowMs) {
      return { status: "expired" as const };
    }

    // Check if the current user already has a Telegram channel linked
    const userExistingTelegram = await tx.channelIdentity.findFirst({
      where: {
        userId: dbUser.id,
        channel: "TELEGRAM",
      },
      select: { id: true, externalId: true },
    });

    if (userExistingTelegram) {
      // User already has Telegram linked - check if it's the same externalId
      if (userExistingTelegram.externalId === linkToken.externalId) {
        // Same Telegram account, mark token as consumed and return success
        await tx.channelLinkToken.update({
          where: { id: linkToken.id },
          data: {
            consumedAt: new Date(),
            consumedByUserId: dbUser.id,
          },
          select: { id: true },
        });
        return { status: "already_linked" as const };
      } else {
        // Different Telegram account - user can only have one
        return { status: "already_has_telegram" as const };
      }
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

        // Use centralized migration utility for complete data migration
        const migrationResult = await migrateGuestToUser(guestId, dbUser.id);

        if (!migrationResult.success) {
          console.error(
            "[Telegram Link] Guest migration failed:",
            migrationResult.error,
          );
          return { status: "conflict" as const };
        }

        console.log(
          "[Telegram Link] Guest migration successful:",
          migrationResult.migratedCounts,
          `(${migrationResult.conflicts.length} conflicts resolved)`,
        );
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

    return { status: "ok" as const, chatId: linkToken.chatId };
  });

  if (outcome.status === "conflict") {
    return (
      <main className="mx-auto max-w-lg p-6 text-center">
        <div className="mx-auto mb-4 w-fit">
          <ErrorIcon />
        </div>
        <h1 className="text-xl font-semibold">Account già collegato</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Questo account Telegram è già collegato a un altro profilo. Se ritieni
          sia un errore, contatta il supporto.
        </p>
      </main>
    );
  }

  if (outcome.status === "expired") {
    return (
      <main className="mx-auto max-w-lg p-6 text-center">
        <div className="mx-auto mb-4 w-fit">
          <WarningIcon />
        </div>
        <h1 className="text-xl font-semibold">Link scaduto</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Questo link è scaduto (valido per 10 minuti). Torna su Telegram e
          richiedi un nuovo link con <span className="font-mono">/connect</span>
          .
        </p>
      </main>
    );
  }

  if (outcome.status === "used") {
    return (
      <main className="mx-auto max-w-lg p-6 text-center">
        <div className="mx-auto mb-4 w-fit">
          <WarningIcon />
        </div>
        <h1 className="text-xl font-semibold">Link già utilizzato</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Questo link è già stato utilizzato. Se non hai completato il
          collegamento, richiedi un nuovo link su Telegram con{" "}
          <span className="font-mono">/connect</span>.
        </p>
      </main>
    );
  }

  if (outcome.status === "invalid") {
    return (
      <main className="mx-auto max-w-lg p-6 text-center">
        <div className="mx-auto mb-4 w-fit">
          <ErrorIcon />
        </div>
        <h1 className="text-xl font-semibold">Link non valido</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Il link non è riconosciuto. Assicurati di aver copiato l'intero link,
          oppure richiedi un nuovo link su Telegram con{" "}
          <span className="font-mono">/connect</span>.
        </p>
      </main>
    );
  }

  if (outcome.status === "already_linked") {
    return (
      <main className="mx-auto max-w-lg p-6 text-center">
        <div className="mx-auto mb-4 w-fit">
          <SuccessIcon />
        </div>
        <h1 className="text-xl font-semibold text-green-600">
          Telegram già collegato
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Questo account Telegram è già collegato al tuo profilo. Non è
          necessario fare nulla!
        </p>
        <div className="mt-4">
          <Link
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            href="/channels"
          >
            Vai ai canali
          </Link>
        </div>
      </main>
    );
  }

  if (outcome.status === "already_has_telegram") {
    return (
      <main className="mx-auto max-w-lg p-6 text-center">
        <div className="mx-auto mb-4 w-fit">
          <ErrorIcon />
        </div>
        <h1 className="text-xl font-semibold">
          Hai già un account Telegram collegato
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Puoi collegare solo un account Telegram per profilo. Se vuoi collegare
          un account Telegram diverso, scollega prima quello attuale dalla
          pagina dei canali.
        </p>
        <div className="mt-4">
          <Link
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            href="/channels"
          >
            Vai ai canali
          </Link>
        </div>
      </main>
    );
  }

  // Send confirmation message to Telegram
  if (outcome.chatId) {
    await sendTelegramMessage(
      outcome.chatId,
      "✅ Account collegato con successo! Ora puoi chattare direttamente da qui.",
    );
  }

  if (process.env.TELEGRAM_BOT_USERNAME) {
    redirect(`https://t.me/${process.env.TELEGRAM_BOT_USERNAME}`);
  }

  redirect("/channels");
}
