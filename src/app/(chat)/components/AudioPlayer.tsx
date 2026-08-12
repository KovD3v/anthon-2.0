"use client";

import { Pause, Play, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AudioPlayerProps {
  src: string;
  name?: string;
  mimeType?: string;
  className?: string;
  variant?: "default" | "composer";
}

export function AudioPlayer({
  src,
  name,
  mimeType,
  className,
  variant = "default",
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressTrackRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [progressTrackWidth, setProgressTrackWidth] = useState(0);

  useEffect(() => {
    const track = progressTrackRef.current;
    if (!track) return;

    const updateTrackWidth = () => setProgressTrackWidth(track.clientWidth);
    updateTrackWidth();

    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(updateTrackWidth);
    observer.observe(track);
    return () => observer.disconnect();
  }, []);

  // Convert source to playable URL
  // Handles: blob URLs, data URLs, and raw base64 strings
  const audioSrc = (() => {
    if (!src) return "";

    if (
      src.startsWith("http") ||
      src.startsWith("/") ||
      src.startsWith("blob:") ||
      src.startsWith("data:")
    ) {
      return src;
    }

    const type = mimeType?.split(";")[0] || "audio/wav";
    return `data:${type};base64,${src}`;
  })();

  useEffect(() => {
    const audio = audioRef.current;
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setIsLoaded(false);
    setHasError(!audioSrc);

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
      setIsPlaying(false);
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

  const togglePlayPause = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      try {
        await audio.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
        setHasError(true);
        setIsLoaded(false);
      }
    }
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
  const isComposer = variant === "composer";

  // Error state
  if (hasError) {
    return (
      <output
        className={cn(
          "flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive",
          isComposer && "min-w-0 flex-1 border-0 bg-transparent px-2",
          className,
        )}
      >
        <VolumeX className="h-4 w-4" />
        <span className="truncate">
          {isComposer
            ? "Audio non disponibile"
            : "Audio non disponibile. Puoi leggere la trascrizione qui sotto."}
        </span>
      </output>
    );
  }

  return (
    <div
      className={cn(
        "group relative flex items-center overflow-hidden transition-[background-color,border-color,box-shadow] duration-200",
        isComposer
          ? "min-w-0 gap-3 rounded-full px-1 py-0.5"
          : "min-w-[200px] gap-2 rounded-2xl border border-zinc-700 bg-zinc-800 p-2 pr-4 shadow-sm hover:bg-zinc-750",
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
          "flex shrink-0 items-center justify-center rounded-full transition-[background-color,color,transform] duration-200 motion-reduce:transition-none motion-reduce:active:scale-100",
          isComposer
            ? isPlaying
              ? "h-9 w-9 bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 focus-visible:ring-1 focus-visible:ring-primary active:scale-95"
              : "h-9 w-9 border border-primary/25 bg-primary/10 text-primary shadow-none hover:bg-primary/20 focus-visible:ring-1 focus-visible:ring-primary active:scale-95"
            : "h-10 w-10 bg-white text-black shadow-md hover:bg-zinc-200 focus-visible:ring-1 focus-visible:ring-white [@media(hover:hover)_and_(pointer:fine)_and_(prefers-reduced-motion:no-preference)]:hover:scale-105 active:scale-95",
        )}
        onClick={togglePlayPause}
        disabled={!isLoaded && !hasError}
        aria-label={isPlaying ? "Metti in pausa" : "Riproduci audio"}
      >
        {isPlaying ? (
          <Pause className="h-4 w-4 fill-current" />
        ) : (
          <Play className="h-4 w-4 ml-0.5 fill-current" />
        )}
      </Button>

      {/* Content */}
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col justify-center py-0.5",
          isComposer ? "gap-1" : "gap-1.5",
        )}
      >
        {/* Progress Bar Container */}
        <div
          ref={progressTrackRef}
          className={cn(
            "group/progress relative flex cursor-pointer items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            isComposer ? "h-3" : "h-4",
          )}
          onClick={handleProgressClick}
          role="slider"
          tabIndex={0}
          aria-label="Avanzamento audio"
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
          <div
            className={cn(
              "w-full overflow-hidden rounded-full",
              isComposer ? "h-0.5 bg-border" : "h-1 bg-zinc-600",
            )}
          >
            {/* Active Progress */}
            <div
              className={cn(
                "h-full origin-left rounded-full transition-transform duration-100 ease-linear",
                isComposer ? "bg-primary" : "bg-white",
              )}
              style={{ transform: `scaleX(${progress / 100})` }}
            />
          </div>

          {/* Scrub Handle (Visible on Hover) */}
          <div
            className={cn(
              "pointer-events-none absolute rounded-full opacity-0 shadow-sm transition-opacity duration-200 group-hover/progress:opacity-100",
              isComposer ? "h-2 w-2 bg-primary" : "h-3 w-3 bg-white",
            )}
            style={{
              left: 0,
              transform: `translateX(${Math.max(0, progressTrackWidth - (isComposer ? 8 : 12)) * (progress / 100)}px)`,
            }}
          />
        </div>

        {/* Metadata */}
        <div className="flex items-center justify-between gap-2 text-[11px] font-medium leading-none">
          <div
            className={cn(
              "flex min-w-0 items-center gap-1.5",
              isComposer ? "text-foreground/70" : "text-zinc-300",
            )}
          >
            <span
              className={cn(
                "truncate",
                isComposer &&
                  "text-[9px] font-semibold uppercase tracking-[0.14em]",
              )}
            >
              {name ? name.replace(/^recording_\d+\.wav$/, "Vocale") : "Audio"}
            </span>
          </div>
          <span
            className={cn(
              "shrink-0 font-mono text-[10px] tabular-nums tracking-tight",
              isComposer ? "text-muted-foreground/60" : "text-zinc-500",
            )}
          >
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
      </div>
    </div>
  );
}
