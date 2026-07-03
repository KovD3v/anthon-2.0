import type { ModelMessage } from "ai";

export type MultimodalMediaKind = "image" | "pdf" | "video";

type OpenRouterTextPart = {
  type: "text";
  text: string;
};

type OpenRouterImagePart = {
  type: "image_url";
  image_url: {
    url: string;
  };
};

type OpenRouterFilePart = {
  type: "file";
  file: {
    filename: string;
    file_data: string;
  };
};

export type OpenRouterContentPart =
  | OpenRouterTextPart
  | OpenRouterImagePart
  | OpenRouterFilePart;

export type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: string | OpenRouterContentPart[];
};

const DEFAULT_MULTIMODAL_MODEL_CAPABILITIES = new Set<MultimodalMediaKind>([
  "image",
]);

const MULTIMODAL_MODEL_CAPABILITIES: Record<
  string,
  ReadonlySet<MultimodalMediaKind>
> = {
  "google/gemini-2.5-flash-lite": new Set(["image", "pdf", "video"]),
};

export function normalizeMediaType(mediaType: string) {
  return mediaType.split(";")[0]?.trim().toLowerCase() || mediaType;
}

export function getMultimodalMediaKind(
  mediaType?: string,
): MultimodalMediaKind | null {
  if (!mediaType) {
    return null;
  }

  const normalized = normalizeMediaType(mediaType);
  if (normalized.startsWith("image/")) {
    return "image";
  }

  if (normalized === "application/pdf") {
    return "pdf";
  }

  if (normalized.startsWith("video/")) {
    return "video";
  }

  return null;
}

export function getMultimodalModelCapabilities(modelId: string) {
  return (
    MULTIMODAL_MODEL_CAPABILITIES[modelId] ??
    DEFAULT_MULTIMODAL_MODEL_CAPABILITIES
  );
}

export function modelSupportsMultimodalMediaKind(
  modelId: string,
  mediaKind: MultimodalMediaKind,
) {
  return getMultimodalModelCapabilities(modelId).has(mediaKind);
}

export function isBase64Payload(value: string) {
  const normalized = value.replace(/\s/g, "");
  if (normalized.length === 0 || normalized.length % 4 !== 0) {
    return false;
  }
  return /^[A-Za-z0-9+/]+={0,2}$/.test(normalized);
}

export function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function isDataUrl(value: string) {
  return /^data:[a-z0-9.+-]+\/[a-z0-9.+-]+(?:;[a-z0-9=.+-]+)*;base64,/i.test(
    value,
  );
}

export function hasSupportedOpenRouterMedia(
  messages: ModelMessage[],
  modelId: string,
) {
  return messages.some((message) => {
    if (!Array.isArray(message.content)) {
      return false;
    }

    return message.content.some((part) => {
      if (!part || typeof part !== "object") {
        return false;
      }

      const candidate = part as { type?: unknown; mediaType?: unknown };
      if (
        candidate.type !== "file" ||
        typeof candidate.mediaType !== "string"
      ) {
        return false;
      }

      const mediaKind = getMultimodalMediaKind(candidate.mediaType);
      return mediaKind
        ? modelSupportsMultimodalMediaKind(modelId, mediaKind)
        : false;
    });
  });
}

async function dataUrlFromHttpUrl(url: string, mediaType: string) {
  const response = await fetch(url);
  if (!response.ok) {
    return null;
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:${mediaType};base64,${buffer.toString("base64")}`;
}

function dataUrlFromPayload(data: string | Uint8Array, mediaType: string) {
  if (data instanceof Uint8Array) {
    return `data:${mediaType};base64,${Buffer.from(data).toString("base64")}`;
  }

  if (isDataUrl(data)) {
    return data;
  }

  if (isBase64Payload(data)) {
    return `data:${mediaType};base64,${data}`;
  }

  return null;
}

async function toOpenRouterFileData(
  data: string | Uint8Array,
  mediaType: string,
) {
  if (typeof data === "string" && isHttpUrl(data)) {
    return dataUrlFromHttpUrl(data, mediaType);
  }

  return dataUrlFromPayload(data, mediaType);
}

function defaultFilename(mediaType: string) {
  const mediaKind = getMultimodalMediaKind(mediaType);
  if (mediaKind === "pdf") {
    return "document.pdf";
  }
  if (mediaKind === "video") {
    return "video";
  }
  return "attachment";
}

async function toOpenRouterContentPart(
  part: unknown,
): Promise<OpenRouterContentPart | null> {
  if (!part || typeof part !== "object") {
    return null;
  }

  const candidate = part as {
    type?: unknown;
    text?: unknown;
    data?: unknown;
    mediaType?: unknown;
    name?: unknown;
  };

  if (candidate.type === "text" && typeof candidate.text === "string") {
    return { type: "text", text: candidate.text };
  }

  if (
    candidate.type !== "file" ||
    typeof candidate.mediaType !== "string" ||
    !(
      typeof candidate.data === "string" || candidate.data instanceof Uint8Array
    )
  ) {
    return null;
  }

  const mediaType = normalizeMediaType(candidate.mediaType);
  const mediaKind = getMultimodalMediaKind(mediaType);

  if (mediaKind === "image" && typeof candidate.data === "string") {
    if (isHttpUrl(candidate.data) || isDataUrl(candidate.data)) {
      return { type: "image_url", image_url: { url: candidate.data } };
    }

    if (isBase64Payload(candidate.data)) {
      return {
        type: "image_url",
        image_url: { url: `data:${mediaType};base64,${candidate.data}` },
      };
    }
  }

  if (mediaKind === "pdf" || mediaKind === "video") {
    const fileData = await toOpenRouterFileData(candidate.data, mediaType);
    if (!fileData) {
      return null;
    }

    return {
      type: "file",
      file: {
        filename:
          typeof candidate.name === "string" && candidate.name.trim()
            ? candidate.name
            : defaultFilename(mediaType),
        file_data: fileData,
      },
    };
  }

  return null;
}

async function toOpenRouterContent(
  content: unknown,
): Promise<string | OpenRouterContentPart[]> {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  const parts = await Promise.all(
    content.map((part) => toOpenRouterContentPart(part)),
  );
  return parts.filter((part): part is OpenRouterContentPart => Boolean(part));
}

export async function toOpenRouterMessages(
  systemPrompt: string,
  messages: ModelMessage[],
): Promise<OpenRouterMessage[]> {
  const openRouterMessages: OpenRouterMessage[] = [
    { role: "system", content: systemPrompt },
  ];

  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant") {
      continue;
    }

    openRouterMessages.push({
      role: message.role,
      content: await toOpenRouterContent(message.content),
    });
  }

  return openRouterMessages;
}
