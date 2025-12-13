"use client";

import { Pause, Play, VolumeX } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AudioPlayerProps {
  src: string;
  name?: string;
  mimeType?: string;
  className?: string;
}

export function AudioPlayer({
  src,
  name,
  mimeType,
  className,
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  // Convert source to playable URL
  // Handles: blob URLs, data URLs, and raw base64 strings
  const audioSrc = useMemo(() => {
    if (!src) return "";

    // Already a valid URL (blob or data URL)
    if (
      src.startsWith("http") ||
      src.startsWith("blob:") ||
      src.startsWith("data:")
    ) {
      return src;
    }

    // Raw base64 string - convert to data URL
    // Default to audio/wav if no mimeType provided
    const type = mimeType?.split(";")[0] || "audio/wav";
    return `data:${type};base64,${src}`;
  }, [src, mimeType]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioSrc) return;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      setIsLoaded(true);
      setHasError(false);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const handleError = () => {
      console.error("Audio failed to load");
      setHasError(true);
      setIsLoaded(false);
    };

    const handleCanPlay = () => {
      setIsLoaded(true);
      setHasError(false);
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);
    audio.addEventListener("canplay", handleCanPlay);

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      audio.removeEventListener("canplay", handleCanPlay);
    };
  }, [audioSrc]);

  const togglePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(console.error);
    }
    setIsPlaying(!isPlaying);
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newTime = percentage * duration;

    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const formatTime = (time: number) => {
    if (!Number.isFinite(time) || Number.isNaN(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Error state
  if (hasError) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs",
          className,
        )}
      >
        <VolumeX className="h-4 w-4" />
        <span>Audio non riproducibile</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group relative flex items-center gap-3 p-2 pr-4 rounded-2xl overflow-hidden transition-all duration-300",
        "bg-zinc-800 border border-zinc-700 shadow-sm",
        "hover:bg-zinc-750",
        "min-w-[200px]",
        className,
      )}
    >
      {/* biome-ignore lint/a11y/useMediaCaption: User generated audio */}
      <audio ref={audioRef} src={audioSrc} preload="metadata" />

      {/* Play/Pause Button */}
      <Button
        type="button"
        size="icon"
        className={cn(
          "h-10 w-10 shrink-0 rounded-full shadow-md transition-transform duration-200",
          "bg-white text-black hover:bg-zinc-200 hover:scale-105 active:scale-95",
          "flex items-center justify-center focus-visible:ring-1 focus-visible:ring-white",
        )}
        onClick={togglePlayPause}
        disabled={!isLoaded && !hasError}
      >
        {isPlaying ? (
          <Pause className="h-4 w-4 fill-current" />
        ) : (
          <Play className="h-4 w-4 ml-0.5 fill-current" />
        )}
      </Button>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5 py-0.5">
        {/* Progress Bar Container */}
        <div
          className="h-4 flex items-center cursor-pointer group/progress relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full"
          onClick={handleProgressClick}
          role="slider"
          tabIndex={0}
          aria-label="Audio progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          onKeyDown={(e) => {
            const audio = audioRef.current;
            if (!audio) return;
            if (e.key === "ArrowRight") {
              audio.currentTime = Math.min(
                audio.duration,
                audio.currentTime + 5,
              );
            } else if (e.key === "ArrowLeft") {
              audio.currentTime = Math.max(0, audio.currentTime - 5);
            }
          }}
        >
          {/* Background Line */}
          <div className="w-full h-1 bg-zinc-600 rounded-full overflow-hidden">
            {/* Active Progress */}
            <div
              className="h-full bg-white rounded-full transition-all duration-100 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Scrub Handle (Visible on Hover) */}
          <div
            className="absolute h-3 w-3 bg-white rounded-full shadow-sm opacity-0 group-hover/progress:opacity-100 transition-opacity duration-200 pointer-events-none"
            style={{
              left: `${progress}%`,
              transform: "translateX(-50%)",
            }}
          />
        </div>

        {/* Metadata */}
        <div className="flex items-center justify-between gap-2 text-[11px] font-medium leading-none">
          <div className="flex items-center gap-1.5 text-zinc-300 min-w-0">
            <span className="truncate">
              {name ? name.replace(/^recording_\d+\.wav$/, "Vocale") : "Audio"}
            </span>
          </div>
          <span className="text-zinc-500 tabular-nums shrink-0 font-mono tracking-tight text-[10px]">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
      </div>
    </div>
  );
}
