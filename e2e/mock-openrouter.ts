import { createServer, type IncomingMessage } from "node:http";

const PORT = 4317;
const encoder = new TextEncoder();

interface OpenRouterMessage {
  role?: string;
  content?: string | Array<{ type?: string; text?: string }>;
}

interface OpenRouterRequest {
  model?: string;
  messages?: OpenRouterMessage[];
  stream?: boolean;
}

function messageText(message: OpenRouterMessage | undefined) {
  if (!message) return "";
  if (typeof message.content === "string") return message.content;
  if (!Array.isArray(message.content)) return "";
  return message.content
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("");
}

function getLastUserText(messages: OpenRouterMessage[] = []) {
  return messageText(
    [...messages].reverse().find((message) => message.role === "user"),
  );
}

function chooseResponse(payload: OpenRouterRequest) {
  const messages = payload.messages ?? [];
  const lastUserText = getLastUserText(messages);
  const allText = messages.map(messageText).join("\n");

  if (allText.includes("Genera un titolo in italiano")) {
    return "Test persistenza chat";
  }
  if (lastUserText.includes("Qual era la parola chiave")) {
    return allText.toLowerCase().includes("zaffiro")
      ? "La parola chiave era zaffiro."
      : "Non trovo la parola chiave.";
  }
  if (lastUserText.includes("risposta-lenta-e2e")) {
    return "Questa risposta lenta arriva in più parti e può essere interrotta senza bloccare la conversazione.";
  }
  if (lastUserText.includes("recupero-e2e")) {
    return "Il flusso è di nuovo operativo.";
  }
  if (lastUserText.includes("Secondo turno consecutivo E2E")) {
    return Array.from({ length: 120 }, (_, index) => `token-${index}`).join(
      " ",
    );
  }
  if (lastUserText.toLowerCase().includes("zaffiro")) {
    return "Ho memorizzato la parola chiave zaffiro.";
  }
  return "Risposta E2E completata.";
}

function readJson(request: IncomingMessage) {
  return new Promise<OpenRouterRequest>((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function completionPayload(payload: OpenRouterRequest, text: string) {
  return {
    id: `mock-${crypto.randomUUID()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: payload.model ?? "mock-model",
    provider: "e2e-local",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: "stop",
        native_finish_reason: "stop",
        logprobs: null,
      },
    ],
    usage: {
      prompt_tokens: 12,
      completion_tokens: text.split(/\s+/).length,
      total_tokens: 12 + text.split(/\s+/).length,
      cost: 0,
    },
  };
}

function streamChunk(
  payload: OpenRouterRequest,
  id: string,
  delta: string,
  finishReason: string | null,
) {
  return {
    id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: payload.model ?? "mock-model",
    provider: "e2e-local",
    choices: [
      {
        index: 0,
        delta: delta ? { content: delta } : {},
        finish_reason: finishReason,
        native_finish_reason: finishReason,
        logprobs: null,
      },
    ],
    ...(finishReason
      ? {
          usage: {
            prompt_tokens: 12,
            completion_tokens: 8,
            total_tokens: 20,
            cost: 0,
          },
        }
      : {}),
  };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end('{"ok":true}');
    return;
  }

  if (request.method !== "POST" || request.url !== "/api/v1/chat/completions") {
    response.writeHead(404, { "Content-Type": "application/json" });
    response.end('{"error":"not found"}');
    return;
  }

  try {
    const payload = await readJson(request);
    const text = chooseResponse(payload);

    if (!payload.stream) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(completionPayload(payload, text)));
      return;
    }

    response.writeHead(200, {
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
    });

    const id = `mock-${crypto.randomUUID()}`;
    const chunks = text.match(/\S+\s*/g) ?? [text];
    const isSlow = getLastUserText(payload.messages).includes(
      "risposta-lenta-e2e",
    );
    const isBurst = getLastUserText(payload.messages).includes(
      "Secondo turno consecutivo E2E",
    );

    for (const chunk of chunks) {
      if (response.destroyed) return;
      response.write(
        encoder.encode(
          `data: ${JSON.stringify(streamChunk(payload, id, chunk, null))}\n\n`,
        ),
      );
      if (!isBurst) {
        await delay(isSlow ? 250 : 35);
      }
    }

    if (response.destroyed) return;
    response.write(
      encoder.encode(
        `data: ${JSON.stringify(streamChunk(payload, id, "", "stop"))}\n\n`,
      ),
    );
    response.write("data: [DONE]\n\n");
    response.end();
  } catch (error) {
    response.writeHead(400, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        error: error instanceof Error ? error.message : "invalid request",
      }),
    );
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[e2e-openrouter] listening on http://127.0.0.1:${PORT}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close(() => process.exit(0));
  });
}
