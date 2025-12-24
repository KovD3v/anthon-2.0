"use client";

import { Loader2, Mic, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { AttachmentData } from "@/types/chat";

interface AudioRecorderProps {
  onRecordingComplete: (attachment: AttachmentData) => void;
  disabled?: boolean;
}

// Recording states for UI feedback
type RecordingState = "idle" | "requesting" | "recording" | "processing";

export function AudioRecorder({
  onRecordingComplete,
  disabled,
}: AudioRecorderProps) {
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    setRecordingDuration(0);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  const startRecording = async () => {
    try {
      setRecordingState("requesting");

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
      });
      streamRef.current = stream;

      // Create MediaRecorder with best available format
      // WebM/Opus is widely supported and good quality
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/mp4";

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        setRecordingState("processing");

        try {
          const originalBlob = new Blob(chunksRef.current, {
            type: mimeType,
          });

          // Convert to WAV format for OpenRouter compatibility
          // OpenRouter only supports MP3 and WAV
          const wavBlob = await convertToWav(originalBlob);

          // Convert WAV to base64 for sending to AI
          const base64Data = await blobToBase64(wavBlob);

          // Upload the audio file
          const formData = new FormData();
          const fileName = `recording_${Date.now()}.wav`;
          formData.append("file", wavBlob, fileName);

          const response = await fetch("/api/upload", {
            method: "POST",
            body: formData,
          });

          if (!response.ok) {
            throw new Error("Upload failed");
          }

          const data = await response.json();

          // Include base64 data for the AI model
          onRecordingComplete({
            id: data.id,
            name: data.name,
            contentType: "audio/wav", // Always WAV after conversion
            size: data.size,
            url: data.url,
            base64Data: base64Data, // Include for AI audio processing
          });

          toast.success("Registrazione audio pronta");
        } catch (error) {
          console.error("Error processing recording:", error);
          toast.error("Errore durante l'elaborazione della registrazione");
        } finally {
          cleanup();
          setRecordingState("idle");
        }
      };

      mediaRecorder.onerror = (event) => {
        console.error("MediaRecorder error:", event);
        toast.error("Errore durante la registrazione");
        cleanup();
        setRecordingState("idle");
      };

      // Start recording
      mediaRecorder.start(100); // Collect data every 100ms
      setRecordingState("recording");

      // Start duration timer
      timerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);

      // Auto-stop after 2 minutes (max reasonable voice message)
      setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") {
          stopRecording();
          toast.info(
            "Registrazione terminata automaticamente (limite 2 minuti)",
          );
        }
      }, 120000);
    } catch (error) {
      console.error("Error starting recording:", error);
      if ((error as Error).name === "NotAllowedError") {
        toast.error(
          "Accesso al microfono negato. Controlla i permessi del browser.",
        );
      } else if ((error as Error).name === "NotFoundError") {
        toast.error("Nessun microfono trovato.");
      } else {
        toast.error("Impossibile avviare la registrazione");
      }
      cleanup();
      setRecordingState("idle");
    }
  };

  const stopRecording = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop();
    }
  };

  const handleClick = () => {
    if (recordingState === "idle") {
      startRecording();
    } else if (recordingState === "recording") {
      stopRecording();
    }
  };

  // Format duration as MM:SS
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const isRecording = recordingState === "recording";
  const isProcessing =
    recordingState === "processing" || recordingState === "requesting";

  return (
    <div className="relative flex items-center gap-2">
      {/* Recording duration indicator */}
      {isRecording && (
        <div className="flex items-center gap-1.5 text-xs text-red-500 animate-pulse">
          <span className="h-2 w-2 rounded-full bg-red-500" />
          <span className="font-mono">{formatDuration(recordingDuration)}</span>
        </div>
      )}

      <Button
        type="button"
        size="icon"
        variant={isRecording ? "destructive" : "ghost"}
        className={`h-9 w-9 rounded-full transition-all ${
          isRecording
            ? "bg-red-500 hover:bg-red-600 animate-pulse"
            : "hover:bg-muted"
        }`}
        onClick={handleClick}
        disabled={disabled || isProcessing}
        aria-label={
          isRecording ? "Ferma registrazione" : "Registra messaggio vocale"
        }
        title={
          isRecording ? "Ferma registrazione" : "Registra messaggio vocale"
        }
      >
        {isProcessing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isRecording ? (
          <Square className="h-4 w-4 fill-current" />
        ) : (
          <Mic className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}

/**
 * Convert audio blob to WAV format using Web Audio API.
 * OpenRouter only supports MP3 and WAV formats.
 */
async function convertToWav(audioBlob: Blob): Promise<Blob> {
  // Create an audio context
  const audioContext = new AudioContext();

  // Decode the audio data
  const arrayBuffer = await audioBlob.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  // Convert to WAV
  const wavBuffer = audioBufferToWav(audioBuffer);

  // Close the audio context
  await audioContext.close();

  return new Blob([wavBuffer], { type: "audio/wav" });
}

/**
 * Encode AudioBuffer to WAV format.
 */
function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;

  // Interleave channels
  const length = buffer.length * numChannels * (bitDepth / 8);
  const outputBuffer = new ArrayBuffer(44 + length);
  const view = new DataView(outputBuffer);

  // WAV header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + length, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
  view.setUint16(32, numChannels * (bitDepth / 8), true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, "data");
  view.setUint32(40, length, true);

  // Write audio data
  const channels: Float32Array[] = [];
  for (let i = 0; i < numChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, channels[channel][i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return outputBuffer;
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

// Helper to convert Blob to base64
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      // Remove data URL prefix (e.g., "data:audio/wav;base64,")
      const base64Data = base64.split(",")[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
