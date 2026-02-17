export interface TranscriptionInput {
  base64: string;
  mimeType: string;
  title?: string;
  prompt?: string;
}

export async function transcribeAudioWithOpenRouter({
  base64,
  mimeType,
  title = "Channel Bot",
  prompt = "Trascrivi questo messaggio audio in testo. Rispondi SOLO con la trascrizione, senza commenti.",
}: TranscriptionInput): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY not configured");
  }

  const dataUri = `data:${mimeType};base64,${base64}`;

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer":
          process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "X-Title": title,
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-lite-001",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: prompt,
              },
              {
                type: "image_url",
                image_url: {
                  url: dataUri,
                },
              },
            ],
          },
        ],
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`OpenRouter API failed: ${response.status} ${body}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("OpenRouter returned no text output");
  }

  return text;
}
