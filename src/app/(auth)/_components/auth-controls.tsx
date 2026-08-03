"use client";

import { Eye, EyeOff, Loader2 } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function AuthField({
  label,
  error,
  hint,
  ...props
}: ComponentProps<typeof Input> & {
  label: string;
  error?: string | null;
  hint?: string;
}) {
  const errorId = error ? `${props.id}-error` : undefined;
  const hintId = hint ? `${props.id}-hint` : undefined;

  return (
    <div className="space-y-2">
      <Label htmlFor={props.id}>{label}</Label>
      <Input
        {...props}
        className={cn("h-11 bg-background px-3.5", props.className)}
        aria-invalid={Boolean(error)}
        aria-describedby={
          [errorId, hintId].filter(Boolean).join(" ") || undefined
        }
      />
      {hint ? (
        <p
          id={hintId}
          className="text-xs leading-relaxed text-muted-foreground"
        >
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function PasswordField(
  props: Omit<ComponentProps<typeof AuthField>, "type">,
) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="relative">
      <AuthField
        {...props}
        type={isVisible ? "text" : "password"}
        className={cn("pr-12", props.className)}
      />
      <button
        type="button"
        onClick={() => setIsVisible((current) => !current)}
        className="absolute right-1 top-[1.7rem] flex size-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
        aria-label={isVisible ? "Nascondi password" : "Mostra password"}
      >
        {isVisible ? (
          <EyeOff className="size-4" aria-hidden="true" />
        ) : (
          <Eye className="size-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

export function VerificationCodeField({
  error,
  ...props
}: Omit<ComponentProps<typeof AuthField>, "label" | "inputMode">) {
  return (
    <AuthField
      {...props}
      label="Codice di verifica"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={8}
      error={error}
      className="font-mono text-lg tracking-[0.22em]"
    />
  );
}

export function AuthSubmitButton({
  children,
  loading,
  ...props
}: ComponentProps<typeof Button> & {
  children: ReactNode;
  loading?: boolean;
}) {
  return (
    <Button
      {...props}
      className={cn("h-11 w-full font-semibold", props.className)}
      disabled={loading || props.disabled}
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : null}
      {children}
    </Button>
  );
}

export function AuthErrorSummary({ message }: { message?: string | null }) {
  if (!message) return null;

  return (
    <div
      className="rounded-lg bg-destructive/10 px-3.5 py-3 text-sm leading-relaxed text-destructive"
      role="alert"
      aria-live="polite"
    >
      {message}
    </div>
  );
}

export function AuthDivider() {
  return (
    <div className="flex items-center gap-3 py-1" aria-hidden="true">
      <div className="h-px flex-1 bg-border" />
      <span className="text-xs text-muted-foreground">oppure</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
