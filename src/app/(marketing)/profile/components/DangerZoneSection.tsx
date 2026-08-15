"use client";

import { useClerk } from "@clerk/nextjs";
import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
    <>
      <section className="border-t border-destructive/25 bg-destructive/[0.035] px-5 py-7 sm:px-8 sm:py-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold uppercase tracking-tight text-destructive">
              Elimina account
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Cancella definitivamente conversazioni, impostazioni e dati
              personali. Non potrai annullare questa operazione.
            </p>
          </div>
          <Button
            type="button"
            variant="destructive"
            className="min-h-11 w-full shrink-0 gap-2 sm:w-auto"
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
      </section>

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
