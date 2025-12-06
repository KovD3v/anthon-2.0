"use client";

import {
  Download,
  ExternalLink,
  File,
  FileCode,
  FileText,
  Image as ImageIcon,
  Loader2,
  X,
} from "lucide-react";
import NextImage from "next/image";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AttachmentData {
  id: string;
  name: string;
  contentType: string;
  size: number;
  url: string;
}

interface AttachmentPreviewProps {
  attachment: AttachmentData;
  onRemove?: () => void;
  className?: string;
}

/**
 * Displays an attachment with preview (for images) or icon
 */
export function AttachmentPreview({
  attachment,
  onRemove,
  className,
}: AttachmentPreviewProps) {
  const [imageError, setImageError] = useState(false);
  const isImage = attachment.contentType.startsWith("image/") && !imageError;

  return (
    <div
      className={cn(
        "relative flex items-center gap-2 rounded-lg border bg-card p-2",
        className,
      )}
    >
      {isImage ? (
        <div className="relative h-12 w-12 overflow-hidden rounded">
          <NextImage
            src={attachment.url}
            alt={attachment.name}
            fill
            className="object-cover"
            onError={() => setImageError(true)}
          />
        </div>
      ) : (
        <div className="flex h-12 w-12 items-center justify-center rounded bg-muted">
          {getFileIcon(attachment.contentType)}
        </div>
      )}

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{attachment.name}</p>
        <p className="text-xs text-muted-foreground">
          {formatFileSize(attachment.size)}
        </p>
      </div>

      <div className="flex items-center gap-1">
        <a
          href={attachment.url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="Open in new tab"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
        <a
          href={attachment.url}
          download={attachment.name}
          className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="Download"
        >
          <Download className="h-4 w-4" />
        </a>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
            title="Remove"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

interface AttachmentUploaderProps {
  chatId: string;
  onUpload: (attachment: AttachmentData) => void;
  onError?: (error: string) => void;
  className?: string;
}

/**
 * File upload dropzone
 */
export function AttachmentUploader({
  chatId,
  onUpload,
  onError,
  className,
}: AttachmentUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files[0];
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("chatId", chatId);

      const response = await fetch("/api/chat/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Upload failed");
      }

      const attachment = await response.json();
      onUpload(attachment);
    } catch (err) {
      console.error("Upload error:", err);
      onError?.(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleUpload(e.dataTransfer.files);
  };

  return (
    <label
      className={cn(
        "relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 transition-colors",
        isDragging
          ? "border-primary bg-primary/5"
          : "border-muted-foreground/25 hover:border-muted-foreground/50",
        isUploading && "pointer-events-none opacity-50",
        className,
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        type="file"
        className="sr-only"
        onChange={(e) => handleUpload(e.target.files)}
        disabled={isUploading}
      />

      {isUploading ? (
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      ) : (
        <>
          <File className="h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            Drop a file here or click to upload
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Max 10MB • Images, PDFs, and documents
          </p>
        </>
      )}
    </label>
  );
}

/**
 * Compact attachment button for the chat input
 */
export function AttachmentButton({
  onClick,
  hasAttachment,
  className,
}: {
  onClick: () => void;
  hasAttachment?: boolean;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={onClick}
      className={cn(
        "h-10 w-10 shrink-0 text-muted-foreground",
        hasAttachment && "text-primary",
        className,
      )}
      title="Attach file"
    >
      <File className="h-5 w-5" />
    </Button>
  );
}

/**
 * Compact attachment preview for displaying in messages
 */
export function AttachmentChip({
  attachment,
  className,
}: {
  attachment: AttachmentData;
  className?: string;
}) {
  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-2.5 py-1 text-xs transition-colors hover:bg-muted",
        className,
      )}
    >
      {getFileIcon(attachment.contentType, "h-3 w-3")}
      <span className="max-w-[150px] truncate">{attachment.name}</span>
    </a>
  );
}

/**
 * Get appropriate icon for file type
 */
function getFileIcon(
  contentType: string,
  className = "h-5 w-5 text-muted-foreground",
) {
  if (contentType.startsWith("image/")) {
    return <ImageIcon className={className} />;
  }
  if (contentType === "application/pdf") {
    return <FileText className={className} />;
  }
  if (
    contentType.includes("javascript") ||
    contentType.includes("typescript") ||
    contentType === "application/json" ||
    contentType.includes("html") ||
    contentType.includes("css")
  ) {
    return <FileCode className={className} />;
  }
  return <File className={className} />;
}

/**
 * Format file size to human-readable string
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}
