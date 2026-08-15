"use client";

import { Gauge, Loader2, Volume2, VolumeX } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { reportClientError } from "@/lib/client-error-reporting";

interface Preferences {
  voiceEnabled: boolean | null;
  tone: string | null;
  mode: string | null;
  language: string | null;
  push: boolean | null;
  showTechnicalMetrics: boolean | null;
  effectiveShowTechnicalMetrics: boolean;
}

type WritablePreference = Exclude<
  keyof Preferences,
  "effectiveShowTechnicalMetrics"
>;

const toneOptions = [
  ["direct", "Diretto"],
  ["empathetic", "Empatico"],
  ["technical", "Tecnico"],
  ["motivational", "Motivazionale"],
] as const;

const modeOptions = [
  ["concise", "Conciso"],
  ["elaborate", "Elaborato"],
  ["challenging", "Sfidante"],
  ["supportive", "Supportivo"],
] as const;

const languageOptions = [
  ["it", "Italiano"],
  ["en", "English"],
] as const;

function PreferenceSelect({
  id,
  label,
  description,
  value,
  options,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  value: string | null;
  options: readonly (readonly [string, string])[];
  disabled: boolean;
  onChange: (value: string | null) => void;
}) {
  return (
    <div className="flex flex-col gap-3 px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
      <div className="space-y-1">
        <Label htmlFor={id} className="cursor-pointer text-sm font-medium">
          {label}
        </Label>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      <select
        id={id}
        value={value ?? ""}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value || null)}
        className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:max-w-52"
      >
        <option value="">Automatico</option>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </div>
  );
}

export function PreferencesSection() {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [preferencesLoadError, setPreferencesLoadError] = useState(false);
  const [updating, setUpdating] = useState(false);

  // Fetch preferences on mount
  useEffect(() => {
    async function fetchPreferences() {
      try {
        const response = await fetch("/api/preferences");
        if (response.ok) {
          const data = await response.json();
          setPreferences(data);
          setPreferencesLoadError(false);
        } else {
          setPreferencesLoadError(true);
        }
      } catch (error) {
        reportClientError(error, { source: "profile.fetch_preferences" });
        setPreferencesLoadError(true);
        toast.error("Errore nel caricamento delle preferenze");
      } finally {
        setLoading(false);
      }
    }

    fetchPreferences();
  }, []);

  // Update a preference
  const updatePreference = async (
    key: WritablePreference,
    value: boolean | string | null,
  ) => {
    setUpdating(true);
    try {
      const response = await fetch("/api/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });

      if (response.ok) {
        const data = await response.json();
        setPreferences(data);
        toast.success("Preferenza aggiornata");
      } else {
        toast.error("Errore nell'aggiornamento");
      }
    } catch (error) {
      reportClientError(error, { source: "profile.update_preference" });
      toast.error("Errore nell'aggiornamento");
    } finally {
      setUpdating(false);
    }
  };

  // Handle voice toggle
  const handleVoiceToggle = (checked: boolean) => {
    // Note: checked = true means "Don't send audio" is ON, so voiceEnabled = false
    updatePreference("voiceEnabled", !checked);
  };

  const handleTechnicalMetricsToggle = (checked: boolean) => {
    updatePreference("showTechnicalMetrics", checked);
  };

  if (loading) {
    return (
      <div className="px-6 py-8">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // "Don't send audio" should be ON when voiceEnabled is false
  const dontSendAudio = preferences?.voiceEnabled === false;
  const showTechnicalMetrics =
    preferences?.effectiveShowTechnicalMetrics ?? false;
  const tone = preferences?.tone ?? null;
  const mode = preferences?.mode ?? null;
  const language = preferences?.language?.toLowerCase() ?? null;

  return (
    <section>
      <div className="px-6 pb-5 pt-8 sm:px-8 sm:pt-10">
        <h2 className="font-display text-3xl font-bold uppercase leading-none tracking-tight">
          Come risponde Anthon
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Personalizza tono, voce e dettagli delle risposte.
        </p>
      </div>

      <div className="divide-y divide-border/70">
        <PreferenceSelect
          id="tone-preference"
          label="Tono di Anthon"
          description="Scegli la qualità emotiva con cui Anthon ti risponde."
          value={tone}
          options={toneOptions}
          disabled={updating}
          onChange={(value) => updatePreference("tone", value)}
        />
        <PreferenceSelect
          id="mode-preference"
          label="Stile delle risposte"
          description="Decidi se preferisci risposte brevi, ampie o più sfidanti."
          value={mode}
          options={modeOptions}
          disabled={updating}
          onChange={(value) => updatePreference("mode", value)}
        />
        <PreferenceSelect
          id="language-preference"
          label="Lingua delle risposte"
          description="Imposta la lingua preferita quando il contesto è disponibile."
          value={language}
          options={languageOptions}
          disabled={updating}
          onChange={(value) =>
            updatePreference("language", value ? value.toUpperCase() : null)
          }
        />
        <div className="flex items-center justify-between gap-4 px-6 py-5 transition-colors hover:bg-muted/20 sm:px-8">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
              {dontSendAudio ? (
                <VolumeX className="h-5 w-5" />
              ) : (
                <Volume2 className="h-5 w-5" />
              )}
            </div>
            <div className="space-y-0.5">
              <Label
                htmlFor="voice-toggle"
                className="text-sm font-medium cursor-pointer"
              >
                Non mandare audio
              </Label>
              <p className="text-xs text-muted-foreground">
                Anthon risponderà solo con messaggi di testo
              </p>
            </div>
          </div>
          <Switch
            id="voice-toggle"
            checked={dontSendAudio}
            onCheckedChange={handleVoiceToggle}
            disabled={updating}
            aria-label="Disabilita messaggi audio"
          />
        </div>

        <div className="flex items-center justify-between gap-4 px-6 py-5 transition-colors hover:bg-muted/20 sm:px-8">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
              <Gauge className="h-5 w-5" />
            </div>
            <div className="space-y-0.5">
              <Label
                htmlFor="technical-metrics-toggle"
                className="text-sm font-medium cursor-pointer"
              >
                Mostra dettagli tecnici delle risposte
              </Label>
              <p className="text-xs text-muted-foreground">
                {preferencesLoadError
                  ? "Impossibile caricare questa preferenza."
                  : "Visualizza tempi e metriche nelle tue conversazioni private"}
              </p>
            </div>
          </div>
          <Switch
            id="technical-metrics-toggle"
            checked={showTechnicalMetrics}
            onCheckedChange={handleTechnicalMetricsToggle}
            disabled={updating || preferences === null}
            aria-label="Mostra dettagli tecnici delle risposte"
          />
        </div>
      </div>
    </section>
  );
}
