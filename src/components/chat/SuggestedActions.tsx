"use client";

import { useState } from "react";
import {
  Lightbulb,
  Code,
  FileText,
  Sparkles,
  HelpCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface SuggestedAction {
  id: string;
  label: string;
  prompt: string;
  icon?: "lightbulb" | "code" | "document" | "sparkles" | "help";
  category?: string;
}

interface SuggestedActionsProps {
  /**
   * Called when user selects a suggestion
   */
  onSelect: (prompt: string) => void;
  /**
   * Custom suggestions to display. If not provided, uses defaults.
   */
  suggestions?: SuggestedAction[];
  /**
   * Context from the conversation (e.g., last assistant message)
   * Used to generate contextual suggestions
   */
  context?: string;
  /**
   * Whether to show as a compact pill list or full cards
   */
  variant?: "pills" | "cards";
  /**
   * Optional class name
   */
  className?: string;
}

/**
 * Default coaching-focused suggestions
 */
const DEFAULT_SUGGESTIONS: SuggestedAction[] = [
  {
    id: "clarify",
    label: "Help me understand this better",
    prompt:
      "Can you explain that in simpler terms? I'd like to understand the core concept better.",
    icon: "help",
    category: "Understanding",
  },
  {
    id: "example",
    label: "Give me an example",
    prompt: "Can you give me a concrete example of how this works in practice?",
    icon: "lightbulb",
    category: "Learning",
  },
  {
    id: "action",
    label: "What should I do next?",
    prompt:
      "Based on what we discussed, what specific action should I take next?",
    icon: "sparkles",
    category: "Action",
  },
  {
    id: "deeper",
    label: "Go deeper on this topic",
    prompt:
      "I'd like to explore this topic more deeply. What aspects should I consider?",
    icon: "document",
    category: "Exploration",
  },
];

/**
 * Code-specific suggestions (shown after code-related responses)
 */
const CODE_SUGGESTIONS: SuggestedAction[] = [
  {
    id: "explain-code",
    label: "Explain this code",
    prompt: "Can you walk me through this code step by step?",
    icon: "code",
    category: "Code",
  },
  {
    id: "improve-code",
    label: "How can I improve this?",
    prompt: "What improvements or best practices could I apply to this code?",
    icon: "sparkles",
    category: "Code",
  },
  {
    id: "test-code",
    label: "Help me test this",
    prompt: "How should I test this code? What test cases should I consider?",
    icon: "help",
    category: "Testing",
  },
];

/**
 * Displays suggested actions/prompts for the user
 */
export function SuggestedActions({
  onSelect,
  suggestions,
  context,
  variant = "pills",
  className,
}: SuggestedActionsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Determine which suggestions to show
  const activeSuggestions = suggestions ?? getContextualSuggestions(context);

  // For pills variant, show limited items unless expanded
  const displayedSuggestions =
    variant === "pills" && !isExpanded
      ? activeSuggestions.slice(0, 3)
      : activeSuggestions;

  const hasMore = activeSuggestions.length > 3;

  if (variant === "cards") {
    return (
      <div className={cn("grid gap-2 sm:grid-cols-2", className)}>
        {displayedSuggestions.map((suggestion) => (
          <SuggestionCard
            key={suggestion.id}
            suggestion={suggestion}
            onClick={() => onSelect(suggestion.prompt)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {displayedSuggestions.map((suggestion) => (
        <SuggestionPill
          key={suggestion.id}
          suggestion={suggestion}
          onClick={() => onSelect(suggestion.prompt)}
        />
      ))}
      {hasMore && variant === "pills" && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? (
            <>
              <ChevronUp className="mr-1 h-3 w-3" />
              Less
            </>
          ) : (
            <>
              <ChevronDown className="mr-1 h-3 w-3" />
              More
            </>
          )}
        </Button>
      )}
    </div>
  );
}

/**
 * Pill-style suggestion button
 */
function SuggestionPill({
  suggestion,
  onClick,
}: {
  suggestion: SuggestedAction;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted hover:border-primary/50"
    >
      {getIcon(suggestion.icon, "h-3 w-3")}
      <span>{suggestion.label}</span>
    </button>
  );
}

/**
 * Card-style suggestion
 */
function SuggestionCard({
  suggestion,
  onClick,
}: {
  suggestion: SuggestedAction;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-start gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted hover:border-primary/50"
    >
      <span className="mt-0.5 text-primary">
        {getIcon(suggestion.icon, "h-4 w-4")}
      </span>
      <div className="flex-1">
        <p className="text-sm font-medium">{suggestion.label}</p>
        {suggestion.category && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {suggestion.category}
          </p>
        )}
      </div>
    </button>
  );
}

/**
 * Get icon component based on icon name
 */
function getIcon(icon: SuggestedAction["icon"], className: string) {
  switch (icon) {
    case "lightbulb":
      return <Lightbulb className={className} />;
    case "code":
      return <Code className={className} />;
    case "document":
      return <FileText className={className} />;
    case "sparkles":
      return <Sparkles className={className} />;
    case "help":
      return <HelpCircle className={className} />;
    default:
      return <Lightbulb className={className} />;
  }
}

/**
 * Get contextual suggestions based on conversation context
 */
function getContextualSuggestions(context?: string): SuggestedAction[] {
  if (!context) return DEFAULT_SUGGESTIONS;

  // Check for code-related context
  const codeIndicators = [
    "```",
    "function",
    "const ",
    "let ",
    "import ",
    "class ",
    "def ",
    "export ",
  ];

  const hasCode = codeIndicators.some((indicator) =>
    context.toLowerCase().includes(indicator.toLowerCase())
  );

  if (hasCode) {
    return CODE_SUGGESTIONS;
  }

  return DEFAULT_SUGGESTIONS;
}

/**
 * Compact suggestion list for use in chat footer
 */
export function QuickSuggestions({
  onSelect,
  context,
  className,
}: {
  onSelect: (prompt: string) => void;
  context?: string;
  className?: string;
}) {
  const suggestions = getContextualSuggestions(context).slice(0, 3);

  return (
    <div className={cn("flex gap-1.5 overflow-x-auto py-1", className)}>
      {suggestions.map((suggestion) => (
        <button
          key={suggestion.id}
          type="button"
          onClick={() => onSelect(suggestion.prompt)}
          className="shrink-0 rounded-lg border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {suggestion.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Welcome suggestions for empty chat state
 */
export function WelcomeSuggestions({
  onSelect,
  className,
}: {
  onSelect: (prompt: string) => void;
  className?: string;
}) {
  const welcomeSuggestions: SuggestedAction[] = [
    {
      id: "intro",
      label: "Tell me about yourself",
      prompt: "What can you help me with? Tell me about your capabilities.",
      icon: "sparkles",
      category: "Getting Started",
    },
    {
      id: "goals",
      label: "Help me set goals",
      prompt:
        "I'd like help setting and achieving my goals. Where should I start?",
      icon: "lightbulb",
      category: "Goal Setting",
    },
    {
      id: "learn",
      label: "Help me learn something new",
      prompt:
        "I want to learn something new. What topics or skills would you recommend?",
      icon: "document",
      category: "Learning",
    },
    {
      id: "problem",
      label: "Help me solve a problem",
      prompt:
        "I'm facing a challenge and could use some guidance on how to approach it.",
      icon: "help",
      category: "Problem Solving",
    },
  ];

  return (
    <div className={cn("grid gap-3 sm:grid-cols-2", className)}>
      {welcomeSuggestions.map((suggestion) => (
        <SuggestionCard
          key={suggestion.id}
          suggestion={suggestion}
          onClick={() => onSelect(suggestion.prompt)}
        />
      ))}
    </div>
  );
}
