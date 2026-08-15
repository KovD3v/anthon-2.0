"use client";

import type { UserResource } from "@clerk/shared/types";
import {
  Camera,
  Check,
  CheckCircle2,
  Loader2,
  Mail,
  Save,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { reportClientError } from "@/lib/client-error-reporting";

interface ProfileIdentitySectionProps {
  user: UserResource;
}

function getInitials(user: UserResource) {
  const initials = [user.firstName, user.lastName]
    .filter(Boolean)
    .map((value) => value?.[0])
    .join("")
    .toUpperCase();

  return (
    initials || user.emailAddresses[0]?.emailAddress[0]?.toUpperCase() || "A"
  );
}

function isVerified(email: UserResource["emailAddresses"][number]) {
  return email.verification?.status === "verified";
}

export function ProfileIdentitySection({ user }: ProfileIdentitySectionProps) {
  const [firstName, setFirstName] = useState(user.firstName ?? "");
  const [lastName, setLastName] = useState(user.lastName ?? "");
  const [username, setUsername] = useState(user.username ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user.imageUrl);
  const [hasImage, setHasImage] = useState(user.hasImage);
  const [emails, setEmails] = useState(user.emailAddresses);
  const [newEmail, setNewEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationEmailId, setVerificationEmailId] = useState<string | null>(
    null,
  );
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [addingEmail, setAddingEmail] = useState(false);
  const [preparingEmailId, setPreparingEmailId] = useState<string | null>(null);
  const [verifyingEmail, setVerifyingEmail] = useState(false);

  useEffect(() => {
    setFirstName(user.firstName ?? "");
    setLastName(user.lastName ?? "");
    setUsername(user.username ?? "");
    setAvatarUrl(user.imageUrl);
    setHasImage(user.hasImage);
    setEmails(user.emailAddresses);
  }, [
    user.emailAddresses,
    user.firstName,
    user.hasImage,
    user.imageUrl,
    user.lastName,
    user.username,
  ]);

  const refreshUser = async () => {
    const refreshedUser = await user.reload();
    setFirstName(refreshedUser.firstName ?? "");
    setLastName(refreshedUser.lastName ?? "");
    setUsername(refreshedUser.username ?? "");
    setAvatarUrl(refreshedUser.imageUrl);
    setHasImage(refreshedUser.hasImage);
    setEmails(refreshedUser.emailAddresses);
  };

  const handleProfileSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingProfile(true);

    try {
      const updatedUser = await user.update({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        ...(user.username !== null
          ? { username: username.trim() || undefined }
          : {}),
      });
      setFirstName(updatedUser.firstName ?? "");
      setLastName(updatedUser.lastName ?? "");
      setUsername(updatedUser.username ?? "");
      toast.success("Profilo aggiornato");
    } catch (error) {
      reportClientError(error, { source: "profile.update_identity" });
      toast.error("Impossibile aggiornare il profilo");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAvatarChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setSavingAvatar(true);
    try {
      await user.setProfileImage({ file });
      await refreshUser();
      toast.success("Immagine aggiornata");
    } catch (error) {
      reportClientError(error, { source: "profile.update_avatar" });
      toast.error("Impossibile aggiornare l'immagine");
    } finally {
      setSavingAvatar(false);
    }
  };

  const handleAvatarRemove = async () => {
    setSavingAvatar(true);
    try {
      await user.setProfileImage({ file: null });
      await refreshUser();
      toast.success("Immagine rimossa");
    } catch (error) {
      reportClientError(error, { source: "profile.remove_avatar" });
      toast.error("Impossibile rimuovere l'immagine");
    } finally {
      setSavingAvatar(false);
    }
  };

  const beginEmailVerification = async (emailId: string) => {
    const email = emails.find((item) => item.id === emailId);
    if (!email) return;

    setPreparingEmailId(emailId);
    try {
      const preparedEmail = await email.prepareVerification({
        strategy: "email_code",
      });
      setEmails((current) =>
        current.map((item) => (item.id === emailId ? preparedEmail : item)),
      );
      setVerificationEmailId(emailId);
      setVerificationCode("");
      toast.success("Codice di verifica inviato");
    } catch (error) {
      reportClientError(error, {
        source: "profile.prepare_email_verification",
      });
      toast.error("Impossibile inviare il codice di verifica");
    } finally {
      setPreparingEmailId(null);
    }
  };

  const handleEmailAdd = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const emailValue = newEmail.trim();
    if (!emailValue) return;

    setAddingEmail(true);
    try {
      const email = await user.createEmailAddress({ email: emailValue });
      const preparedEmail = isVerified(email)
        ? email
        : await email.prepareVerification({ strategy: "email_code" });

      setEmails((current) => [
        ...current.filter((item) => item.id !== preparedEmail.id),
        preparedEmail,
      ]);
      setNewEmail("");
      if (!isVerified(preparedEmail)) {
        setVerificationEmailId(preparedEmail.id);
        setVerificationCode("");
      }
      toast.success(
        isVerified(preparedEmail)
          ? "Email aggiunta"
          : "Email aggiunta: verifica il codice ricevuto",
      );
    } catch (error) {
      reportClientError(error, { source: "profile.add_email" });
      toast.error("Impossibile aggiungere l'email");
    } finally {
      setAddingEmail(false);
    }
  };

  const handleEmailVerify = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!verificationEmailId || !verificationCode.trim()) return;

    const email = emails.find((item) => item.id === verificationEmailId);
    if (!email) return;

    setVerifyingEmail(true);
    try {
      const verifiedEmail = await email.attemptVerification({
        code: verificationCode.trim(),
      });
      setEmails((current) =>
        current.map((item) =>
          item.id === verifiedEmail.id ? verifiedEmail : item,
        ),
      );
      setVerificationEmailId(null);
      setVerificationCode("");
      toast.success("Email verificata");
    } catch (error) {
      reportClientError(error, { source: "profile.verify_email" });
      toast.error("Codice non valido o scaduto");
    } finally {
      setVerifyingEmail(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-border/70 bg-card/70 shadow-none">
        <div className="border-b border-border/70 bg-muted/25 px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-primary">
                Identità
              </p>
              <h2 className="mt-2 font-display text-2xl font-bold uppercase tracking-tight">
                Il tuo profilo
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                Il nome e l&apos;immagine che Anthon userà per riconoscerti.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
              <ShieldCheck className="h-3.5 w-3.5" />
              Account personale
            </div>
          </div>
        </div>

        <div className="grid gap-6 px-6 py-6 lg:grid-cols-[auto_1fr]">
          <div className="flex flex-col items-center gap-3 lg:items-start">
            <div className="relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-3xl border border-primary/20 bg-primary/10 font-display text-3xl font-bold text-primary ring-8 ring-primary/5">
              {hasImage ? (
                <div
                  role="img"
                  aria-label="Immagine del profilo"
                  className="h-full w-full bg-cover bg-center"
                  style={{ backgroundImage: `url("${avatarUrl}")` }}
                />
              ) : (
                <span>{getInitials(user)}</span>
              )}
            </div>
            <div className="flex flex-wrap justify-center gap-2 lg:justify-start">
              <label
                htmlFor="profile-avatar"
                className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border bg-background px-3 text-sm font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground has-[:focus-visible]:border-ring has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50"
              >
                {savingAvatar ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
                Cambia foto
              </label>
              <Input
                id="profile-avatar"
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={savingAvatar}
                onChange={handleAvatarChange}
              />
              {hasImage ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11 gap-2 text-muted-foreground hover:text-destructive"
                  disabled={savingAvatar}
                  onClick={handleAvatarRemove}
                >
                  <Trash2 className="h-4 w-4" />
                  Rimuovi
                </Button>
              ) : null}
            </div>
          </div>

          <form className="space-y-5" onSubmit={handleProfileSave}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="profile-first-name">Nome</Label>
                <Input
                  id="profile-first-name"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  autoComplete="given-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-last-name">Cognome</Label>
                <Input
                  id="profile-last-name"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  autoComplete="family-name"
                />
              </div>
            </div>

            {user.username !== null ? (
              <div className="space-y-2">
                <Label htmlFor="profile-username">Username</Label>
                <Input
                  id="profile-username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                />
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-4">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Le modifiche al profilo vengono salvate nel tuo account.
              </p>
              <Button
                type="submit"
                className="min-h-11 gap-2"
                disabled={savingProfile}
              >
                {savingProfile ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Salva profilo
              </Button>
            </div>
          </form>
        </div>
      </Card>

      <Card className="overflow-hidden border-border/70 bg-card/70 shadow-none">
        <div className="border-b border-border/70 bg-muted/25 px-6 py-5">
          <div className="flex items-start gap-3">
            <Mail className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <h2 className="font-display text-2xl font-bold uppercase tracking-tight">
                Indirizzi email
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Usa un indirizzo verificato per proteggere e recuperare il tuo
                account.
              </p>
            </div>
          </div>
        </div>

        <div className="divide-y divide-border/70">
          {emails.map((email) => {
            const verified = isVerified(email);
            const isPrimary = email.id === user.primaryEmailAddressId;

            return (
              <div key={email.id} className="space-y-3 px-6 py-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                      <Mail className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {email.emailAddress}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {isPrimary ? <span>Principale</span> : null}
                        {verified ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Verificata
                          </span>
                        ) : (
                          <span className="text-amber-700 dark:text-amber-400">
                            Da verificare
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {!verified ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11"
                      disabled={preparingEmailId === email.id}
                      onClick={() => beginEmailVerification(email.id)}
                    >
                      {preparingEmailId === email.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Invia codice"
                      )}
                    </Button>
                  ) : null}
                </div>

                {verificationEmailId === email.id ? (
                  <form
                    className="flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-end"
                    onSubmit={handleEmailVerify}
                  >
                    <div className="flex-1 space-y-2">
                      <Label htmlFor={`verification-code-${email.id}`}>
                        Codice di verifica
                      </Label>
                      <Input
                        id={`verification-code-${email.id}`}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        value={verificationCode}
                        onChange={(event) =>
                          setVerificationCode(event.target.value)
                        }
                        placeholder="123456"
                      />
                    </div>
                    <Button
                      type="submit"
                      className="min-h-11 gap-2"
                      disabled={verifyingEmail || !verificationCode.trim()}
                    >
                      {verifyingEmail ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                      Verifica
                    </Button>
                  </form>
                ) : null}
              </div>
            );
          })}

          <form className="space-y-3 px-6 py-5" onSubmit={handleEmailAdd}>
            <div className="space-y-2">
              <Label htmlFor="profile-new-email">Aggiungi un indirizzo</Label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Input
                  id="profile-new-email"
                  type="email"
                  value={newEmail}
                  onChange={(event) => setNewEmail(event.target.value)}
                  placeholder="nome@esempio.it"
                  autoComplete="email"
                  className="min-h-11 flex-1"
                />
                <Button
                  type="submit"
                  variant="outline"
                  className="min-h-11"
                  disabled={addingEmail || !newEmail.trim()}
                >
                  {addingEmail ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Aggiungi email"
                  )}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </Card>

      <Card className="border-border/70 bg-muted/20 p-6 shadow-none">
        <div className="flex items-start gap-3">
          <UserRound className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <h2 className="font-display text-lg font-bold uppercase tracking-tight">
              ID utente
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Identificativo tecnico del tuo account Anthon.
            </p>
            <code className="mt-3 block break-all rounded-lg border border-border/70 bg-background/70 px-3 py-2 font-mono text-xs text-muted-foreground">
              {user.id}
            </code>
          </div>
        </div>
      </Card>
    </div>
  );
}
