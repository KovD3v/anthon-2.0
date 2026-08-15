"use client";

import { Gauge, Loader2, Volume2, VolumeX } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
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
  const updatePreference = async (key: keyof Preferences, value: unknown) => {
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
      <Card className="p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </Card>
    );
  }

  // "Don't send audio" should be ON when voiceEnabled is false
  const dontSendAudio = preferences?.voiceEnabled === false;
  const showTechnicalMetrics =
    preferences?.effectiveShowTechnicalMetrics ?? false;

  return (
    <Card className="overflow-hidden border-border/70 bg-card/70 shadow-none">
      {/* Header */}
      <div className="border-b border-border/70 bg-muted/25 px-6 py-5">
        <h2 className="font-display text-2xl font-bold uppercase tracking-tight">
          Come risponde Anthon
        </h2>
        <p className="text-sm text-muted-foreground">
          Personalizza tono, voce e dettagli delle risposte.
        </p>
      </div>

      {/* Preferences List */}
      <div className="divide-y divide-border/70">
        {/* Voice Preference */}
        <div className="flex items-center justify-between px-6 py-4 transition-colors hover:bg-muted/20">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/10">
              {dontSendAudio ? (
                <VolumeX className="h-5 w-5 text-orange-500" />
              ) : (
                <Volume2 className="h-5 w-5 text-orange-500" />
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

        <div className="flex items-center justify-between px-6 py-4 transition-colors hover:bg-muted/20">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
              <Gauge className="h-5 w-5 text-blue-500" />
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
    </Card>
  );
}
