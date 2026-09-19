import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/index.js";
import { snapshotMemory } from "../src/lib/ai/memory-revision";
import { authenticateE2EPage } from "./authenticated-chat";
import { assertEphemeralE2EBranch } from "./global-setup";

let prisma: PrismaClient;
const chatIds: string[] = [];
const memoryIds: string[] = [];

test.beforeAll(() => {
  assertEphemeralE2EBranch();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Ephemeral E2E database is required");
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
});
test.afterEach(async () => {
  await prisma.memory.deleteMany({
    where: { id: { in: memoryIds.splice(0) } },
  });
  await prisma.chat.deleteMany({ where: { id: { in: chatIds.splice(0) } } });
});
test.afterAll(async () => {
  await prisma?.$disconnect();
});

async function seedChat(kind?: "saved" | "updated") {
  const user = await prisma.user.findUniqueOrThrow({
    where: { clerkId: process.env.E2E_AUTH_CLERK_ID ?? "e2e-playwright-user" },
  });
  const chat = await prisma.chat.create({
    data: {
      userId: user.id,
      title: "Verifica chat e memoria",
      visibility: "PRIVATE",
    },
  });
  chatIds.push(chat.id);
  const thread = await prisma.conversationThread.create({
    data: {
      userId: user.id,
      channel: "WEB",
      externalThreadId: chat.id,
      chatId: chat.id,
    },
  });
  const ids = Array.from({ length: 70 }, () => randomUUID());
  await prisma.message.createMany({
    data: ids.map((id, index) => ({
      id,
      userId: user.id,
      chatId: chat.id,
      conversationThreadId: thread.id,
      channel: "WEB",
      type: "TEXT",
      role: index % 2 ? "ASSISTANT" : "USER",
      direction: index % 2 ? "OUTBOUND" : "INBOUND",
      parts: [
        {
          type: "text",
          text: `Messaggio ${index + 1}. ${"Testo di verifica per la lettura della conversazione. ".repeat(3)}`,
        },
      ],
      createdAt: new Date(Date.now() - (70 - index) * 1000),
      metadata: { memoryConsolidation: "completed" },
    })),
  });
  const sourceId = ids[68];
  const assistantId = ids[69];
  await prisma.message.update({
    where: { id: assistantId },
    data: { sourceInboundMessageId: sourceId },
  });
  if (!kind) return { chat, sourceId, assistantId };
  const revisionId = randomUUID();
  const memory = await prisma.memory.create({
    data: {
      userId: user.id,
      key: `e2e_${randomUUID()}`,
      category: "schedule",
      sensitivity: "LOW",
      origin: "EXPLICIT",
      confidence: 1,
      value: { content: "Mi alleno il martedì.", revisionId },
      sourceMessageId: sourceId,
      sourceThreadId: thread.id,
    },
  });
  memoryIds.push(memory.id);
  const nextValue = {
    content:
      kind === "updated" ? "Mi alleno il giovedì." : "Mi alleno il martedì.",
    revisionId,
  };
  await prisma.memory.update({
    where: { id: memory.id },
    data: { value: nextValue },
  });
  await prisma.memoryRevision.create({
    data: {
      id: revisionId,
      userId: user.id,
      memoryId: memory.id,
      sourceMessageId: sourceId,
      ...(kind === "updated" ? { previousValue: snapshotMemory(memory) } : {}),
      nextValue,
      origin: "EXPLICIT",
      reason: kind === "updated" ? "revise" : "remember",
      dedupeKey: `e2e:${revisionId}`,
    },
  });
  return { chat, sourceId, assistantId, memory, revisionId };
}

test("keeps the next draft editable throughout a slow streamed reply", async ({
  page,
}) => {
  const { chat } = await seedChat();
  await authenticateE2EPage(page);
  await page.goto(`/chat/${chat.id}`);
  const input = page.getByRole("textbox", { name: "Scrivi un messaggio" });
  let sends = 0;
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname === "/api/chat" &&
      request.method() === "POST"
    )
      sends += 1;
  });
  await input.fill("risposta-lenta-e2e");
  await page.getByRole("button", { name: "Invia messaggio" }).click();
  await expect(page.getByText(/Questa risposta lenta/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Interrompi risposta" }),
  ).toBeVisible();
  await expect(input).toBeEditable();
  await input.fill("La mia prossima domanda");
  await input.press("Enter");
  await expect(
    page.getByRole("button", { name: "Invia messaggio" }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(input).toHaveValue("La mia prossima domanda");
  expect(sends).toBe(1);
});

test("keeps text typed while a send later fails", async ({ page }) => {
  const { chat } = await seedChat();
  let release: () => void = () => undefined;
  const responseGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/chat", async (route) => {
    await responseGate;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Il servizio AI non ha risposto. Riprova tra poco.",
        code: "AI_GENERATION_FAILED",
        retryable: true,
      }),
    });
  });
  await authenticateE2EPage(page);
  await page.goto(`/chat/${chat.id}`);
  const input = page.getByRole("textbox", { name: "Scrivi un messaggio" });
  await input.fill("Primo messaggio");
  await page.getByRole("button", { name: "Invia messaggio" }).click();
  await expect(
    page.getByRole("button", { name: "Interrompi risposta" }),
  ).toBeVisible();
  await input.fill("Bozza da conservare");
  release();
  await expect(
    page.getByRole("button", { name: "Invia messaggio" }),
  ).toBeVisible();
  await expect(input).toHaveValue("Bozza da conservare");
});

