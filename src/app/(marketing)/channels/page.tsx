import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ChannelsPageClient } from "./client";

export default async function ChannelsPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in?redirect_url=/channels");
  }

  const authResult = await getAuthUser();
  const dbUser = authResult.user;
  if (!dbUser) {
    redirect("/sign-in?redirect_url=/channels");
  }

  // Fetch connected channel identities
  const connectedChannels = await prisma.channelIdentity.findMany({
    where: { userId: dbUser.id },
    orderBy: { createdAt: "desc" },
  });

  // Fetch pending or expired link tokens for this user
  const linkTokens = await prisma.channelLinkToken.findMany({
    where: {
      consumedByUserId: dbUser.id,
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  // Serialize dates for client component
  const serializedChannels = connectedChannels.map((c) => ({
    id: c.id,
    channel: c.channel,
    externalId: c.externalId,
    createdAt: c.createdAt.toISOString(),
  }));

  const serializedTokens = linkTokens.map((t) => ({
    id: t.id,
    channel: t.channel,
    expiresAt: t.expiresAt.toISOString(),
    consumedAt: t.consumedAt?.toISOString() || null,
  }));

  return (
    <ChannelsPageClient
      connectedChannels={serializedChannels}
      linkTokens={serializedTokens}
    />
  );
}
