"use client";

import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MemoizedMarkdownProps {
  content: string;
  className?: string;
}

/**
 * Memoized Markdown component to prevent unnecessary re-renders.
 * Only re-renders when the content string actually changes.
 */
export const MemoizedMarkdown = memo(function MemoizedMarkdown({
  content,
  className = "prose prose-sm max-w-none dark:prose-invert prose-p:leading-relaxed prose-pre:bg-black/30 prose-pre:border prose-pre:border-white/10 prose-pre:rounded-xl",
}: MemoizedMarkdownProps) {
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
});
