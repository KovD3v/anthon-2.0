"use client";

import { useClerk } from "@clerk/nextjs";
import { Loader2, Trash2, Volume2, VolumeX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface Preferences {
  voiceEnabled: boolean | null;
  tone: string | null;
  mode: string | null;
  language: string | null;
  push: boolean | null;
}

export function PreferencesSection() {
  const { signOut } = useClerk();
  const router = useRouter();
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Fetch preferences on mount
  useEffect(() => {
    async function fetchPreferences() {
      try {
        const response = await fetch("/api/preferences");
        if (response.ok) {
          const data = await response.json();
          setPreferences(data);
        }
      } catch (error) {
        console.error("Error fetching preferences:", error);
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
      console.error("Error updating preference:", error);
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

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      const response = await fetch("/api/user/me", { method: "DELETE" });
      if (!response.ok) throw new Error("Failed to delete account");
      await signOut({ redirectUrl: "/" });
      router.push("/");
    } catch {
      toast.error("Errore nell'eliminazione dell'account");
      setDeleting(false);
    }
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

  return (
    <>
      <Card className="overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm">
        {/* Header */}
        <div className="border-b border-border/50 bg-muted/30 px-6 py-4">
          <h2 className="text-lg font-semibold">Impostazioni</h2>
          <p className="text-sm text-muted-foreground">
            Personalizza il comportamento di Anthon
          </p>
        </div>

        {/* Preferences List */}
        <div className="divide-y divide-border/50">
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
        </div>
      </Card>

      {/* Danger Zone */}
      <Card className="overflow-hidden border-destructive/30 bg-card/50 backdrop-blur-sm">
        <div className="border-b border-destructive/20 bg-destructive/5 px-6 py-4">
          <h2 className="text-lg font-semibold text-destructive">
            Zona pericolosa
          </h2>
          <p className="text-sm text-muted-foreground">
            Azioni irreversibili sull'account
          </p>
        </div>
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Elimina account</p>
            <p className="text-xs text-muted-foreground">
              Elimina definitivamente il tuo account e tutti i dati associati
            </p>
          </div>
          <Button
            variant="destructive"
            size="sm"
            className="gap-2 shrink-0"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={deleting}
          >
            {deleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Elimina account
          </Button>
        </div>
      </Card>

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        onConfirm={handleDeleteAccount}
        title="Eliminare l'account?"
        description="Questa azione è irreversibile. Tutti i tuoi dati, conversazioni e impostazioni verranno eliminati definitivamente."
        confirmText="Sì, elimina"
        cancelText="Annulla"
        variant="destructive"
      />
    </>
  );
}