test("preserves the visible row while loading an older page", async ({
  page,
}) => {
  const { chat } = await seedChat();
  await authenticateE2EPage(page);
  await page.goto(`/chat/${chat.id}`);
  const scroll = page.locator("[data-chat-scroll]");
  let release: () => void = () => undefined;
  const responseGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/api/chats/${chat.id}?cursor=*`, async (route) => {
    await responseGate;
    await route.continue();
  });
  await scroll.evaluate((node) => {
    node.scrollTop = 40;
    node.dispatchEvent(new Event("scroll"));
  });
  await expect(
    page.getByText("Carico i messaggi precedenti...", { exact: true }),
  ).toBeVisible();
  const anchor = await scroll.evaluate((node) => {
    const top = node.getBoundingClientRect().top;
    const row = [
      ...node.querySelectorAll<HTMLElement>("[data-message-key]"),
    ].find((row) => row.getBoundingClientRect().bottom > top);
    if (!row) throw new Error("Visible anchor missing");
    return {
      key: row.dataset.messageKey,
      top: row.getBoundingClientRect().top - top,
    };
  });
  release();
  await expect(page.locator('[data-message-role="user"]')).toHaveCount(35);
  const after = await scroll.evaluate((node, key) => {
    const row = [
      ...node.querySelectorAll<HTMLElement>("[data-message-key]"),
    ].find((row) => row.dataset.messageKey === key);
    if (!row) throw new Error("Loaded anchor missing");
    return row.getBoundingClientRect().top - node.getBoundingClientRect().top;
  }, anchor.key);
  expect(Math.abs(after - anchor.top)).toBeLessThan(3);
});

for (const kind of ["saved", "updated"] as const) {
  test(`shows and undoes the actual ${kind} fact after consolidation finishes`, async ({
    page,
  }) => {
    const fixture = await seedChat(kind);
    const memory = fixture.memory;
    if (!memory) throw new Error("Memory fixture missing");
    await prisma.message.update({
      where: { id: fixture.assistantId },
      data: { metadata: { memoryConsolidation: "pending" } },
    });
    await authenticateE2EPage(page);
    await page.goto(`/chat/${fixture.chat.id}`);
    await expect(
      page.getByRole("link", { name: "Gestisci memoria" }),
    ).toHaveCount(0);
    await prisma.message.update({
      where: { id: fixture.assistantId },
      data: { metadata: { memoryConsolidation: "completed" } },
    });
    await expect(
      page.getByText(
        kind === "saved" ? "Salvato in memoria:" : "Memoria aggiornata:",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByText(
        kind === "saved" ? /Mi alleno il martedì/ : /Mi alleno il giovedì/,
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Gestisci memoria" }),
    ).toHaveAttribute("href", "/profile#memoria");
    await page.getByRole("button", { name: "Annulla", exact: true }).click();
    await expect(
      page.getByText("Modifica alla memoria annullata."),
    ).toBeVisible();
    const restored = await prisma.memory.findUniqueOrThrow({
      where: { id: memory.id },
    });
    expect(restored.status).toBe(kind === "saved" ? "DELETED" : "ACTIVE");
    if (kind === "updated")
      expect(restored.value).toMatchObject({
        content: "Mi alleno il martedì.",
      });
  });
}

test("refuses to undo a fact changed after the notification was loaded", async ({
  page,
}) => {
  const fixture = await seedChat("updated");
  if (!fixture.memory) throw new Error("Memory fixture missing");
  await authenticateE2EPage(page);
  await page.goto(`/chat/${fixture.chat.id}`);
  await expect(
    page.getByText("Memoria aggiornata:", { exact: true }),
  ).toBeVisible();
  await prisma.memory.update({
    where: { id: fixture.memory.id },
    data: {
      value: { content: "Mi alleno il sabato.", revisionId: randomUUID() },
    },
  });
  await page.getByRole("button", { name: "Annulla", exact: true }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Questa memoria è già cambiata" }),
  ).toBeVisible();
  expect(
    (
      await prisma.memory.findUniqueOrThrow({
        where: { id: fixture.memory.id },
      })
    ).value,
  ).toMatchObject({ content: "Mi alleno il sabato." });
});
