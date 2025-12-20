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
  // Use WHATSAPP_VERIFY_TOKEN as secret for hashing, consistent with route.ts
  const secret = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!secret) return null;
  return createHash("sha256")
    .update(`wa-link:${secret}:${token}`)
    .digest("hex");
}

async function sendWhatsAppMessage(to: string, text: string) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return;

  const url = `https://graph.facebook.com/v21.0/${phoneId}/messages`;
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      }),
    });
  } catch (e) {
    console.error("[WhatsApp Link] Send failed", e);
  }
}

export default async function WhatsAppLinkTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const resolvedParams = await params;
  const token = resolvedParams.token;

  if (!token) {
    return (
      <main className="mx-auto max-w-lg p-6 text-center">
        <div className="mx-auto mb-4 w-fit">
          <ErrorIcon />
        </div>
        <h1 className="text-xl font-semibold">Collegamento WhatsApp</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Link non valido. Torna su WhatsApp e richiedi un nuovo link con
          <span className="font-mono"> /connect</span>.
        </p>
      </main>
    );
  }

  const { userId } = await auth();
  if (!userId) {
    redirect(
      `/sign-in?redirect_url=${encodeURIComponent(`/link/whatsapp/${token}`)}`,
    );
  }

  const authResult = await getAuthUser();
  const dbUser = authResult.user;
  if (!dbUser) {
    redirect(
      `/sign-in?redirect_url=${encodeURIComponent(`/link/whatsapp/${token}`)}`,
    );
  }

  const tokenHash = hashLinkToken(token);

  if (!tokenHash) {
    return (
      <main className="mx-auto max-w-lg p-6 text-center">
        <div className="mx-auto mb-4 w-fit">
          <ErrorIcon />
        </div>
        <h1 className="text-xl font-semibold">Collegamento WhatsApp</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Configurazione del server non valida.
        </p>
      </main>
    );
  }

  const outcome = await prisma.$transaction(async (tx) => {
    const linkToken = await tx.channelLinkToken.findUnique({
      where: { tokenHash },
    });

    if (!linkToken || linkToken.channel !== "WHATSAPP") {
      return { status: "invalid" as const };
    }

    if (linkToken.consumedAt) {
      return { status: "used" as const };
    }

    if (linkToken.expiresAt.getTime() < Date.now()) {
      return { status: "expired" as const };
    }

    // Check existing
    const userExistingWA = await tx.channelIdentity.findFirst({
      where: { userId: dbUser.id, channel: "WHATSAPP" },
    });

    if (userExistingWA) {
      if (userExistingWA.externalId === linkToken.externalId) {
        await tx.channelLinkToken.update({
          where: { id: linkToken.id },
          data: {
            consumedAt: new Date(),
            consumedByUserId: dbUser.id,
          },
        });
        return { status: "already_linked" as const };
      } else {
        return { status: "already_has_whatsapp" as const };
      }
    }

    const existingIdentity = await tx.channelIdentity.findUnique({
      where: {
        channel_externalId: {
          channel: "WHATSAPP",
          externalId: linkToken.externalId,
        },
      },
      include: { user: true },
    });

    if (existingIdentity?.userId && existingIdentity.userId !== dbUser.id) {
      if (existingIdentity.user?.isGuest) {
        const res = await migrateGuestToUser(
          existingIdentity.userId,
          dbUser.id,
        );
        if (!res.success) return { status: "conflict" as const };
      } else {
        return { status: "conflict" as const };
      }
    }

    if (!existingIdentity) {
      await tx.channelIdentity.create({
        data: {
          channel: "WHATSAPP",
          externalId: linkToken.externalId,
          userId: dbUser.id,
        },
      });
    }

    await tx.channelLinkToken.update({
      where: { id: linkToken.id },
      data: { consumedAt: new Date(), consumedByUserId: dbUser.id },
    });

    return { status: "ok" as const, phone: linkToken.externalId };
  });

  if (outcome.status === "ok" && outcome.phone) {
    await sendWhatsAppMessage(
      outcome.phone,
      "✅ Account collegato con successo! Ora puoi chattare direttamente da qui.",
    );
  }

  // Render Result

  if (outcome.status === "invalid") {
    return renderState(
      <ErrorIcon />,
      "Link non valido",
      "Link non riconosciuto. Richiedine uno nuovo.",
    );
  }
  if (outcome.status === "expired") {
    return renderState(
      <WarningIcon />,
      "Link scaduto",
      "Il link è scaduto. Richiedine uno nuovo con /connect.",
    );
  }
  if (outcome.status === "used") {
    return renderState(
      <WarningIcon />,
      "Link già utilizzato",
      "Hai già usato questo link.",
    );
  }
  if (outcome.status === "conflict") {
    return renderState(
      <ErrorIcon />,
      "Account già collegato",
      "Questo numero è già collegato a un altro utente.",
    );
  }
  if (outcome.status === "already_has_whatsapp") {
    return renderState(
      <ErrorIcon />,
      "Hai già un numero collegato",
      "Scollega il numero precedente prima di collegarne uno nuovo.",
    );
  }

  // Success or Already Linked
  return (
    <main className="mx-auto max-w-lg p-6 text-center">
      <div className="mx-auto mb-4 w-fit">
        <SuccessIcon />
      </div>
      <h1 className="text-xl font-semibold text-green-600">
        WhatsApp collegato!
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Ora puoi chiudere questa pagina e tornare su WhatsApp.
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

function renderState(
  icon: React.ReactNode,
  title: string,
  description: string,
) {
  return (
    <main className="mx-auto max-w-lg p-6 text-center">
      <div className="mx-auto mb-4 w-fit">{icon}</div>
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </main>
  );
}
