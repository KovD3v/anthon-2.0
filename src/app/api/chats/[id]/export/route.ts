/**
 * Export Chat API
 *
 * Exports a chat conversation to Markdown format.
 */

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId: clerkId } = await auth();
  const { id: chatId } = await params;

  if (!clerkId) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Get user
  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true },
  });

  if (!user) {
    return new Response("User not found", { status: 404 });
  }

  // Get chat with messages
  const chat = await prisma.chat.findFirst({
    where: { id: chatId, userId: user.id },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          role: true,
          content: true,
          createdAt: true,
        },
      },
    },
  });

  if (!chat) {
    return new Response("Chat not found", { status: 404 });
  }

  // Build Markdown content
  const title = chat.title || "Untitled Chat";
  const createdAt = chat.createdAt.toISOString().split("T")[0];

  let markdown = `# ${title}\n\n`;
  markdown += `*Exported on ${new Date().toLocaleDateString()}*\n\n`;
  markdown += `---\n\n`;

  for (const message of chat.messages) {
    const role = message.role === "USER" ? "**You**" : "**Anthon**";
    const time = message.createdAt.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });

    markdown += `### ${role} (${time})\n\n`;
    markdown += `${message.content || ""}\n\n`;
  }

  // Generate filename
  const safeTitle = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 50);
  const filename = `anthon-chat-${safeTitle}-${createdAt}.md`;

  return new Response(markdown, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
