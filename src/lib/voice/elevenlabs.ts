/**
 * Eleven Labs Voice Generation Client
 *
 * Handles text-to-speech generation and API credit monitoring.
 * Optimized for low latency using Flash model (~75ms inference).
 */

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";

import { LatencyLogger } from "@/lib/latency-logger";
import { createLogger } from "@/lib/logger";

// Default voice ID - can be configured via env
const DEFAULT_VOICE_ID =
  process.env.ELEVENLABS_VOICE_ID || "WS1kH1PJ5Xqt3tTn5Suw";

// Use Flash model for ultra-low latency (~75ms vs ~7s for multilingual_v2)
const TTS_MODEL = "eleven_flash_v2_5";
const voiceLogger = createLogger("voice");

interface ElevenLabsSubscription {
  character_count: number;
  character_limit: number;
  next_character_count_reset_unix: number;
}

interface GenerateVoiceResult {
  audioBuffer: Buffer;
  characterCount: number;
}

// Subscription cache for chat (bypass for admin)
let subscriptionCache: {
  data: ElevenLabsSubscription;
  expiresAt: number;
} | null = null;
const SUBSCRIPTION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Generate voice audio from text using Eleven Labs API.
 * Uses Flash model for ultra-low latency.
 */
export async function generateVoice(
  text: string,
): Promise<GenerateVoiceResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("[ElevenLabs] API key not configured");
  }

  const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
  const url = `${ELEVENLABS_API_BASE}/text-to-speech/${voiceId}`;

  return await LatencyLogger.measure("Voice: ElevenLabs API", async () => {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: TTS_MODEL,
        voice_settings: {
          speed: 1.1,
          stability: 1.0,
          similarity_boost: 1.0,
          style: 0.8,
          use_speaker_boost: true,
        },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      voiceLogger.error(
        "voice.elevenlabs.tts_failed",
        "ElevenLabs TTS failed",
        {
          status: response.status,
          errorBody,
        },
      );
      throw new Error(`[ElevenLabs] TTS failed: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    return {
      audioBuffer,
      characterCount: text.length,
    };
  });
}

/**
 * Fetch the current Eleven Labs subscription info.
 * Uses in-memory cache for chat (5-minute TTL).
 * @param bypassCache - Set to true for admin pages to always fetch fresh data
 */
export async function getElevenLabsSubscription(
  bypassCache = false,
): Promise<ElevenLabsSubscription | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    voiceLogger.warn(
      "voice.elevenlabs.api_key_missing",
      "ElevenLabs API key not configured",
    );
    return null;
  }

  // Return cached data if valid and not bypassing
  if (
    !bypassCache &&
    subscriptionCache &&
    subscriptionCache.expiresAt > Date.now()
  ) {
    return subscriptionCache.data;
  }

  try {
    const data = await LatencyLogger.measure(
      "Voice: Fetch Subscription",
      async () => {
        const response = await fetch(
          `${ELEVENLABS_API_BASE}/user/subscription`,
          {
            headers: {
              "xi-api-key": apiKey,
            },
          },
        );

        if (!response.ok) {
          voiceLogger.error(
            "voice.elevenlabs.subscription_fetch_failed",
            "Failed to fetch ElevenLabs subscription",
            { status: response.status },
          );
          return null;
        }

        return (await response.json()) as ElevenLabsSubscription;
      },
    );

    // Update cache if we got valid data
    if (data) {
      subscriptionCache = {
        data,
        expiresAt: Date.now() + SUBSCRIPTION_CACHE_TTL,
      };
    }

    return data;
  } catch (error) {
    voiceLogger.error(
      "voice.elevenlabs.subscription_fetch_error",
      "Error fetching ElevenLabs subscription",
      { error },
    );
    return null;
  }
}

/**
 * Calculate the system load based on remaining Eleven Labs credits.
 * Returns a value 0.0-1.0 where:
 * - 1.0 = all credits available
 * - 0.3 = critical threshold (blocks non-pro users)
 * - 0.0 = no credits
 */
export async function getSystemLoad(): Promise<number> {
  const subscription = await getElevenLabsSubscription();

  if (!subscription) {
    // Fallback: conservative value in case of API error
    return 0.5;
  }

  const { character_count: used, character_limit: limit } = subscription;

  if (limit === 0) {
    return 0;
  }

  const remainingRatio = Math.max(0, (limit - used) / limit);

  // Log for monitoring
  voiceLogger.info("voice.elevenlabs.credits", "ElevenLabs credits snapshot", {
    used,
    limit,
    remainingRatio,
  });

  return remainingRatio;
}

/**
 * Check if Eleven Labs is configured and ready.
 */
export function isElevenLabsConfigured(): boolean {
  return !!process.env.ELEVENLABS_API_KEY;
}
