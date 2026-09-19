import { beforeEach, describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db";
import {
  createChat,
  createMessage,
  createUser,
  resetIntegrationDb,
} from "@/test/integration/factories";
import { patchMessageMetadata } from "./message-metadata";

describe("integration atomic message metadata patches", () => {
  beforeEach(resetIntegrationDb);

  it.each([Prisma.DbNull, Prisma.JsonNull, []])(
    "normalizes legacy non-object metadata",
    async (metadata) => {
      const user = await createUser();
      const chat = await createChat(user.id);
      const message = await createMessage({
        userId: user.id,
        chatId: chat.id,
        role: "ASSISTANT",
      });
      await prisma.message.update({
        where: { id: message.id },
        data: { metadata },
      });
      await patchMessageMetadata(prisma, message.id, {
        voice: { status: "ready" },
      });
      expect(
        (await prisma.message.findUniqueOrThrow({ where: { id: message.id } }))
          .metadata,
      ).toEqual({ voice: { status: "ready" } });
    },
  );

  it("preserves memory completion when a voice writer updates another field", async () => {
    const user = await createUser();
    const chat = await createChat(user.id);
    const message = await createMessage({
      userId: user.id,
      chatId: chat.id,
      role: "ASSISTANT",
      metadata: { memoryConsolidation: "completed", source: "web" },
    });
    await patchMessageMetadata(prisma, message.id, {
      voice: { status: "ready" },
      ai: { capabilitiesUsed: ["memory", "voice"] },
    });
    expect(
      (await prisma.message.findUniqueOrThrow({ where: { id: message.id } }))
        .metadata,
    ).toEqual({
      memoryConsolidation: "completed",
      source: "web",
      voice: { status: "ready" },
      ai: { capabilitiesUsed: ["memory", "voice"] },
    });
  });
});
