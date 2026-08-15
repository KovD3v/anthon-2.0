"use client";

import { useUser } from "@clerk/nextjs";
import { KeyRound, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { reportClientError } from "@/lib/client-error-reporting";

function StatusPill({
  active,
  children,
}: {
  active: boolean;
  children: string;
}) {
  return (
    <span
      className={
        active
          ? "inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400"
          : "inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground"
      }
    >
      <span
        aria-hidden="true"
        className={
          active
            ? "h-1.5 w-1.5 rounded-full bg-current"
            : "h-1.5 w-1.5 rounded-full bg-current/50"
        }
      />
      {children}
    </span>
  );
}

export function SecuritySection() {
  const { isLoaded, user } = useUser();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [signOutOtherSessions, setSignOutOtherSessions] = useState(true);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passkeys, setPasskeys] = useState(user?.passkeys ?? []);
  const [creatingPasskey, setCreatingPasskey] = useState(false);
  const [deletingPasskey, setDeletingPasskey] = useState<
    (typeof passkeys)[number] | null
  >(null);
  const [totpEnabled, setTotpEnabled] = useState(user?.totpEnabled ?? false);
  const [backupCodeEnabled, setBackupCodeEnabled] = useState(
    user?.backupCodeEnabled ?? false,
  );
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(
    user?.twoFactorEnabled ?? false,
  );
  const [totpSetup, setTotpSetup] = useState<{
    secret?: string;
    uri?: string;
    backupCodes?: string[];
  } | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [creatingTotp, setCreatingTotp] = useState(false);
  const [verifyingTotp, setVerifyingTotp] = useState(false);

  useEffect(() => {
    if (!user) return;
    setPasskeys(user.passkeys);
    setTotpEnabled(user.totpEnabled);
    setBackupCodeEnabled(user.backupCodeEnabled);
    setTwoFactorEnabled(user.twoFactorEnabled);
  }, [user]);

  if (!isLoaded) {
    return (
      <output
        aria-label="Caricamento sicurezza"
        className="flex min-h-48 items-center justify-center"
      >
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="sr-only">Caricamento sicurezza</span>
      </output>
    );
  }

  if (!user) {
    return (
      <div className="p-6" role="alert">
        Impossibile caricare le impostazioni di sicurezza.
      </div>
    );
  }

  const handlePasswordSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    setPasswordError(null);

    if (!newPassword.trim()) {
      setPasswordError("Inserisci una nuova password.");
      return;
    }
    if (newPassword !== passwordConfirmation) {
      setPasswordError("Le password non coincidono.");
      return;
    }

    setSavingPassword(true);
    try {
      await user.updatePassword({
        currentPassword: currentPassword || undefined,
        newPassword,
        signOutOfOtherSessions: signOutOtherSessions,
      });
      setCurrentPassword("");
      setNewPassword("");
      setPasswordConfirmation("");
      toast.success("Password aggiornata");
    } catch (error) {
      reportClientError(error, { source: "profile.update_password" });
      toast.error("Impossibile aggiornare la password");
    } finally {
      setSavingPassword(false);
    }
  };

  const handleCreatePasskey = async () => {
    setCreatingPasskey(true);
    try {
      const passkey = await user.createPasskey();
      setPasskeys((current) => [
        ...current.filter((item) => item.id !== passkey.id),
        passkey,
      ]);
      toast.success("Passkey aggiunta");
    } catch (error) {
      reportClientError(error, { source: "profile.create_passkey" });
      toast.error("Impossibile aggiungere la passkey");
    } finally {
      setCreatingPasskey(false);
    }
  };

  const handleDeletePasskey = async () => {
    if (!deletingPasskey) return;

    try {
      await deletingPasskey.delete();
      setPasskeys((current) =>
        current.filter((item) => item.id !== deletingPasskey.id),
      );
      setDeletingPasskey(null);
      toast.success("Passkey rimossa");
    } catch (error) {
      reportClientError(error, { source: "profile.delete_passkey" });
      toast.error("Impossibile rimuovere la passkey");
    }
  };

  const handleCreateTotp = async () => {
    setCreatingTotp(true);
    try {
      const setup = await user.createTOTP();
      setTotpSetup(setup);
      toast.success("Configurazione a due fattori pronta");
    } catch (error) {
      reportClientError(error, { source: "profile.create_totp" });
      toast.error("Impossibile configurare la verifica a due fattori");
    } finally {
      setCreatingTotp(false);
    }
  };

  const handleVerifyTotp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!totpCode.trim()) return;

    setVerifyingTotp(true);
    try {
      const verified = await user.verifyTOTP({ code: totpCode.trim() });
      setTotpEnabled(true);
      setTwoFactorEnabled(true);
      setBackupCodeEnabled(Boolean(verified.backupCodes?.length));
      setTotpSetup(verified);
      setTotpCode("");
      toast.success("Verifica a due fattori attivata");
    } catch (error) {
      reportClientError(error, { source: "profile.verify_totp" });
      toast.error("Codice non valido");
    } finally {
      setVerifyingTotp(false);
    }
  };

  return (
    <div className="divide-y divide-border/70">
      <section>
        <div className="px-6 pb-4 pt-8 sm:px-8 sm:pt-10">
          <h2 className="font-display text-3xl font-bold uppercase leading-none tracking-tight">
            Password
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Aggiorna la password del tuo account.
          </p>
        </div>

        {user.passwordEnabled ? (
          <form
            className="space-y-5 px-6 pb-8 pt-3 sm:px-8"
            onSubmit={handlePasswordSubmit}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="current-password">Password attuale</Label>
                <Input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">Nuova password</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  aria-invalid={Boolean(passwordError)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-new-password">
                  Conferma nuova password
                </Label>
                <Input
                  id="confirm-new-password"
                  type="password"
                  autoComplete="new-password"
                  value={passwordConfirmation}
                  onChange={(event) =>
                    setPasswordConfirmation(event.target.value)
                  }
                  aria-invalid={Boolean(passwordError)}
                />
              </div>
            </div>

            {passwordError ? (
              <p className="text-sm text-destructive" role="alert">
                {passwordError}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border/70 pt-4">
              <Label
                htmlFor="sign-out-other-sessions"
                className="min-h-11 cursor-pointer gap-3 text-sm text-muted-foreground"
              >
                <input
                  id="sign-out-other-sessions"
                  type="checkbox"
                  checked={signOutOtherSessions}
                  onChange={(event) =>
                    setSignOutOtherSessions(event.target.checked)
                  }
                  className="h-4 w-4 accent-primary"
                />
                Termina le altre sessioni
              </Label>
              <Button
                type="submit"
                className="min-h-11 gap-2"
                disabled={savingPassword}
              >
                {savingPassword ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                Salva password
              </Button>
            </div>
          </form>
        ) : (
          <div className="px-6 pb-8 pt-3 sm:px-8">
            <StatusPill active={false}>Password non configurata</StatusPill>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Il tuo account usa un provider di accesso esterno. Gestisci la
              sicurezza dal relativo account.
            </p>
          </div>
        )}
      </section>

      <section>
        <div className="px-6 pb-4 pt-8 sm:px-8">
          <h2 className="font-display text-3xl font-bold uppercase leading-none tracking-tight">
            Verifica a due fattori
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Aggiungi un secondo passaggio all&apos;accesso.
          </p>
        </div>

        <div className="space-y-5 px-6 pb-8 pt-3 sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Authenticator app</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Codici temporanei generati dalla tua app di autenticazione.
              </p>
            </div>
            <StatusPill active={twoFactorEnabled || totpEnabled}>
              {twoFactorEnabled || totpEnabled ? "Attiva" : "Non attiva"}
            </StatusPill>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-4">
            <div>
              <p className="text-sm font-medium">Codici di recupero</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Servono se perdi l&apos;accesso all&apos;app di autenticazione.
              </p>
            </div>
            <StatusPill active={backupCodeEnabled}>
              {backupCodeEnabled ? "Disponibili" : "Non disponibili"}
            </StatusPill>
          </div>

          {!totpEnabled && !totpSetup ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11 gap-2"
              disabled={creatingTotp}
              onClick={handleCreateTotp}
            >
              {creatingTotp ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
              Configura autenticatore
            </Button>
          ) : null}

          {totpSetup && !totpEnabled ? (
            <form
              className="space-y-4 rounded-xl border border-primary/20 bg-primary/5 p-4"
              onSubmit={handleVerifyTotp}
            >
              <div>
                <p className="text-sm font-medium">
                  Completa la configurazione
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Scansiona il QR code dall&apos;app autenticatore. Se non puoi,
                  usa questa chiave:{" "}
                  <code className="font-mono">
                    {totpSetup.secret ?? "non disponibile"}
                  </code>
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="totp-code">Codice a sei cifre</Label>
                  <Input
                    id="totp-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={totpCode}
                    onChange={(event) => setTotpCode(event.target.value)}
                    placeholder="123456"
                  />
                </div>
                <Button
                  type="submit"
                  className="min-h-11 gap-2"
                  disabled={verifyingTotp}
                >
                  {verifyingTotp ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <KeyRound className="h-4 w-4" />
                  )}
                  Conferma codice
                </Button>
              </div>
            </form>
          ) : null}

          {totpSetup?.backupCodes?.length ? (
            <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
              <p className="text-sm font-medium">
                Conserva i codici di recupero
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-xs text-muted-foreground sm:grid-cols-4">
                {totpSetup.backupCodes.map((code) => (
                  <code
                    key={code}
                    className="rounded bg-background px-2 py-1.5 text-center"
                  >
                    {code}
                  </code>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section>
        <div className="px-6 pb-4 pt-8 sm:px-8">
          <h2 className="font-display text-3xl font-bold uppercase leading-none tracking-tight">
            Passkey
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Accedi con il volto, l&apos;impronta o il sistema di sicurezza del
            dispositivo.
          </p>
        </div>

        <div className="divide-y divide-border/70">
          {passkeys.length ? (
            passkeys.map((passkey) => (
              <div
                key={passkey.id}
                className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8"
              >
                <div>
                  <p className="text-sm font-medium">
                    {passkey.name ?? "Passkey senza nome"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {passkey.lastUsedAt
                      ? `Usata il ${new Intl.DateTimeFormat("it-IT", { dateStyle: "medium" }).format(passkey.lastUsedAt)}`
                      : "Non ancora utilizzata"}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11 gap-2 self-start text-muted-foreground hover:text-destructive sm:self-auto"
                  onClick={() => setDeletingPasskey(passkey)}
                >
                  <Trash2 className="h-4 w-4" />
                  Rimuovi
                </Button>
              </div>
            ))
          ) : (
            <p className="px-6 py-5 text-sm text-muted-foreground sm:px-8">
              Non hai ancora passkey configurate.
            </p>
          )}
          <div className="px-6 py-5 sm:px-8">
            <Button
              type="button"
              variant="outline"
              className="min-h-11 gap-2"
              disabled={creatingPasskey}
              onClick={handleCreatePasskey}
            >
              {creatingPasskey ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="h-4 w-4" />
              )}
              Aggiungi passkey
            </Button>
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={Boolean(deletingPasskey)}
        onOpenChange={(open) => {
          if (!open) setDeletingPasskey(null);
        }}
        onConfirm={handleDeletePasskey}
        title="Rimuovere la passkey?"
        description="Non potrai più usare questa passkey per accedere ad Anthon da questo dispositivo."
        confirmText="Sì, rimuovi"
        cancelText="Annulla"
        variant="destructive"
      />
    </div>
  );
}
