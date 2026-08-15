"use client";

import { useClerk } from "@clerk/nextjs";
import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function DangerZoneSection() {
  const { signOut } = useClerk();
  const router = useRouter();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  return (
    <Card className="overflow-hidden border-destructive/30 bg-card/70 shadow-none">
      <div className="border-b border-destructive/20 bg-destructive/5 px-6 py-5">
        <p className="font-mono text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-destructive">
          Irreversibile
        </p>
        <h2 className="mt-2 font-display text-2xl font-bold uppercase tracking-tight text-destructive">
          Zona pericolosa
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Azioni definitive sull&apos;account e sui dati associati.
        </p>
      </div>
      <div className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">Elimina account</p>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
            Elimina definitivamente conversazioni, impostazioni e dati
            personali. Questa azione non può essere annullata.
          </p>
        </div>
        <Button
          type="button"
          variant="destructive"
          className="min-h-11 shrink-0 gap-2"
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
    </Card>
  );
}
