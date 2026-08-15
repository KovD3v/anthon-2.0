"use client";

import { useUser } from "@clerk/nextjs";
import { Loader2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { reportClientError } from "@/lib/client-error-reporting";

function getProviderName(account: {
  providerTitle?: () => string;
  provider?: string;
}) {
  if (account.providerTitle) return account.providerTitle();
  return account.provider
    ? account.provider.charAt(0).toUpperCase() + account.provider.slice(1)
    : "Provider esterno";
}

export function ConnectedAccountsSection() {
  const { isLoaded, user } = useUser();
  const [accounts, setAccounts] = useState(user?.externalAccounts ?? []);
  const [removingAccount, setRemovingAccount] = useState<
    (typeof accounts)[number] | null
  >(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (user) setAccounts(user.externalAccounts);
  }, [user]);

  if (!isLoaded) {
    return (
      <output
        aria-label="Caricamento account collegati"
        className="flex min-h-48 items-center justify-center"
      >
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="sr-only">Caricamento account collegati</span>
      </output>
    );
  }

  if (!user) {
    return (
      <div className="p-6" role="alert">
        Impossibile caricare gli account collegati.
      </div>
    );
  }

  const handleRemove = async () => {
    if (!removingAccount) return;
    const accountToRemove = removingAccount;
    setRemoving(true);

    try {
      await accountToRemove.destroy();
      setAccounts((current) =>
        current.filter((account) => account.id !== accountToRemove.id),
      );
      setRemovingAccount(null);
      toast.success("Account scollegato");
    } catch (error) {
      reportClientError(error, { source: "profile.remove_external_account" });
      toast.error("Impossibile scollegare l'account");
    } finally {
      setRemoving(false);
    }
  };

  return (
    <section>
      <div className="px-6 pb-5 pt-8 sm:px-8 sm:pt-10">
        <h2 className="font-display text-3xl font-bold uppercase leading-none tracking-tight">
          Account collegati
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          I provider esterni associati al tuo accesso Anthon.
        </p>
      </div>

      {accounts.length === 0 ? (
        <div className="px-6 pb-8 pt-3 sm:px-8">
          <p className="text-sm font-medium">Nessun account collegato</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            I provider esterni disponibili possono essere collegati durante il
            prossimo accesso.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border/70">
          {accounts.map((account) => {
            const providerName = getProviderName(account);
            const verified = account.verification?.status === "verified";
            const canRemove = typeof account.destroy === "function";

            return (
              <div
                key={account.id}
                className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 font-display font-bold text-primary">
                    {providerName.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{providerName}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {account.emailAddress}
                    </p>
                    <p
                      className={
                        verified
                          ? "mt-1 text-xs text-emerald-700 dark:text-emerald-400"
                          : "mt-1 text-xs text-amber-700 dark:text-amber-400"
                      }
                    >
                      {verified ? "Verificato" : "Da verificare"}
                    </p>
                  </div>
                </div>
                {canRemove ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-11 shrink-0 gap-2 self-start text-muted-foreground hover:text-destructive sm:self-auto"
                    aria-label={`Rimuovi ${providerName}`}
                    disabled={removing}
                    onClick={() => setRemovingAccount(account)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Rimuovi
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(removingAccount)}
        onOpenChange={(open) => {
          if (!open && !removing) setRemovingAccount(null);
        }}
        onConfirm={handleRemove}
        title="Scollegare l'account?"
        description="Dovrai usare un altro metodo di accesso collegato per entrare in Anthon."
        confirmText="Sì, rimuovi"
        cancelText="Annulla"
        variant="destructive"
      />
    </section>
  );
}
