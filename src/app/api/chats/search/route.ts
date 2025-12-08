/**
 * Message Search API
 *
 * Searches through user's chat messages.
 */

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const { userId: clerkId } = await auth();

  if (!clerkId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user
  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true },
  });

  if (!user) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  // Get search query
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();

  if (!query || query.length < 2) {
    return Response.json(
      { error: "Search query must be at least 2 characters" },
      { status: 400 },
    );
  }

  // Search messages (case-insensitive contains)
  const messages = await prisma.message.findMany({
    where: {
      userId: user.id,
      content: {
        contains: query,
        mode: "insensitive",
      },
    },
    select: {
      id: true,
      content: true,
      role: true,
      createdAt: true,
      chatId: true,
      chat: {
        select: {
          id: true,
          title: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 20, // Limit results
  });

  // Format results
  const results = messages.map((msg) => ({
    id: msg.id,
    content: msg.content,
    role: msg.role,
    createdAt: msg.createdAt,
    chatId: msg.chatId,
    chatTitle: msg.chat?.title || "Untitled",
    // Highlight snippet
    snippet: getSnippet(msg.content || "", query, 100),
  }));

  return Response.json({ results, query });
}

/**
 * Get a snippet of text around the search term
 */
function getSnippet(text: string, query: string, maxLength: number): string {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);

  if (index === -1) {
    return text.slice(0, maxLength) + (text.length > maxLength ? "..." : "");
  }

  const start = Math.max(0, index - 40);
  const end = Math.min(text.length, index + query.length + 60);

  let snippet = text.slice(start, end);
  if (start > 0) snippet = `...${snippet}`;
  if (end < text.length) snippet = `${snippet}...`;

  return snippet;
}
